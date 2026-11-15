from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import STORAGE_DIR, engine, ensure_storage_dirs, init_db
from app.routers import anggota, dashboard, export, kk, ocr
from app.services.ocr_service import get_ocr_configuration_status

logger = logging.getLogger("uvicorn.error")


def _get_cors_origins() -> list[str]:
    raw_origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    ocr_status = get_ocr_configuration_status()
    if ocr_status["gemini_configured"] and ocr_status["gemini_sdk_installed"]:
        logger.info(
            "OCR Startup: GEMINI_API_KEY terbaca (%s) | Model: %s | Engine aktif: gemini",
            ocr_status["gemini_key_preview"],
            ocr_status["gemini_model"],
        )
    elif ocr_status["gemini_configured"] and not ocr_status["gemini_sdk_installed"]:
        logger.warning(
            "OCR Startup: GEMINI_API_KEY terbaca (%s), tetapi library 'google-genai' belum terinstal.",
            ocr_status["gemini_key_preview"],
        )
    elif ocr_status["tesseract_available"]:
        logger.warning(
            "OCR Startup: GEMINI_API_KEY belum diisi di %s; menggunakan fallback Tesseract OCR.",
            ocr_status["env_file_path"],
        )
    else:
        logger.warning(
            "OCR Startup: GEMINI_API_KEY belum diisi di %s dan Tesseract OCR tidak ditemukan (mode manual fallback).",
            ocr_status["env_file_path"],
        )
    yield
    engine.dispose()


ensure_storage_dirs()

app = FastAPI(
    title="SiDigiKK API",
    description="Backend API untuk digitalisasi, validasi OCR, dan pengelolaan data Kartu Keluarga.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")

app.include_router(ocr.router, prefix="/api")
app.include_router(kk.router, prefix="/api")
app.include_router(anggota.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(export.router, prefix="/api")


@app.get("/api/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "SiDigiKK API"}
