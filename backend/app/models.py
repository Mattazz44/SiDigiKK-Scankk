from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class IdentitasKK(Base):
    """Master identity record for one Kartu Keluarga (16-digit No. KK)."""

    __tablename__ = "tbl_identitasKK"

    no_kk: Mapped[str] = mapped_column(String(16), primary_key=True, index=True)
    nama_kepala_keluarga: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    alamat: Mapped[str] = mapped_column(Text, nullable=False)
    rt_rw: Mapped[str] = mapped_column(String(20), nullable=False)
    desa_kelurahan: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    kecamatan: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    kabupaten_kota: Mapped[str] = mapped_column(String(100), nullable=False)
    kode_pos: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    provinsi: Mapped[str] = mapped_column(String(100), nullable=False)
    file_gambar_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    anggota_keluarga: Mapped[list["AnggotaKeluargaKK"]] = relationship(
        "AnggotaKeluargaKK",
        back_populates="kartu_keluarga",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AnggotaKeluargaKK.id",
    )


class AnggotaKeluargaKK(Base):
    """Family member record linked to a Kartu Keluarga by no_kk."""

    __tablename__ = "tbl_anggotaKeluargaKK"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    no_kk: Mapped[str] = mapped_column(
        String(16),
        ForeignKey("tbl_identitasKK.no_kk", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
        index=True,
    )
    nik: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    nama_lengkap: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    jenis_kelamin: Mapped[str] = mapped_column(String(30), nullable=False)
    tempat_lahir: Mapped[str] = mapped_column(String(100), nullable=False)
    tanggal_lahir: Mapped[date] = mapped_column(Date, nullable=False)
    agama: Mapped[str] = mapped_column(String(50), nullable=False)
    pendidikan: Mapped[str] = mapped_column(String(100), nullable=False)
    jenis_pekerjaan: Mapped[str] = mapped_column(String(100), nullable=False)
    status_perkawinan: Mapped[str] = mapped_column(String(50), nullable=False)
    status_hubungan: Mapped[str] = mapped_column(String(80), nullable=False)
    kewarganegaraan: Mapped[str] = mapped_column(String(20), nullable=False, default="WNI")
    nama_ayah: Mapped[str] = mapped_column(String(150), nullable=False, default="-")
    nama_ibu: Mapped[str] = mapped_column(String(150), nullable=False, default="-")

    kartu_keluarga: Mapped[IdentitasKK] = relationship(
        "IdentitasKK",
        back_populates="anggota_keluarga",
    )


class AuditLog(Base):
    """Append-only audit trail for CREATE, UPDATE, and DELETE operations."""

    __tablename__ = "tbl_auditLogs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    aksi: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    target_tabel: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
