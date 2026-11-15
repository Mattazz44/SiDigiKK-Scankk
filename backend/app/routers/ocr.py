from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas import OCRExtractionResponse
from app.services.ocr_service import (
    OCRExtractionError,
    get_ocr_configuration_status,
    process_kk_ocr_upload,
)

router = APIRouter(prefix="/ocr", tags=["OCR"])


@router.get("/status")
def ocr_status() -> dict[str, object]:
    """Return non-secret OCR readiness flags so admins can confirm .env loading."""
    return get_ocr_configuration_status()


@router.post("/extract", response_model=OCRExtractionResponse)
async def extract_kk_from_image(
    file: UploadFile = File(...),
) -> OCRExtractionResponse:
    """Upload a KK image, preprocess it, and return structured OCR extraction with confidence flags."""
    try:
        file_bytes = await file.read()
        return process_kk_ocr_upload(
            file_bytes=file_bytes,
            original_filename=file.filename or "upload.jpg",
        )
    except OCRExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    finally:
        await file.close()
