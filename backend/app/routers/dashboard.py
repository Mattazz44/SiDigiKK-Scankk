from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AnggotaKeluargaKK, AuditLog, IdentitasKK
from app.schemas import (
    AgeDistributionItem,
    AuditLogOut,
    DashboardStatsResponse,
    KategoriUsia,
    hitung_umur_dan_kategori,
)

router = APIRouter(tags=["Dashboard & Audit"])

AGE_BRACKET_ORDER: tuple[KategoriUsia, ...] = (
    "Balita",
    "Usia Sekolah",
    "Produktif",
    "Lansia",
)


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Session = Depends(get_db),
) -> DashboardStatsResponse:
    """Aggregate total KK, total residents, age-bracket distribution, and gender counts."""
    total_kk = int(db.execute(select(func.count(IdentitasKK.no_kk))).scalar_one() or 0)
    member_rows = db.execute(
        select(AnggotaKeluargaKK.tanggal_lahir, AnggotaKeluargaKK.jenis_kelamin)
    ).all()

    total_penduduk = len(member_rows)
    bracket_counts: dict[KategoriUsia, int] = {bracket: 0 for bracket in AGE_BRACKET_ORDER}
    gender_counts: dict[str, int] = {"LAKI-LAKI": 0, "PEREMPUAN": 0}

    for dob, gender in member_rows:
        _, category = hitung_umur_dan_kategori(dob)
        bracket_counts[category] += 1

        normalized_gender = (gender or "").strip().upper()
        if normalized_gender in gender_counts:
            gender_counts[normalized_gender] += 1
        elif normalized_gender:
            gender_counts[normalized_gender] = gender_counts.get(normalized_gender, 0) + 1

    distribusi_usia = [
        AgeDistributionItem(
            kategori=bracket,
            jumlah=bracket_counts[bracket],
            persentase=(
                round((bracket_counts[bracket] / total_penduduk) * 100, 1)
                if total_penduduk > 0
                else 0.0
            ),
        )
        for bracket in AGE_BRACKET_ORDER
    ]

    avg_members = round(total_penduduk / total_kk, 2) if total_kk > 0 else 0.0

    return DashboardStatsResponse(
        total_kk=total_kk,
        total_penduduk=total_penduduk,
        rata_rata_anggota_per_kk=avg_members,
        distribusi_usia=distribusi_usia,
        ringkasan_gender=gender_counts,
    )


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    aksi: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[AuditLogOut]:
    """Return recent audit trail entries ordered newest first."""
    stmt = select(AuditLog)
    if aksi and aksi.strip():
        stmt = stmt.where(AuditLog.aksi == aksi.strip().upper())

    logs = (
        db.execute(stmt.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).limit(limit))
        .scalars()
        .all()
    )
    return [AuditLogOut.model_validate(item) for item in logs]
