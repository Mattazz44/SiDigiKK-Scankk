import math
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import UPLOADS_DIR, get_db
from app.models import AnggotaKeluargaKK, IdentitasKK
from app.schemas import (
    BulkDeleteKKRequest,
    KKCreate,
    KKDetailOut,
    KKListItem,
    KKUpdate,
    PaginatedKKResponse,
)
from app.services.audit_service import record_audit_log
from app.services.ocr_service import promote_temp_image_to_upload

router = APIRouter(prefix="/kk", tags=["Kartu Keluarga"])


def _delete_stored_image(file_gambar_path: str | None) -> None:
    if not file_gambar_path or not file_gambar_path.startswith("/storage/uploads/"):
        return
    filename = Path(file_gambar_path).name
    if not filename:
        return
    candidate = (UPLOADS_DIR / filename).resolve()
    uploads_root = UPLOADS_DIR.resolve()
    if uploads_root in candidate.parents and candidate.is_file():
        candidate.unlink(missing_ok=True)


def _find_nik_conflicts(db: Session, nik_list: list[str]) -> list[dict[str, str]]:
    if not nik_list:
        return []
    rows = (
        db.execute(
            select(
                AnggotaKeluargaKK.nik,
                AnggotaKeluargaKK.no_kk,
                AnggotaKeluargaKK.nama_lengkap,
            ).where(AnggotaKeluargaKK.nik.in_(nik_list))
        )
        .all()
    )
    return [
        {
            "nik": row.nik,
            "existing_no_kk": row.no_kk,
            "existing_nama": row.nama_lengkap,
        }
        for row in rows
    ]


@router.post("", response_model=KKDetailOut, status_code=status.HTTP_201_CREATED)
def create_kk(
    payload: KKCreate,
    db: Session = Depends(get_db),
) -> KKDetailOut:
    """Create a Kartu Keluarga and all family members in one atomic transaction."""
    existing_kk = db.get(IdentitasKK, payload.no_kk)
    if existing_kk is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Nomor KK {payload.no_kk} sudah terdaftar di database.",
                "no_kk": payload.no_kk,
            },
        )

    member_niks = [member.nik for member in payload.anggota_keluarga]
    conflicts = _find_nik_conflicts(db, member_niks)
    if conflicts:
        first = conflicts[0]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"NIK {first['nik']} sudah terdaftar pada KK {first['existing_no_kk']} "
                    f"({first['existing_nama']})."
                ),
                "conflicts": conflicts,
            },
        )

    try:
        kk_data = payload.model_dump(exclude={"anggota_keluarga", "temp_ocr_filename"})
        kk_record = IdentitasKK(**kk_data)

        for member in payload.anggota_keluarga:
            kk_record.anggota_keluarga.append(
                AnggotaKeluargaKK(**member.model_dump())
            )

        db.add(kk_record)
        db.flush()

        # Promote the temp OCR scan only after uniqueness checks and flush succeed.
        if payload.temp_ocr_filename:
            permanent_path = promote_temp_image_to_upload(
                payload.temp_ocr_filename,
                payload.no_kk,
            )
            if permanent_path:
                kk_record.file_gambar_path = permanent_path

        record_audit_log(
            db,
            aksi="CREATE",
            target_tabel="tbl_identitasKK",
            target_id=kk_record.no_kk,
            detail=(
                f"Menambahkan KK {kk_record.no_kk} ({kk_record.nama_kepala_keluarga}) "
                f"beserta {len(kk_record.anggota_keluarga)} anggota keluarga."
            ),
        )
        if kk_record.anggota_keluarga:
            record_audit_log(
                db,
                aksi="CREATE",
                target_tabel="tbl_anggotaKeluargaKK",
                target_id=kk_record.no_kk,
                detail=f"Menambahkan {len(kk_record.anggota_keluarga)} anggota pada KK {kk_record.no_kk}.",
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Terjadi konflik integritas data (Nomor KK atau NIK duplikat)."},
        ) from exc

    created = db.execute(
        select(IdentitasKK)
        .options(joinedload(IdentitasKK.anggota_keluarga))
        .where(IdentitasKK.no_kk == payload.no_kk)
    ).unique().scalar_one()
    return KKDetailOut.model_validate(created)


@router.get("", response_model=PaginatedKKResponse)
def list_kk(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str | None = Query(default=None),
    kelurahan: str | None = Query(default=None),
    kecamatan: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PaginatedKKResponse:
    """List Kartu Keluarga records with pagination, search, and area filters."""
    member_count_sq = (
        select(
            AnggotaKeluargaKK.no_kk,
            func.count(AnggotaKeluargaKK.id).label("jumlah_anggota"),
        )
        .group_by(AnggotaKeluargaKK.no_kk)
        .subquery()
    )

    filters = []
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                IdentitasKK.no_kk.ilike(term),
                IdentitasKK.nama_kepala_keluarga.ilike(term),
                IdentitasKK.anggota_keluarga.any(AnggotaKeluargaKK.nik.ilike(term)),
            )
        )
    if kelurahan and kelurahan.strip():
        filters.append(func.lower(IdentitasKK.desa_kelurahan) == kelurahan.strip().lower())
    if kecamatan and kecamatan.strip():
        filters.append(func.lower(IdentitasKK.kecamatan) == kecamatan.strip().lower())

    count_stmt = select(func.count(IdentitasKK.no_kk))
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int(db.execute(count_stmt).scalar_one() or 0)

    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    offset = (page - 1) * page_size

    list_stmt = (
        select(
            IdentitasKK,
            func.coalesce(member_count_sq.c.jumlah_anggota, 0).label("jumlah_anggota"),
        )
        .outerjoin(member_count_sq, IdentitasKK.no_kk == member_count_sq.c.no_kk)
        .where(*filters)
        .order_by(IdentitasKK.updated_at.desc(), IdentitasKK.no_kk.asc())
        .offset(offset)
        .limit(page_size)
    )
    rows = db.execute(list_stmt).all()

    items = [
        KKListItem(
            no_kk=kk.no_kk,
            nama_kepala_keluarga=kk.nama_kepala_keluarga,
            alamat=kk.alamat,
            rt_rw=kk.rt_rw,
            desa_kelurahan=kk.desa_kelurahan,
            kecamatan=kk.kecamatan,
            kabupaten_kota=kk.kabupaten_kota,
            kode_pos=kk.kode_pos,
            provinsi=kk.provinsi,
            file_gambar_path=kk.file_gambar_path,
            jumlah_anggota=int(jumlah_anggota),
            created_at=kk.created_at,
            updated_at=kk.updated_at,
        )
        for kk, jumlah_anggota in rows
    ]

    available_kecamatan = list(
        db.execute(
            select(IdentitasKK.kecamatan)
            .distinct()
            .order_by(IdentitasKK.kecamatan.asc())
        )
        .scalars()
        .all()
    )
    available_kelurahan = list(
        db.execute(
            select(IdentitasKK.desa_kelurahan)
            .distinct()
            .order_by(IdentitasKK.desa_kelurahan.asc())
        )
        .scalars()
        .all()
    )

    return PaginatedKKResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        available_kecamatan=available_kecamatan,
        available_kelurahan=available_kelurahan,
    )


@router.post("/bulk-delete")
def bulk_delete_kk(
    payload: BulkDeleteKKRequest,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Delete multiple Kartu Keluarga records in a single transaction."""
    cleaned_ids = list(dict.fromkeys(item.strip() for item in payload.no_kk_list if item.strip()))
    if not cleaned_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Daftar Nomor KK tidak boleh kosong.",
        )

    records = (
        db.execute(select(IdentitasKK).where(IdentitasKK.no_kk.in_(cleaned_ids)))
        .scalars()
        .all()
    )
    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tidak ada data KK yang ditemukan untuk dihapus.",
        )

    image_paths = [record.file_gambar_path for record in records]
    deleted_ids = [record.no_kk for record in records]

    for record in records:
        db.delete(record)

    record_audit_log(
        db,
        aksi="DELETE",
        target_tabel="tbl_identitasKK",
        target_id=",".join(deleted_ids)[:64],
        detail=f"Menghapus massal {len(deleted_ids)} KK: {', '.join(deleted_ids)}.",
    )
    db.commit()

    for img_path in image_paths:
        _delete_stored_image(img_path)

    return {
        "message": f"{len(deleted_ids)} data Kartu Keluarga berhasil dihapus.",
        "deleted_count": len(deleted_ids),
        "deleted_no_kk": deleted_ids,
    }


@router.get("/{no_kk}", response_model=KKDetailOut)
def get_kk_detail(
    no_kk: str,
    db: Session = Depends(get_db),
) -> KKDetailOut:
    """Return one Kartu Keluarga and all members with calculated age and age brackets."""
    kk = (
        db.execute(
            select(IdentitasKK)
            .options(joinedload(IdentitasKK.anggota_keluarga))
            .where(IdentitasKK.no_kk == no_kk)
        )
        .unique()
        .scalar_one_or_none()
    )
    if kk is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kartu Keluarga dengan Nomor KK {no_kk} tidak ditemukan.",
        )
    return KKDetailOut.model_validate(kk)


@router.put("/{no_kk}", response_model=KKDetailOut)
def update_kk(
    no_kk: str,
    payload: KKUpdate,
    db: Session = Depends(get_db),
) -> KKDetailOut:
    """Update Kartu Keluarga identity fields and log the change."""
    kk = db.get(IdentitasKK, no_kk)
    if kk is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kartu Keluarga dengan Nomor KK {no_kk} tidak ditemukan.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak ada field yang dikirim untuk diperbarui.",
        )

    new_no_kk = updates.get("no_kk")
    if new_no_kk and new_no_kk != no_kk:
        conflict = db.get(IdentitasKK, new_no_kk)
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Nomor KK {new_no_kk} sudah digunakan oleh data lain.",
            )

    for field, value in updates.items():
        setattr(kk, field, value)

    target_no_kk = new_no_kk or no_kk
    record_audit_log(
        db,
        aksi="UPDATE",
        target_tabel="tbl_identitasKK",
        target_id=target_no_kk,
        detail=f"Memperbarui identitas KK {no_kk} (field: {', '.join(updates.keys())}).",
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gagal memperbarui KK karena konflik constraint database.",
        ) from exc

    updated = (
        db.execute(
            select(IdentitasKK)
            .options(joinedload(IdentitasKK.anggota_keluarga))
            .where(IdentitasKK.no_kk == target_no_kk)
        )
        .unique()
        .scalar_one()
    )
    return KKDetailOut.model_validate(updated)


@router.delete("/{no_kk}")
def delete_kk(
    no_kk: str,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Delete one Kartu Keluarga and cascade-delete all of its family members."""
    kk = db.get(IdentitasKK, no_kk)
    if kk is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kartu Keluarga dengan Nomor KK {no_kk} tidak ditemukan.",
        )

    stored_image = kk.file_gambar_path
    kepala_keluarga = kk.nama_kepala_keluarga

    db.delete(kk)
    record_audit_log(
        db,
        aksi="DELETE",
        target_tabel="tbl_identitasKK",
        target_id=no_kk,
        detail=f"Menghapus KK {no_kk} ({kepala_keluarga}) beserta seluruh anggota keluarganya.",
    )
    db.commit()

    _delete_stored_image(stored_image)
    return {
        "message": f"Kartu Keluarga {no_kk} berhasil dihapus.",
        "no_kk": no_kk,
    }
