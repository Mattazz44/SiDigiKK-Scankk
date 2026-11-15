from sqlalchemy.orm import Session

from app.models import AuditLog
from app.schemas import AuditAksi


def record_audit_log(
    db: Session,
    aksi: AuditAksi,
    target_tabel: str,
    target_id: str | None = None,
    detail: str | None = None,
) -> None:
    """Append an audit entry within the caller's active database transaction."""
    entry = AuditLog(
        aksi=aksi,
        target_tabel=target_tabel,
        target_id=target_id,
        detail=detail,
    )
    db.add(entry)
