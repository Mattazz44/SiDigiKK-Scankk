import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AnggotaKeluargaKK, IdentitasKK
from app.schemas import AnggotaCreate, AnggotaOut, AnggotaUpdate, NikCheckResponse
from app.services.audit_service import record_audit_log

router = APIRouter(tags=["Anggota Keluarga"])


@router.get("/anggota/check-nik/{nik}", response_model=NikCheckResponse)
def check_nik_availability(
    nik: str,
    exclude_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> NikCheckResponse:
    """Check whether a 16-digit NIK is already registered on any Kartu Keluarga."""
    cleaned_nik = re.sub(r"\s+", "", nik)
    if not re.fullmatch(r"\d{16}", cleaned_nik):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="NIK harus terdiri dari tepat 16 digit angka.",
        )

    stmt = select(AnggotaKeluargaKK).where(AnggotaKeluargaKK.nik == cleaned_nik)
    if exclude_id is not None:
        stmt = stmt.where(AnggotaKeluargaKK.id != exclude_id)

    existing = db.execute(stmt).scalar_one_or_none()
    if existing is None:
        return NikCheckResponse(nik=cleaned_nik, exists=False)

    return NikCheckResponse(
        nik=cleaned_nik,
        exists=True,
        existing_no_kk=existing.no_kk,
        existing_nama=existing.nama_lengkap,
    )


@router.post(
    "/kk/{no_kk}/anggota",
    response_model=AnggotaOut,
    status_code=status.HTTP_201_CREATED,
)
def add_anggota_to_kk(
    no_kk: str,
    payload: AnggotaCreate,
    db: Session = Depends(get_db),
) -> AnggotaOut:
    """Add a new family member to an existing Kartu Keluarga after NIK uniqueness checks."""
    kk = db.get(IdentitasKK, no_kk)
    if kk is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kartu Keluarga dengan Nomor KK {no_kk} tidak ditemukan.",
        )

    existing_nik = db.execute(
        select(AnggotaKeluargaKK).where(AnggotaKeluargaKK.nik == payload.nik)
    ).scalar_one_or_none()
    if existing_nik is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"NIK {payload.nik} sudah terdaftar pada KK {existing_nik.no_kk} "
                    f"({existing_nik.nama_lengkap})."
                ),
                "existing_no_kk": existing_nik.no_kk,
                "existing_nama": existing_nik.nama_lengkap,
            },
        )

    member = AnggotaKeluargaKK(no_kk=no_kk, **payload.model_dump())
    db.add(member)

    try:
        db.flush()
        record_audit_log(
            db,
            aksi="CREATE",
            target_tabel="tbl_anggotaKeluargaKK",
            target_id=str(member.id),
            detail=f"Menambahkan anggota {member.nama_lengkap} (NIK {member.nik}) ke KK {no_kk}.",
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"NIK {payload.nik} sudah terdaftar.",
        ) from exc

    db.refresh(member)
    return AnggotaOut.model_validate(member)


@router.put("/anggota/{anggota_id}", response_model=AnggotaOut)
def update_anggota(
    anggota_id: int,
    payload: AnggotaUpdate,
    db: Session = Depends(get_db),
) -> AnggotaOut:
    """Update a single family member record inline and log the change."""
    member = db.get(AnggotaKeluargaKK, anggota_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anggota keluarga dengan ID {anggota_id} tidak ditemukan.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak ada perubahan data anggota yang dikirim.",
        )

    new_nik = updates.get("nik")
    if new_nik and new_nik != member.nik:
        conflict = db.execute(
            select(AnggotaKeluargaKK).where(
                AnggotaKeluargaKK.nik == new_nik,
                AnggotaKeluargaKK.id != anggota_id,
            )
        ).scalar_one_or_none()
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        f"NIK {new_nik} sudah terdaftar pada KK {conflict.no_kk} "
                        f"({conflict.nama_lengkap})."
                    ),
                    "existing_no_kk": conflict.no_kk,
                    "existing_nama": conflict.nama_lengkap,
                },
            )

    for field, value in updates.items():
        setattr(member, field, value)

    record_audit_log(
        db,
        aksi="UPDATE",
        target_tabel="tbl_anggotaKeluargaKK",
        target_id=str(member.id),
        detail=(
            f"Memperbarui anggota {member.nama_lengkap} (NIK {member.nik}, "
            f"field: {', '.join(updates.keys())})."
        ),
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gagal memperbarui anggota karena NIK duplikat.",
        ) from exc

    db.refresh(member)
    return AnggotaOut.model_validate(member)


@router.delete("/anggota/{anggota_id}")
def delete_anggota(
    anggota_id: int,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Delete a family member by ID and log the deletion."""
    member = db.get(AnggotaKeluargaKK, anggota_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anggota keluarga dengan ID {anggota_id} tidak ditemukan.",
        )

    member_nik = member.nik
    member_nama = member.nama_lengkap
    parent_kk = member.no_kk

    db.delete(member)
    record_audit_log(
        db,
        aksi="DELETE",
        target_tabel="tbl_anggotaKeluargaKK",
        target_id=str(anggota_id),
        detail=f"Menghapus anggota {member_nama} (NIK {member_nik}) dari KK {parent_kk}.",
    )
    db.commit()

    return {
        "message": f"Anggota {member_nama} berhasil dihapus.",
        "id": anggota_id,
        "nik": member_nik,
    }
