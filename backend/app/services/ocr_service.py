import hashlib
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import shutil
import time
from typing import Any
from uuid import uuid4

import cv2
from dotenv import load_dotenv
import numpy as np
from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from app.database import BASE_DIR, TEMP_OCR_DIR, UPLOADS_DIR, ensure_storage_dirs
from app.schemas import (
    OCRAnggotaDraft,
    OCRExtractionResponse,
    OCRFieldIssue,
    OCRIdentitasDraft,
    parse_flexible_date,
    strip_clean,
)

BACKEND_ENV_FILE = BASE_DIR / ".env"
_ENV_LAST_MTIME_NS: int | None = None


def _sync_backend_env() -> None:
    """Load backend/.env initially and reload automatically when its mtime changes."""
    global _ENV_LAST_MTIME_NS
    if not BACKEND_ENV_FILE.is_file():
        return

    try:
        current_mtime_ns = BACKEND_ENV_FILE.stat().st_mtime_ns
    except OSError:
        return

    if _ENV_LAST_MTIME_NS is None:
        # Preserve already-exported env vars on startup.
        load_dotenv(BACKEND_ENV_FILE, override=False)
        _ENV_LAST_MTIME_NS = current_mtime_ns
        return

    if current_mtime_ns != _ENV_LAST_MTIME_NS:
        load_dotenv(BACKEND_ENV_FILE, override=True)
        _ENV_LAST_MTIME_NS = current_mtime_ns


_sync_backend_env()

logger = logging.getLogger("uvicorn.error")


def _log_ocr(level: str, message: str, *args: Any) -> None:
    formatted = message % args if args else message
    if logger.handlers or logging.getLogger().handlers:
        getattr(logger, level)(formatted)
    else:
        print(f"{level.upper()}: {formatted}", flush=True)


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_OCR_IMAGE_DIMENSION = 1000
PREPROCESSED_JPEG_QUALITY = 70
DEFAULT_GEMINI_OCR_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_FALLBACK_MODELS: tuple[str, ...] = (
    "gemini-3.8-flash",
    "gemini-3.0-flash-lite",
    "gemini-2.5-flash-lite",
)
GEMINI_REQUEST_TIMEOUT_SECONDS = 45.0
GEMINI_REQUEST_TIMEOUT_MS = int(GEMINI_REQUEST_TIMEOUT_SECONDS * 1000)
GEMINI_MAX_OUTPUT_TOKENS = 2048
GEMINI_503_RETRY_DELAYS: tuple[float, ...] = (1.0, 2.0, 3.0)
GEMINI_LIMIT_RETRY_DELAYS: tuple[float, ...] = (1.0,)
_SDK_DISCOVERY_CACHE_TTL_SECONDS = 300.0
_SDK_DISCOVERED_FLASH_MODELS_CACHE: dict[str, tuple[float, list[str]]] = {}
_MAX_SDK_DISCOVERED_EXTRAS = 2
_EXCLUDED_DISCOVERY_TOKENS = (
    "live",
    "tts",
    "image",
    "audio",
    "embedding",
    "robotics",
    "computer-use",
    "customtools",
    "aqa",
)


def _get_confidence_threshold() -> float:
    raw = os.getenv("OCR_CONFIDENCE_THRESHOLD", "0.80").strip()
    try:
        return float(raw)
    except ValueError:
        return 0.80


DEFAULT_CONFIDENCE_THRESHOLD = _get_confidence_threshold()

_PLACEHOLDER_KEY_MARKERS = ("your_", "isi_", "placeholder", "example", "changeme")


class GeminiIdentitasSchema(BaseModel):
    no_kk: str = ""
    kk: str = ""
    alm: str = ""
    rt_rw: str = ""
    desa: str = ""
    kec: str = ""
    kab: str = ""
    pos: str = ""
    prov: str = ""


class GeminiAnggotaSchema(BaseModel):
    nama: str = ""
    nik: str = ""
    jk: str = ""
    tpt_lhr: str = ""
    tgl_lhr: str = ""
    agama: str = ""
    pend: str = ""
    kerja: str = ""
    kawin: str = ""
    hub: str = ""
    wn: str = "WNI"
    ayah: str = ""
    ibu: str = ""


class GeminiKKExtractionSchema(BaseModel):
    identitas: GeminiIdentitasSchema
    anggota: list[GeminiAnggotaSchema] = Field(default_factory=list)
    ragu: list[str] = Field(default_factory=list)


def _get_gemini_api_key() -> str:
    _sync_backend_env()
    raw_key = os.getenv("GEMINI_API_KEY", "").strip().strip("\"'")
    if not raw_key:
        return ""
    lowered = raw_key.lower()
    if any(marker in lowered for marker in _PLACEHOLDER_KEY_MARKERS):
        return ""
    return raw_key


def _mask_secret(secret: str) -> str | None:
    if not secret:
        return None
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}...{secret[-4:]}"


def _normalize_gemini_model_name(raw_name: str) -> str:
    return raw_name.strip().removeprefix("models/").strip()


def _get_gemini_model_candidates() -> list[str]:
    """Build ordered deduplicated Gemini models starting from GEMINI_OCR_MODEL."""
    _sync_backend_env()
    primary = _normalize_gemini_model_name(
        os.getenv("GEMINI_OCR_MODEL", DEFAULT_GEMINI_OCR_MODEL) or DEFAULT_GEMINI_OCR_MODEL
    )
    if not primary:
        primary = DEFAULT_GEMINI_OCR_MODEL

    custom_fallbacks = os.getenv("GEMINI_OCR_FALLBACK_MODELS", "").strip()
    if custom_fallbacks:
        fallback_list = [
            _normalize_gemini_model_name(item)
            for item in custom_fallbacks.split(",")
            if _normalize_gemini_model_name(item)
        ]
    else:
        fallback_list = list(DEFAULT_GEMINI_FALLBACK_MODELS)

    ordered: list[str] = []
    for candidate in [primary, *fallback_list]:
        if candidate and candidate not in ordered:
            ordered.append(candidate)
    return ordered


def get_ocr_configuration_status() -> dict[str, Any]:
    """Return non-secret OCR configuration readiness for startup logging and /api/ocr/status."""
    api_key = _get_gemini_api_key()
    gemini_sdk_installed = importlib.util.find_spec("google.genai") is not None
    model_candidates = _get_gemini_model_candidates()
    gemini_model = model_candidates[0]

    tesseract_cmd = os.getenv("TESSERACT_CMD", "").strip()
    pytesseract_installed = importlib.util.find_spec("pytesseract") is not None
    tesseract_bin_found = (
        Path(tesseract_cmd).is_file()
        if tesseract_cmd
        else shutil.which("tesseract") is not None
    )
    tesseract_available = pytesseract_installed and tesseract_bin_found

    if api_key and gemini_sdk_installed:
        active_engine = "gemini"
    elif tesseract_available:
        active_engine = "tesseract"
    else:
        active_engine = "unconfigured"

    return {
        "env_file_path": str(BACKEND_ENV_FILE),
        "env_file_exists": BACKEND_ENV_FILE.is_file(),
        "gemini_configured": bool(api_key),
        "gemini_key_preview": _mask_secret(api_key),
        "gemini_sdk_installed": gemini_sdk_installed,
        "gemini_model": gemini_model,
        "gemini_fallback_models": model_candidates[1:],
        "tesseract_available": tesseract_available,
        "active_engine": active_engine,
        "confidence_threshold": _get_confidence_threshold(),
    }

REQUIRED_IDENTITAS_FIELDS = (
    "no_kk",
    "nama_kepala_keluarga",
    "alamat",
    "rt_rw",
    "desa_kelurahan",
    "kecamatan",
    "kabupaten_kota",
    "provinsi",
)

REQUIRED_ANGGOTA_FIELDS = (
    "nik",
    "nama_lengkap",
    "jenis_kelamin",
    "tempat_lahir",
    "tanggal_lahir",
    "agama",
    "pendidikan",
    "jenis_pekerjaan",
    "status_perkawinan",
    "status_hubungan",
    "kewarganegaraan",
)

GEMINI_KK_PROMPT = """
Ekstrak Kartu Keluarga Indonesia ke JSON ringkas sesuai schema:
- identitas: {no_kk, kk (nama kepala keluarga), alm (alamat), rt_rw, desa, kec, kab, pos, prov}.
- anggota: list objek {nama, nik, jk (LAKI-LAKI/PEREMPUAN), tpt_lhr, tgl_lhr (YYYY-MM-DD), agama, pend, kerja, kawin, hub, wn, ayah, ibu}. Abaikan baris kosong/"-".
- ragu: list path buram jika ada (mis. ["identitas.no_kk", "anggota.0.nik"]), [] jika jelas.
Jangan mengarang teks buram; isi "" jika tidak terbaca. Pertahankan digit no_kk/nik apa adanya.
""".strip()


class OCRExtractionError(ValueError):
    """Raised when an uploaded image fails validation or preprocessing."""


def _sanitize_extension(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise OCRExtractionError(
            "Format file tidak didukung. Unggah gambar Kartu Keluarga berformat JPG atau PNG."
        )
    return ".jpg" if ext == ".jpeg" else ext


def validate_and_save_temp_upload(file_bytes: bytes, original_filename: str) -> tuple[str, Path]:
    """Validate uploaded JPG/PNG bytes and store them under storage/temp_ocr."""
    ensure_storage_dirs()

    if not file_bytes:
        raise OCRExtractionError("File yang diunggah kosong.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise OCRExtractionError("Ukuran file melebihi batas maksimal 10 MB.")

    ext = _sanitize_extension(original_filename)
    temp_filename = f"{uuid4().hex}{ext}"
    dest_path = TEMP_OCR_DIR / temp_filename
    dest_path.write_bytes(file_bytes)

    try:
        with Image.open(dest_path) as img:
            img.verify()
    except (UnidentifiedImageError, OSError) as exc:
        dest_path.unlink(missing_ok=True)
        raise OCRExtractionError("File bukan gambar JPG/PNG yang valid.") from exc

    return temp_filename, dest_path


def _save_oriented_image(image: Image.Image, target_path: Path) -> None:
    ext = target_path.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        image.save(target_path, format="JPEG", quality=92, optimize=True)
    else:
        image.save(target_path, format="PNG", optimize=True)


def preprocess_kk_image(source_path: Path) -> Path:
    """Auto-rotate portrait KK scans to landscape, cap size to 1000px, and save JPEG 70%."""
    with Image.open(source_path) as pil_img:
        exif_orientation = pil_img.getexif().get(274)
        oriented = ImageOps.exif_transpose(pil_img)
        if oriented.mode != "RGB":
            oriented = oriented.convert("RGB")

    rotated_to_landscape = False
    if oriented.height > oriented.width:
        orig_w, orig_h = oriented.size
        oriented = oriented.rotate(-90, expand=True)
        rotated_to_landscape = True
        _log_ocr(
            "info",
            "OCR Pipeline: orientasi potret (%dx%d) otomatis diputar 90° ke lanskap (%dx%d).",
            orig_w,
            orig_h,
            oriented.width,
            oriented.height,
        )

    # Persist corrected upright landscape image to source_path so Frontend preview also displays horizontally.
    if rotated_to_landscape or (exif_orientation is not None and exif_orientation != 1):
        _save_oriented_image(oriented, source_path)

    max_side = max(oriented.width, oriented.height)
    if max_side > MAX_OCR_IMAGE_DIMENSION:
        scale = MAX_OCR_IMAGE_DIMENSION / max_side
        resized_w = max(1, int(round(oriented.width * scale)))
        resized_h = max(1, int(round(oriented.height * scale)))
        oriented = oriented.resize((resized_w, resized_h), Image.Resampling.LANCZOS)

    bgr = cv2.cvtColor(np.array(oriented), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, d=5, sigmaColor=40, sigmaSpace=40)

    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Mild unsharp masking preserves dense KK table text at <= 1000px JPEG.
    blurred = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.2)
    sharpened = cv2.addWeighted(enhanced, 1.35, blurred, -0.35, 0)

    pil_gray = Image.fromarray(sharpened)
    pil_gray = ImageEnhance.Contrast(pil_gray).enhance(1.12)

    preprocessed_path = source_path.with_name(f"{source_path.stem}_preprocessed.jpg")
    pil_gray.save(
        preprocessed_path,
        format="JPEG",
        quality=PREPROCESSED_JPEG_QUALITY,
        optimize=True,
    )
    return preprocessed_path


def promote_temp_image_to_upload(temp_filename: str, no_kk: str) -> str | None:
    """Move a confirmed temp OCR image to storage/uploads and return its static URL path."""
    ensure_storage_dirs()
    safe_name = Path(temp_filename).name
    if not safe_name:
        return None

    source_path = TEMP_OCR_DIR / safe_name
    if not source_path.is_file():
        return None

    ext = source_path.suffix.lower() or ".jpg"
    clean_kk = re.sub(r"\D", "", no_kk) or "unknown"
    dest_name = f"kk_{clean_kk}_{uuid4().hex[:8]}{ext}"
    dest_path = UPLOADS_DIR / dest_name
    shutil.move(str(source_path), str(dest_path))

    for suffix in ("_preprocessed.jpg", "_preprocessed.png"):
        source_path.with_name(f"{source_path.stem}{suffix}").unlink(missing_ok=True)

    return f"/storage/uploads/{dest_name}"


def _normalize_date_to_iso(raw_date: str) -> tuple[str, bool]:
    cleaned = strip_clean(raw_date)
    if not cleaned:
        return "", False
    try:
        parsed = parse_flexible_date(cleaned)
        return parsed.isoformat(), True
    except ValueError:
        return cleaned, False


def _normalize_gender(raw_gender: str) -> str:
    upper = strip_clean(raw_gender).upper()
    if upper in {"L", "LK", "LAKI", "LAKI-LAKI", "LAKI LAKI"}:
        return "LAKI-LAKI"
    if upper in {"P", "PR", "PEREMPUAN", "WANITA"}:
        return "PEREMPUAN"
    return upper


def _strip_json_fences(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _discover_sdk_flash_models(client: Any, cache_key: str) -> list[str]:
    """Query active generateContent Flash models from the SDK as an emergency fallback pool."""
    now = time.monotonic()
    cached = _SDK_DISCOVERED_FLASH_MODELS_CACHE.get(cache_key)
    if cached and (now - cached[0]) < _SDK_DISCOVERY_CACHE_TTL_SECONDS:
        return list(cached[1])

    discovered: list[str] = []
    try:
        for model in client.models.list():
            raw_name = getattr(model, "name", None)
            if not isinstance(raw_name, str):
                continue
            model_id = _normalize_gemini_model_name(raw_name)
            lowered = model_id.lower()
            if "gemini" not in lowered or "flash" not in lowered:
                continue
            if any(token in lowered for token in _EXCLUDED_DISCOVERY_TOKENS):
                continue
            actions = getattr(model, "supported_actions", None)
            if isinstance(actions, list) and actions and "generateContent" not in actions:
                continue
            if model_id and model_id not in discovered:
                discovered.append(model_id)
    except Exception:
        return []

    def _sort_key(name: str) -> tuple[bool, bool, tuple[int, ...], str]:
        lowered = name.lower()
        version_parts = tuple(-int(num) for num in re.findall(r"\d+", lowered))
        return (
            "preview" in lowered or "exp" in lowered,
            "lite" in lowered,
            version_parts,
            lowered,
        )

    discovered.sort(key=_sort_key)
    if discovered:
        _SDK_DISCOVERED_FLASH_MODELS_CACHE[cache_key] = (now, discovered)
    return list(discovered)


def _extract_error_status_code(exc: Exception) -> int | None:
    for attr in ("code", "status_code"):
        val = getattr(exc, attr, None)
        if isinstance(val, int) and val > 0:
            return val
    match = re.search(r"\b(400|401|403|404|408|429|500|502|503|504)\b", str(exc))
    return int(match.group(1)) if match else None


def _classify_gemini_error(exc: Exception) -> tuple[str, int | None, str]:
    """Classify Gemini API errors as 'auth', 'missing_model', 'retryable_503', 'retryable_limit', or 'other'."""
    status_code = _extract_error_status_code(exc)
    status_text = strip_clean(str(getattr(exc, "status", "") or ""))
    message_text = strip_clean(str(getattr(exc, "message", "") or ""))
    exc_type_name = type(exc).__name__.upper()
    combined = f"{exc_type_name} {status_text} {message_text} {exc}".upper()

    if (
        status_code in {401, 403}
        or "API_KEY_INVALID" in combined
        or "API KEY NOT VALID" in combined
        or "PERMISSION_DENIED" in combined
    ):
        kind = "auth"
    elif (
        status_code == 404
        or "NOT_FOUND" in combined
        or "IS NOT FOUND" in combined
        or "NOT SUPPORTED FOR" in combined
    ):
        kind = "missing_model"
    elif (
        status_code in {408, 503, 504}
        or isinstance(exc, TimeoutError)
        or "TIMEOUT" in exc_type_name
        or "TIMED OUT" in combined
        or "DEADLINE_EXCEEDED" in combined
        or "UNAVAILABLE" in combined
        or "HIGH DEMAND" in combined
        or "OVERLOADED" in combined
    ):
        kind = "retryable_503"
    elif (
        status_code in {429, 500, 502}
        or isinstance(exc, ConnectionError)
        or "RESOURCE_EXHAUSTED" in combined
        or "TOO MANY REQUESTS" in combined
        or "RATE LIMIT" in combined
    ):
        kind = "retryable_limit"
    else:
        kind = "other"

    detail = message_text or status_text or str(exc) or type(exc).__name__
    compact_detail = detail[:140] + ("..." if len(detail) > 140 else "")
    prefix = f"{status_code} " if status_code else ""
    summary = f"{prefix}{compact_detail}".strip()
    return kind, status_code, summary


def _detect_image_mime_type(image_path: Path) -> str:
    ext = image_path.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    return "image/png"


def _invoke_gemini_model(
    client: Any,
    types_module: Any,
    model_name: str,
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
) -> tuple[dict[str, Any], str]:
    config_kwargs: dict[str, Any] = {
        "response_mime_type": "application/json",
        "response_schema": GeminiKKExtractionSchema,
        "temperature": 0.1,
        "max_output_tokens": GEMINI_MAX_OUTPUT_TOKENS,
    }
    if "2.0" not in model_name.lower() and hasattr(types_module, "ThinkingConfig"):
        config_kwargs["thinking_config"] = types_module.ThinkingConfig(thinking_budget=0)

    contents = [
        types_module.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        GEMINI_KK_PROMPT,
    ]
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types_module.GenerateContentConfig(**config_kwargs),
        )
    except Exception as exc:
        # Guard against models that reject thinking_budget=0 with 400 INVALID_ARGUMENT.
        if (
            _extract_error_status_code(exc) == 400
            and "thinking" in str(exc).lower()
            and "thinking_config" in config_kwargs
        ):
            config_kwargs.pop("thinking_config", None)
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types_module.GenerateContentConfig(**config_kwargs),
            )
        else:
            raise

    raw_output = response.text or ""
    parsed_obj = getattr(response, "parsed", None)
    if isinstance(parsed_obj, BaseModel):
        payload: dict[str, Any] = parsed_obj.model_dump()
    elif isinstance(parsed_obj, dict):
        payload = parsed_obj
    else:
        payload = json.loads(_strip_json_fences(raw_output))
    return payload, raw_output


_SHORT_IDENTITAS_KEYS = {
    "kk": "nama_kepala_keluarga",
    "alm": "alamat",
    "desa": "desa_kelurahan",
    "kec": "kecamatan",
    "kab": "kabupaten_kota",
    "pos": "kode_pos",
    "prov": "provinsi",
}
_SHORT_ANGGOTA_KEYS = {
    "nama": "nama_lengkap",
    "jk": "jenis_kelamin",
    "tpt_lhr": "tempat_lahir",
    "tgl_lhr": "tanggal_lahir",
    "pend": "pendidikan",
    "kerja": "jenis_pekerjaan",
    "kawin": "status_perkawinan",
    "hub": "status_hubungan",
    "wn": "kewarganegaraan",
    "ayah": "nama_ayah",
    "ibu": "nama_ibu",
}


def _pick_first_clean(data: dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = data.get(key)
        if val is not None:
            cleaned = strip_clean(str(val))
            if cleaned:
                return cleaned
    return ""


def _normalize_flagged_field_path(raw_path: str) -> str:
    parts = [part for part in strip_clean(raw_path).split(".") if part]
    if len(parts) == 2 and parts[0] in {"identitas", "kk"}:
        return f"identitas.{_SHORT_IDENTITAS_KEYS.get(parts[1], parts[1])}"
    if len(parts) == 3 and parts[0] in {"anggota", "agt", "anggota_keluarga"}:
        return f"anggota.{parts[1]}.{_SHORT_ANGGOTA_KEYS.get(parts[2], parts[2])}"
    return ".".join(parts)


def _map_gemini_payload_to_draft(
    payload: dict[str, Any],
) -> tuple[OCRIdentitasDraft, list[OCRAnggotaDraft], dict[str, float]]:
    """Map compact or full Gemini JSON payload onto tbl_identitasKK and tbl_anggotaKeluargaKK drafts."""
    identitas_raw: dict[str, Any] = payload.get("identitas") or payload.get("kk") or {}
    identitas = OCRIdentitasDraft(
        no_kk=re.sub(r"\s+", "", _pick_first_clean(identitas_raw, "no_kk")),
        nama_kepala_keluarga=_pick_first_clean(identitas_raw, "kk", "nama_kepala_keluarga"),
        alamat=_pick_first_clean(identitas_raw, "alm", "alamat"),
        rt_rw=_pick_first_clean(identitas_raw, "rt_rw"),
        desa_kelurahan=_pick_first_clean(identitas_raw, "desa", "desa_kelurahan"),
        kecamatan=_pick_first_clean(identitas_raw, "kec", "kecamatan"),
        kabupaten_kota=_pick_first_clean(identitas_raw, "kab", "kabupaten_kota"),
        kode_pos=re.sub(r"\s+", "", _pick_first_clean(identitas_raw, "pos", "kode_pos")),
        provinsi=_pick_first_clean(identitas_raw, "prov", "provinsi"),
    )

    raw_members = payload.get("anggota") or payload.get("agt") or payload.get("anggota_keluarga") or []
    anggota_list: list[OCRAnggotaDraft] = []
    for item in raw_members:
        if not isinstance(item, dict):
            continue
        nama = _pick_first_clean(item, "nama", "nama_lengkap")
        nik = re.sub(r"\s+", "", _pick_first_clean(item, "nik"))
        if not nama and not nik:
            continue
        iso_date, _ = _normalize_date_to_iso(_pick_first_clean(item, "tgl_lhr", "tanggal_lahir"))
        anggota_list.append(
            OCRAnggotaDraft(
                nik=nik,
                nama_lengkap=nama,
                jenis_kelamin=_normalize_gender(_pick_first_clean(item, "jk", "jenis_kelamin")),
                tempat_lahir=_pick_first_clean(item, "tpt_lhr", "tempat_lahir"),
                tanggal_lahir=iso_date,
                agama=_pick_first_clean(item, "agama"),
                pendidikan=_pick_first_clean(item, "pend", "pendidikan"),
                jenis_pekerjaan=_pick_first_clean(item, "kerja", "jenis_pekerjaan"),
                status_perkawinan=_pick_first_clean(item, "kawin", "status_perkawinan"),
                status_hubungan=_pick_first_clean(item, "hub", "status_hubungan"),
                kewarganegaraan=_pick_first_clean(item, "wn", "kewarganegaraan") or "WNI",
                nama_ayah=_pick_first_clean(item, "ayah", "nama_ayah"),
                nama_ibu=_pick_first_clean(item, "ibu", "nama_ibu"),
            )
        )

    confidences: dict[str, float] = {}
    for flagged_path in payload.get("ragu") or []:
        if isinstance(flagged_path, str):
            norm_path = _normalize_flagged_field_path(flagged_path)
            if norm_path:
                confidences[norm_path] = 0.65

    for entry in payload.get("confidence_items") or []:
        if not isinstance(entry, dict):
            continue
        field_path = _normalize_flagged_field_path(str(entry.get("field_path", "")))
        if not field_path:
            continue
        try:
            confidences[field_path] = max(0.0, min(1.0, float(entry.get("confidence", 0.0))))
        except (TypeError, ValueError):
            continue

    raw_conf = payload.get("field_confidences") or {}
    if isinstance(raw_conf, dict):
        for key, val in raw_conf.items():
            try:
                confidences.setdefault(_normalize_flagged_field_path(str(key)), max(0.0, min(1.0, float(val))))
            except (TypeError, ValueError):
                continue

    return identitas, anggota_list, confidences


def _extract_with_gemini(image_path: Path) -> tuple[OCRIdentitasDraft, list[OCRAnggotaDraft], dict[str, float], str] | None:
    api_key = _get_gemini_api_key()
    if not api_key:
        return None

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return None

    candidates = _get_gemini_model_candidates()
    primary_model = candidates[0]
    # Bound each SDK HTTP call to 45s and disable SDK's hidden 5x exponential retry loop.
    http_options = types.HttpOptions(
        timeout=GEMINI_REQUEST_TIMEOUT_MS,
        retry_options=types.HttpRetryOptions(attempts=1),
    )
    client = genai.Client(api_key=api_key, http_options=http_options)
    image_bytes = image_path.read_bytes()
    mime_type = _detect_image_mime_type(image_path)

    extraction_started = time.perf_counter()
    payload: dict[str, Any] | None = None
    raw_output = ""
    winning_model = ""
    last_exc: Exception | None = None
    tried_models: set[str] = set()
    sdk_discovery_checked = False
    index = 0

    while index < len(candidates):
        model_name = candidates[index]
        index += 1
        if model_name in tried_models:
            continue
        tried_models.add(model_name)

        retry_delays_503 = (
            GEMINI_503_RETRY_DELAYS if model_name == primary_model else GEMINI_LIMIT_RETRY_DELAYS
        )
        max_attempts = 1 + max(len(retry_delays_503), len(GEMINI_LIMIT_RETRY_DELAYS))

        for attempt in range(1, max_attempts + 1):
            attempt_started = time.perf_counter()
            _log_ocr(
                "info",
                "Gemini OCR: mencoba model '%s' (percobaan %d/%d, timeout %.0fs)...",
                model_name,
                attempt,
                max_attempts,
                GEMINI_REQUEST_TIMEOUT_SECONDS,
            )
            try:
                payload, raw_output = _invoke_gemini_model(
                    client,
                    types,
                    model_name,
                    image_bytes,
                    mime_type,
                )
                winning_model = model_name
                attempt_elapsed = time.perf_counter() - attempt_started
                suffix = f" [fallback dari {primary_model}]" if model_name != primary_model else ""
                _log_ocr(
                    "info",
                    "Gemini OCR: respons API diterima dari '%s'%s dalam %.2f detik; memvalidasi JSON...",
                    model_name,
                    suffix,
                    attempt_elapsed,
                )
                break
            except Exception as exc:
                last_exc = exc
                attempt_elapsed = time.perf_counter() - attempt_started
                kind, _status_code, summary = _classify_gemini_error(exc)
                if kind == "auth":
                    _log_ocr("error", "Gemini OCR: autentikasi API Key gagal (%s).", summary)
                    raise
                if kind == "missing_model":
                    _log_ocr(
                        "warning",
                        "Gemini OCR: model '%s' tidak tersedia (%s, %.2fs); langsung beralih ke model berikutnya.",
                        model_name,
                        summary,
                        attempt_elapsed,
                    )
                    break
                retry_index = attempt - 1
                if kind == "retryable_503" and retry_index < len(retry_delays_503):
                    delay = retry_delays_503[retry_index]
                    _log_ocr(
                        "warning",
                        "Gemini OCR: model '%s' terkena 503/timeout (%s, %.2fs); retry %d/%d dalam %.0f detik...",
                        model_name,
                        summary,
                        attempt_elapsed,
                        attempt,
                        len(retry_delays_503),
                        delay,
                    )
                    time.sleep(delay)
                    continue
                if kind == "retryable_limit" and retry_index < len(GEMINI_LIMIT_RETRY_DELAYS):
                    delay = GEMINI_LIMIT_RETRY_DELAYS[retry_index]
                    _log_ocr(
                        "warning",
                        "Gemini OCR: model '%s' terkena limit (%s); retry dalam %.1f detik...",
                        model_name,
                        summary,
                        delay,
                    )
                    time.sleep(delay)
                    continue
                _log_ocr(
                    "warning",
                    "Gemini OCR: model '%s' gagal setelah %d percobaan (%s, %.2fs); beralih ke model cadangan berikutnya.",
                    model_name,
                    attempt,
                    summary,
                    attempt_elapsed,
                )
                break

        if payload is not None:
            break

        if index >= len(candidates) and not sdk_discovery_checked:
            sdk_discovery_checked = True
            key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
            added_extras = 0
            for extra_model in _discover_sdk_flash_models(client, key_hash):
                if extra_model not in tried_models and extra_model not in candidates:
                    candidates.append(extra_model)
                    added_extras += 1
                    if added_extras >= _MAX_SDK_DISCOVERED_EXTRAS:
                        break

    if payload is None:
        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Tidak ada model Gemini Flash yang berhasil merespons.")

    identitas, anggota_list, confidences = _map_gemini_payload_to_draft(payload)

    total_elapsed = time.perf_counter() - extraction_started
    _log_ocr(
        "info",
        "Gemini OCR: selesai parsing JSON dari model '%s' (no_kk=%s, anggota=%d orang, total=%.2f detik).",
        winning_model,
        "terbaca" if identitas.no_kk else "kosong",
        len(anggota_list),
        total_elapsed,
    )
    return identitas, anggota_list, confidences, raw_output


def _match_header_field(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            value = strip_clean(match.group(1))
            if value and value != "-":
                return value
    return ""


def _parse_kk_text_to_draft(
    raw_text: str,
    avg_word_conf: float,
) -> tuple[OCRIdentitasDraft, list[OCRAnggotaDraft], dict[str, float]]:
    """Heuristic parser for Indonesian Kartu Keluarga text extracted via Tesseract."""
    no_kk_match = re.search(
        r"(?:KARTU\s+KELUARGA|No\.?)\s*[:.]?\s*(\d[\d\s]{12,19}\d)",
        raw_text,
        flags=re.IGNORECASE,
    )
    no_kk = re.sub(r"\D", "", no_kk_match.group(1)) if no_kk_match else ""
    if not no_kk:
        fallback_kk = re.search(r"\b(\d{15,17})\b", raw_text)
        no_kk = fallback_kk.group(1) if fallback_kk else ""

    identitas = OCRIdentitasDraft(
        no_kk=no_kk,
        nama_kepala_keluarga=_match_header_field(
            raw_text,
            [r"Nama\s+Kepala\s+Keluarga\s*[:.]?\s*([^\n\r]+)"],
        ),
        alamat=_match_header_field(
            raw_text,
            [r"Alamat\s*[:.]?\s*([^\n\r]+)"],
        ),
        rt_rw=_match_header_field(
            raw_text,
            [r"RT\s*/\s*RW\s*[:.]?\s*([0-9/\-\s]+)"],
        ),
        desa_kelurahan=_match_header_field(
            raw_text,
            [r"Desa\s*/\s*Kelurahan\s*[:.]?\s*([^\n\r]+)"],
        ),
        kecamatan=_match_header_field(
            raw_text,
            [r"Kecamatan\s*[:.]?\s*([^\n\r]+)"],
        ),
        kabupaten_kota=_match_header_field(
            raw_text,
            [r"Kabupaten\s*/\s*Kota\s*[:.]?\s*([^\n\r]+)"],
        ),
        kode_pos=_match_header_field(
            raw_text,
            [r"Kode\s+Pos\s*[:.]?\s*(\d{5})"],
        ),
        provinsi=_match_header_field(
            raw_text,
            [r"Provinsi\s*[:.]?\s*([^\n\r]+)"],
        ),
    )

    anggota_list: list[OCRAnggotaDraft] = []
    seen_niks: set[str] = set()

    for line in raw_text.splitlines():
        nik_match = re.search(r"\b(\d{14,18})\b", line)
        if not nik_match:
            continue
        candidate_nik = nik_match.group(1)
        if candidate_nik == no_kk or candidate_nik in seen_niks:
            continue
        seen_niks.add(candidate_nik)

        before_nik = strip_clean(re.sub(r"^\d+\s+", "", line[: nik_match.start()]))
        after_nik = strip_clean(line[nik_match.end() :])

        gender = ""
        if re.search(r"LAKI[\-\s]?LAKI", after_nik, flags=re.IGNORECASE):
            gender = "LAKI-LAKI"
        elif re.search(r"PEREMPUAN", after_nik, flags=re.IGNORECASE):
            gender = "PEREMPUAN"

        date_match = re.search(r"\b(\d{2}[-/]\d{2}[-/]\d{4})\b", after_nik)
        tgl_iso = ""
        if date_match:
            tgl_iso, _ = _normalize_date_to_iso(date_match.group(1))

        agama_match = re.search(
            r"\b(ISLAM|KRISTEN|KATOLIK|HINDU|BUDDHA|KHONGHUCU)\b",
            after_nik,
            flags=re.IGNORECASE,
        )

        anggota_list.append(
            OCRAnggotaDraft(
                nik=candidate_nik,
                nama_lengkap=before_nik,
                jenis_kelamin=gender,
                tanggal_lahir=tgl_iso,
                agama=agama_match.group(1).upper() if agama_match else "",
                kewarganegaraan="WNI" if "WNI" in after_nik.upper() else "",
            )
        )

    confidences: dict[str, float] = {}
    base_conf = round(max(0.1, min(0.95, avg_word_conf)), 2)
    for field_name in OCRIdentitasDraft.model_fields:
        val = getattr(identitas, field_name)
        confidences[f"identitas.{field_name}"] = base_conf if val else 0.0
    for idx, member in enumerate(anggota_list):
        for field_name in OCRAnggotaDraft.model_fields:
            val = getattr(member, field_name)
            confidences[f"anggota.{idx}.{field_name}"] = base_conf if val else 0.0

    return identitas, anggota_list, confidences


def _extract_with_tesseract(
    image_path: Path,
) -> tuple[OCRIdentitasDraft, list[OCRAnggotaDraft], dict[str, float], str] | None:
    try:
        import pytesseract
    except ImportError:
        return None

    tesseract_cmd = os.getenv("TESSERACT_CMD", "").strip()
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    try:
        with Image.open(image_path) as img:
            try:
                data = pytesseract.image_to_data(
                    img,
                    lang="ind+eng",
                    config="--psm 6",
                    output_type=pytesseract.Output.DICT,
                )
            except pytesseract.TesseractError:
                data = pytesseract.image_to_data(
                    img,
                    lang="eng",
                    config="--psm 6",
                    output_type=pytesseract.Output.DICT,
                )
    except (pytesseract.TesseractNotFoundError, pytesseract.TesseractError, OSError):
        return None

    lines_map: dict[tuple[int, int, int], list[str]] = {}
    conf_values: list[float] = []

    total_tokens = len(data.get("text", []))
    for i in range(total_tokens):
        word = (data["text"][i] or "").strip()
        if not word:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines_map.setdefault(key, []).append(word)
        try:
            conf_raw = float(data["conf"][i])
            if conf_raw >= 0:
                conf_values.append(conf_raw / 100.0)
        except (TypeError, ValueError):
            continue

    raw_text = "\n".join(" ".join(words) for words in lines_map.values())
    avg_conf = sum(conf_values) / len(conf_values) if conf_values else 0.5
    identitas, anggota_list, confidences = _parse_kk_text_to_draft(raw_text, avg_conf)
    return identitas, anggota_list, confidences, raw_text


def evaluate_ocr_field_issues(
    identitas: OCRIdentitasDraft,
    anggota_keluarga: list[OCRAnggotaDraft],
    field_confidences: dict[str, float],
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> list[OCRFieldIssue]:
    """Identify low-confidence fields, invalid dates, and non-16-digit KK/NIK values."""
    issues: list[OCRFieldIssue] = []

    no_kk_digits = re.sub(r"\D", "", identitas.no_kk)
    no_kk_conf = field_confidences.get("identitas.no_kk", 1.0 if len(no_kk_digits) == 16 else 0.0)
    if len(no_kk_digits) != 16:
        issues.append(
            OCRFieldIssue(
                field_path="identitas.no_kk",
                confidence=min(no_kk_conf, 0.5),
                reason=f"Nomor KK harus 16 digit (terbaca {len(no_kk_digits)} digit).",
            )
        )
    elif no_kk_conf < threshold:
        issues.append(
            OCRFieldIssue(
                field_path="identitas.no_kk",
                confidence=no_kk_conf,
                reason="Tingkat akurasi pembacaan Nomor KK rendah, harap verifikasi.",
            )
        )

    for field_name in REQUIRED_IDENTITAS_FIELDS:
        if field_name == "no_kk":
            continue
        field_path = f"identitas.{field_name}"
        val = strip_clean(str(getattr(identitas, field_name, "")))
        conf = field_confidences.get(field_path, 0.85 if val else 0.0)
        if not val:
            issues.append(
                OCRFieldIssue(
                    field_path=field_path,
                    confidence=0.0,
                    reason="Field belum terbaca oleh OCR.",
                )
            )
        elif conf < threshold:
            issues.append(
                OCRFieldIssue(
                    field_path=field_path,
                    confidence=conf,
                    reason="Tingkat keyakinan OCR rendah, harap periksa dokumen asli.",
                )
            )

    kode_pos_raw = strip_clean(identitas.kode_pos)
    if kode_pos_raw and not re.fullmatch(r"\d{5}", kode_pos_raw):
        issues.append(
            OCRFieldIssue(
                field_path="identitas.kode_pos",
                confidence=0.4,
                reason="Kode Pos harus terdiri dari 5 digit angka.",
            )
        )

    for idx, member in enumerate(anggota_keluarga):
        nik_digits = re.sub(r"\D", "", member.nik)
        nik_path = f"anggota.{idx}.nik"
        nik_conf = field_confidences.get(nik_path, 1.0 if len(nik_digits) == 16 else 0.0)
        if len(nik_digits) != 16:
            issues.append(
                OCRFieldIssue(
                    field_path=nik_path,
                    confidence=min(nik_conf, 0.5),
                    reason=f"NIK harus 16 digit (terbaca {len(nik_digits)} digit).",
                )
            )
        elif nik_conf < threshold:
            issues.append(
                OCRFieldIssue(
                    field_path=nik_path,
                    confidence=nik_conf,
                    reason="Tingkat akurasi pembacaan NIK rendah, harap verifikasi.",
                )
            )

        for field_name in REQUIRED_ANGGOTA_FIELDS:
            if field_name == "nik":
                continue
            field_path = f"anggota.{idx}.{field_name}"
            val = strip_clean(str(getattr(member, field_name, "")))
            conf = field_confidences.get(field_path, 0.85 if val else 0.0)
            if field_name == "tanggal_lahir":
                _, valid_date = _normalize_date_to_iso(val)
                if not valid_date:
                    issues.append(
                        OCRFieldIssue(
                            field_path=field_path,
                            confidence=min(conf, 0.4),
                            reason="Tanggal lahir kosong atau format tidak valid.",
                        )
                    )
                    continue
            if not val:
                issues.append(
                    OCRFieldIssue(
                        field_path=field_path,
                        confidence=0.0,
                        reason="Field anggota belum terbaca oleh OCR.",
                    )
                )
            elif conf < threshold:
                issues.append(
                    OCRFieldIssue(
                        field_path=field_path,
                        confidence=conf,
                        reason="Tingkat keyakinan OCR rendah, harap verifikasi.",
                    )
                )

    return issues


def process_kk_ocr_upload(file_bytes: bytes, original_filename: str) -> OCRExtractionResponse:
    """Save, preprocess, extract structured KK data, and flag fields needing operator review."""
    temp_filename, saved_path = validate_and_save_temp_upload(file_bytes, original_filename)
    prep_started = time.perf_counter()
    preprocessed_path = preprocess_kk_image(saved_path)
    prep_size_kb = preprocessed_path.stat().st_size / 1024.0
    _log_ocr(
        "info",
        "OCR Pipeline: preprocessing selesai dalam %.2f detik (%s, %.1f KB); memulai ekstraksi...",
        time.perf_counter() - prep_started,
        preprocessed_path.name,
        prep_size_kb,
    )

    preview_url = f"/storage/temp_ocr/{temp_filename}"
    preprocessed_preview_url = f"/storage/temp_ocr/{preprocessed_path.name}"
    warnings: list[str] = []

    extracted = None
    ocr_engine = "unconfigured"
    gemini_failed = False

    try:
        extracted = _extract_with_gemini(preprocessed_path)
        if extracted is not None:
            ocr_engine = "gemini"
    except Exception as exc:
        gemini_failed = True
        warnings.append(f"Gemini Vision OCR gagal ({exc}); mencoba fallback Tesseract.")

    if extracted is None:
        extracted = _extract_with_tesseract(preprocessed_path)
        if extracted is not None:
            ocr_engine = "tesseract"
            if not extracted[1]:
                warnings.append(
                    "Tesseract tidak mendeteksi baris anggota secara otomatis; periksa dan lengkapi daftar anggota."
                )

    if extracted is None:
        identitas = OCRIdentitasDraft()
        anggota_keluarga = [OCRAnggotaDraft()]
        field_confidences: dict[str, float] = {}
        raw_text = None
        if gemini_failed:
            warnings.append(
                "Ekstraksi Gemini Vision mengalami kendala dan Tesseract OCR tidak tersedia. "
                "Periksa GEMINI_API_KEY / kuota API di backend/.env, atau lengkapi data secara manual."
            )
        else:
            warnings.append(
                "Engine OCR belum aktif (set GEMINI_API_KEY di backend/.env atau instal Tesseract OCR). "
                "Gambar telah dipre-processing dan siap diisi manual melalui tampilan split-screen."
            )
    else:
        identitas, anggota_keluarga, field_confidences, raw_text = extracted

    low_confidence_fields = evaluate_ocr_field_issues(
        identitas=identitas,
        anggota_keluarga=anggota_keluarga,
        field_confidences=field_confidences,
    )

    return OCRExtractionResponse(
        ocr_engine=ocr_engine,
        temp_filename=temp_filename,
        preview_url=preview_url,
        preprocessed_preview_url=preprocessed_preview_url,
        identitas=identitas,
        anggota_keluarga=anggota_keluarga,
        field_confidences=field_confidences,
        low_confidence_fields=low_confidence_fields,
        raw_text=raw_text,
        warnings=warnings,
    )
