from datetime import date, datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

KategoriUsia = Literal["Balita", "Usia Sekolah", "Produktif", "Lansia"]
AuditAksi = Literal["CREATE", "UPDATE", "DELETE"]

INDONESIAN_MONTHS: dict[str, int] = {
    "januari": 1,
    "jan": 1,
    "februari": 2,
    "feb": 2,
    "pebruari": 2,
    "maret": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "mei": 5,
    "may": 5,
    "juni": 6,
    "jun": 6,
    "juli": 7,
    "jul": 7,
    "agustus": 8,
    "agu": 8,
    "agt": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "oktober": 10,
    "okt": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "nopember": 11,
    "nop": 11,
    "desember": 12,
    "des": 12,
    "dec": 12,
}


def strip_clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_required_text(value: str, field_label: str) -> str:
    cleaned = strip_clean(value)
    if not cleaned:
        raise ValueError(f"{field_label} wajib diisi.")
    return cleaned


def validate_16_digits(value: str, field_label: str) -> str:
    cleaned = re.sub(r"\s+", "", value)
    if not re.fullmatch(r"\d{16}", cleaned):
        raise ValueError(f"{field_label} harus terdiri dari tepat 16 digit angka.")
    return cleaned


def normalize_rt_rw(value: str) -> str:
    cleaned = strip_clean(value)
    if not cleaned:
        raise ValueError("RT/RW wajib diisi.")
    match = re.fullmatch(r"(\d{1,3}|-)\s*/\s*(\d{1,3}|-)", cleaned)
    if match:
        rt_part, rw_part = match.group(1), match.group(2)
        rt_fmt = rt_part.zfill(3) if rt_part.isdigit() else "-"
        rw_fmt = rw_part.zfill(3) if rw_part.isdigit() else "-"
        return f"{rt_fmt}/{rw_fmt}"
    return cleaned


def parse_flexible_date(value: date | str) -> date:
    """Parse ISO YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, or Indonesian month-name dates."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = strip_clean(str(value))
    if not text:
        raise ValueError("Tanggal lahir wajib diisi.")

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    word_match = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text)
    if word_match:
        day = int(word_match.group(1))
        month = INDONESIAN_MONTHS.get(word_match.group(2).lower())
        year = int(word_match.group(3))
        if month is not None:
            return date(year, month, day)

    raise ValueError(f"Format tanggal lahir tidak dikenali: '{text}'. Gunakan YYYY-MM-DD atau DD-MM-YYYY.")


def hitung_umur_dan_kategori(
    tanggal_lahir: date,
    reference_date: date | None = None,
) -> tuple[int, KategoriUsia]:
    """Compute exact age in years and map to Indonesian demographic brackets.

    Brackets: 0-4 Balita, 5-17 Usia Sekolah, 18-59 Produktif, 60+ Lansia.
    """
    ref = reference_date or date.today()
    umur = ref.year - tanggal_lahir.year - ((ref.month, ref.day) < (tanggal_lahir.month, tanggal_lahir.day))
    umur = max(0, umur)

    if umur <= 4:
        return umur, "Balita"
    if umur <= 17:
        return umur, "Usia Sekolah"
    if umur <= 59:
        return umur, "Produktif"
    return umur, "Lansia"


class AnggotaBase(BaseModel):
    nik: str = Field(..., min_length=16, max_length=20)
    nama_lengkap: str = Field(..., min_length=1, max_length=150)
    jenis_kelamin: str = Field(..., min_length=1, max_length=30)
    tempat_lahir: str = Field(..., min_length=1, max_length=100)
    tanggal_lahir: date
    agama: str = Field(..., min_length=1, max_length=50)
    pendidikan: str = Field(..., min_length=1, max_length=100)
    jenis_pekerjaan: str = Field(..., min_length=1, max_length=100)
    status_perkawinan: str = Field(..., min_length=1, max_length=50)
    status_hubungan: str = Field(..., min_length=1, max_length=80)
    kewarganegaraan: str = Field(default="WNI", min_length=1, max_length=20)
    nama_ayah: str = Field(default="-", max_length=150)
    nama_ibu: str = Field(default="-", max_length=150)

    @field_validator("nik", mode="before")
    @classmethod
    def _validate_nik(cls, value: str) -> str:
        return validate_16_digits(str(value), "NIK")

    @field_validator("tanggal_lahir", mode="before")
    @classmethod
    def _parse_tanggal_lahir(cls, value: date | str) -> date:
        parsed = parse_flexible_date(value)
        if parsed > date.today():
            raise ValueError("Tanggal lahir tidak boleh di masa depan.")
        return parsed

    @field_validator(
        "nama_lengkap",
        "jenis_kelamin",
        "tempat_lahir",
        "agama",
        "pendidikan",
        "jenis_pekerjaan",
        "status_perkawinan",
        "status_hubungan",
        "kewarganegaraan",
        mode="before",
    )
    @classmethod
    def _clean_required_strings(cls, value: str, info) -> str:
        return normalize_required_text(str(value), info.field_name)

    @field_validator("nama_ayah", "nama_ibu", mode="before")
    @classmethod
    def _clean_parent_names(cls, value: str | None) -> str:
        cleaned = strip_clean(value or "")
        return cleaned or "-"


class AnggotaCreate(AnggotaBase):
    pass


class AnggotaUpdate(BaseModel):
    nik: str | None = Field(default=None, min_length=16, max_length=20)
    nama_lengkap: str | None = Field(default=None, max_length=150)
    jenis_kelamin: str | None = Field(default=None, max_length=30)
    tempat_lahir: str | None = Field(default=None, max_length=100)
    tanggal_lahir: date | None = None
    agama: str | None = Field(default=None, max_length=50)
    pendidikan: str | None = Field(default=None, max_length=100)
    jenis_pekerjaan: str | None = Field(default=None, max_length=100)
    status_perkawinan: str | None = Field(default=None, max_length=50)
    status_hubungan: str | None = Field(default=None, max_length=80)
    kewarganegaraan: str | None = Field(default=None, max_length=20)
    nama_ayah: str | None = Field(default=None, max_length=150)
    nama_ibu: str | None = Field(default=None, max_length=150)

    @field_validator("nik", mode="before")
    @classmethod
    def _validate_optional_nik(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_16_digits(str(value), "NIK")

    @field_validator("tanggal_lahir", mode="before")
    @classmethod
    def _parse_optional_tanggal_lahir(cls, value: date | str | None) -> date | None:
        if value is None:
            return None
        parsed = parse_flexible_date(value)
        if parsed > date.today():
            raise ValueError("Tanggal lahir tidak boleh di masa depan.")
        return parsed

    @field_validator(
        "nama_lengkap",
        "jenis_kelamin",
        "tempat_lahir",
        "agama",
        "pendidikan",
        "jenis_pekerjaan",
        "status_perkawinan",
        "status_hubungan",
        "kewarganegaraan",
        mode="before",
    )
    @classmethod
    def _clean_optional_required_strings(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        return normalize_required_text(str(value), info.field_name)

    @field_validator("nama_ayah", "nama_ibu", mode="before")
    @classmethod
    def _clean_optional_parent_names(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return strip_clean(value) or "-"


class AnggotaOut(AnggotaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    no_kk: str

    @computed_field
    @property
    def umur(self) -> int:
        age, _ = hitung_umur_dan_kategori(self.tanggal_lahir)
        return age

    @computed_field
    @property
    def kategori_usia(self) -> KategoriUsia:
        _, category = hitung_umur_dan_kategori(self.tanggal_lahir)
        return category


class IdentitasKKBase(BaseModel):
    no_kk: str = Field(..., min_length=16, max_length=20)
    nama_kepala_keluarga: str = Field(..., min_length=1, max_length=150)
    alamat: str = Field(..., min_length=1)
    rt_rw: str = Field(..., min_length=1, max_length=20)
    desa_kelurahan: str = Field(..., min_length=1, max_length=100)
    kecamatan: str = Field(..., min_length=1, max_length=100)
    kabupaten_kota: str = Field(..., min_length=1, max_length=100)
    kode_pos: str = Field(default="", max_length=10)
    provinsi: str = Field(..., min_length=1, max_length=100)
    file_gambar_path: str | None = Field(default=None, max_length=500)

    @field_validator("no_kk", mode="before")
    @classmethod
    def _validate_no_kk(cls, value: str) -> str:
        return validate_16_digits(str(value), "Nomor KK")

    @field_validator("rt_rw", mode="before")
    @classmethod
    def _validate_rt_rw(cls, value: str) -> str:
        return normalize_rt_rw(str(value))

    @field_validator("kode_pos", mode="before")
    @classmethod
    def _validate_kode_pos(cls, value: str | None) -> str:
        cleaned = re.sub(r"\s+", "", value or "")
        if cleaned and not re.fullmatch(r"\d{5}", cleaned):
            raise ValueError("Kode Pos harus terdiri dari 5 digit angka.")
        return cleaned

    @field_validator(
        "nama_kepala_keluarga",
        "alamat",
        "desa_kelurahan",
        "kecamatan",
        "kabupaten_kota",
        "provinsi",
        mode="before",
    )
    @classmethod
    def _clean_required_fields(cls, value: str, info) -> str:
        return normalize_required_text(str(value), info.field_name)


class KKCreate(IdentitasKKBase):
    anggota_keluarga: list[AnggotaCreate] = Field(default_factory=list)
    temp_ocr_filename: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _check_internal_duplicate_nik(self) -> "KKCreate":
        seen: set[str] = set()
        for idx, member in enumerate(self.anggota_keluarga):
            if member.nik in seen:
                raise ValueError(
                    f"Duplikasi NIK internal pada daftar anggota baris ke-{idx + 1}: {member.nik}."
                )
            seen.add(member.nik)
        return self


class KKUpdate(BaseModel):
    no_kk: str | None = Field(default=None, min_length=16, max_length=20)
    nama_kepala_keluarga: str | None = Field(default=None, max_length=150)
    alamat: str | None = None
    rt_rw: str | None = Field(default=None, max_length=20)
    desa_kelurahan: str | None = Field(default=None, max_length=100)
    kecamatan: str | None = Field(default=None, max_length=100)
    kabupaten_kota: str | None = Field(default=None, max_length=100)
    kode_pos: str | None = Field(default=None, max_length=10)
    provinsi: str | None = Field(default=None, max_length=100)
    file_gambar_path: str | None = Field(default=None, max_length=500)

    @field_validator("no_kk", mode="before")
    @classmethod
    def _validate_optional_no_kk(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_16_digits(str(value), "Nomor KK")

    @field_validator("rt_rw", mode="before")
    @classmethod
    def _validate_optional_rt_rw(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_rt_rw(str(value))

    @field_validator("kode_pos", mode="before")
    @classmethod
    def _validate_optional_kode_pos(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = re.sub(r"\s+", "", value)
        if cleaned and not re.fullmatch(r"\d{5}", cleaned):
            raise ValueError("Kode Pos harus terdiri dari 5 digit angka.")
        return cleaned

    @field_validator(
        "nama_kepala_keluarga",
        "alamat",
        "desa_kelurahan",
        "kecamatan",
        "kabupaten_kota",
        "provinsi",
        mode="before",
    )
    @classmethod
    def _clean_optional_fields(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        return normalize_required_text(str(value), info.field_name)


class KKListItem(IdentitasKKBase):
    model_config = ConfigDict(from_attributes=True)

    jumlah_anggota: int = 0
    created_at: datetime
    updated_at: datetime


class KKDetailOut(IdentitasKKBase):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    updated_at: datetime
    anggota_keluarga: list[AnggotaOut] = Field(default_factory=list)


class PaginatedKKResponse(BaseModel):
    items: list[KKListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    available_kecamatan: list[str] = Field(default_factory=list)
    available_kelurahan: list[str] = Field(default_factory=list)


class BulkDeleteKKRequest(BaseModel):
    no_kk_list: list[str] = Field(..., min_length=1)


# OCR draft schemas intentionally allow partial/imperfect strings so users can review and fix them in Split-Screen OCR.
class OCRIdentitasDraft(BaseModel):
    no_kk: str = ""
    nama_kepala_keluarga: str = ""
    alamat: str = ""
    rt_rw: str = ""
    desa_kelurahan: str = ""
    kecamatan: str = ""
    kabupaten_kota: str = ""
    kode_pos: str = ""
    provinsi: str = ""


class OCRAnggotaDraft(BaseModel):
    nik: str = ""
    nama_lengkap: str = ""
    jenis_kelamin: str = ""
    tempat_lahir: str = ""
    tanggal_lahir: str = ""
    agama: str = ""
    pendidikan: str = ""
    jenis_pekerjaan: str = ""
    status_perkawinan: str = ""
    status_hubungan: str = ""
    kewarganegaraan: str = "WNI"
    nama_ayah: str = ""
    nama_ibu: str = ""


class OCRFieldIssue(BaseModel):
    field_path: str
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class OCRExtractionResponse(BaseModel):
    ocr_engine: str
    temp_filename: str
    preview_url: str
    preprocessed_preview_url: str | None = None
    identitas: OCRIdentitasDraft
    anggota_keluarga: list[OCRAnggotaDraft] = Field(default_factory=list)
    field_confidences: dict[str, float] = Field(default_factory=dict)
    low_confidence_fields: list[OCRFieldIssue] = Field(default_factory=list)
    raw_text: str | None = None
    warnings: list[str] = Field(default_factory=list)


class AgeDistributionItem(BaseModel):
    kategori: KategoriUsia
    jumlah: int
    persentase: float


class DashboardStatsResponse(BaseModel):
    total_kk: int
    total_penduduk: int
    rata_rata_anggota_per_kk: float
    distribusi_usia: list[AgeDistributionItem]
    ringkasan_gender: dict[str, int]


class NikCheckResponse(BaseModel):
    nik: str
    exists: bool
    existing_no_kk: str | None = None
    existing_nama: str | None = None


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    aksi: str
    target_tabel: str
    target_id: str | None = None
    detail: str | None = None
    timestamp: datetime
