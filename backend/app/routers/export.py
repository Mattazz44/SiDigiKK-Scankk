import csv
from datetime import datetime
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import AnggotaKeluargaKK, IdentitasKK
from app.schemas import hitung_umur_dan_kategori

router = APIRouter(prefix="/export", tags=["Export"])

COMBINED_HEADERS = [
    "No. KK",
    "Nama Kepala Keluarga",
    "Alamat",
    "RT/RW",
    "Desa/Kelurahan",
    "Kecamatan",
    "Kabupaten/Kota",
    "Kode Pos",
    "Provinsi",
    "NIK",
    "Nama Lengkap",
    "Jenis Kelamin",
    "Tempat Lahir",
    "Tanggal Lahir",
    "Umur",
    "Kategori Usia",
    "Agama",
    "Pendidikan",
    "Jenis Pekerjaan",
    "Status Perkawinan",
    "Status Hubungan",
    "Kewarganegaraan",
    "Nama Ayah",
    "Nama Ibu",
]

# Columns formatted as explicit text in Excel so 16-digit IDs and leading zeros stay intact.
TEXT_FORMAT_COLUMN_INDICES = {1, 4, 8, 10}


def _fetch_export_kks(
    db: Session,
    search: str | None = None,
    kelurahan: str | None = None,
    kecamatan: str | None = None,
    no_kk_list: str | None = None,
) -> list[IdentitasKK]:
    stmt = (
        select(IdentitasKK)
        .options(joinedload(IdentitasKK.anggota_keluarga))
        .order_by(IdentitasKK.no_kk.asc())
    )

    if no_kk_list and no_kk_list.strip():
        selected_ids = [item.strip() for item in no_kk_list.split(",") if item.strip()]
        if selected_ids:
            stmt = stmt.where(IdentitasKK.no_kk.in_(selected_ids))

    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                IdentitasKK.no_kk.ilike(term),
                IdentitasKK.nama_kepala_keluarga.ilike(term),
                IdentitasKK.anggota_keluarga.any(AnggotaKeluargaKK.nik.ilike(term)),
            )
        )
    if kelurahan and kelurahan.strip():
        stmt = stmt.where(func.lower(IdentitasKK.desa_kelurahan) == kelurahan.strip().lower())
    if kecamatan and kecamatan.strip():
        stmt = stmt.where(func.lower(IdentitasKK.kecamatan) == kecamatan.strip().lower())

    return list(db.execute(stmt).unique().scalars().all())


def _build_combined_rows(kk_records: list[IdentitasKK]) -> list[list[object]]:
    rows: list[list[object]] = []
    for kk in kk_records:
        kk_prefix = [
            kk.no_kk,
            kk.nama_kepala_keluarga,
            kk.alamat,
            kk.rt_rw,
            kk.desa_kelurahan,
            kk.kecamatan,
            kk.kabupaten_kota,
            kk.kode_pos,
            kk.provinsi,
        ]
        if not kk.anggota_keluarga:
            rows.append([*kk_prefix, *([""] * (len(COMBINED_HEADERS) - len(kk_prefix)))])
            continue

        for member in kk.anggota_keluarga:
            umur, kategori = hitung_umur_dan_kategori(member.tanggal_lahir)
            rows.append(
                [
                    *kk_prefix,
                    member.nik,
                    member.nama_lengkap,
                    member.jenis_kelamin,
                    member.tempat_lahir,
                    member.tanggal_lahir.isoformat(),
                    umur,
                    kategori,
                    member.agama,
                    member.pendidikan,
                    member.jenis_pekerjaan,
                    member.status_perkawinan,
                    member.status_hubungan,
                    member.kewarganegaraan,
                    member.nama_ayah,
                    member.nama_ibu,
                ]
            )
    return rows


def _style_header_and_autofit(worksheet, text_columns: set[int]) -> None:
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)

    for cell in worksheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center", horizontal="left")

    worksheet.freeze_panes = "A2"
    worksheet.row_dimensions[1].height = 24

    for col_idx in range(1, worksheet.max_column + 1):
        max_len = 0
        for row_idx in range(1, worksheet.max_row + 1):
            cell = worksheet.cell(row=row_idx, column=col_idx)
            if row_idx > 1 and col_idx in text_columns:
                cell.number_format = "@"
            val_len = len(str(cell.value or ""))
            if val_len > max_len:
                max_len = val_len
        worksheet.column_dimensions[get_column_letter(col_idx)].width = min(max(max_len + 4, 12), 42)


@router.get("/excel")
def export_kk_excel(
    search: str | None = Query(default=None),
    kelurahan: str | None = Query(default=None),
    kecamatan: str | None = Query(default=None),
    no_kk_list: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Export joined Kartu Keluarga and family member records as an .xlsx workbook."""
    kk_records = _fetch_export_kks(db, search, kelurahan, kecamatan, no_kk_list)

    workbook = Workbook()
    combined_sheet = workbook.active
    combined_sheet.title = "Data Gabungan KK & Anggota"
    combined_sheet.append(COMBINED_HEADERS)
    for row in _build_combined_rows(kk_records):
        combined_sheet.append(row)
    _style_header_and_autofit(combined_sheet, TEXT_FORMAT_COLUMN_INDICES)

    summary_sheet = workbook.create_sheet(title="Ringkasan KK")
    summary_sheet.append(
        [
            "No. KK",
            "Nama Kepala Keluarga",
            "Alamat",
            "RT/RW",
            "Desa/Kelurahan",
            "Kecamatan",
            "Kabupaten/Kota",
            "Kode Pos",
            "Provinsi",
            "Jumlah Anggota",
        ]
    )
    for kk in kk_records:
        summary_sheet.append(
            [
                kk.no_kk,
                kk.nama_kepala_keluarga,
                kk.alamat,
                kk.rt_rw,
                kk.desa_kelurahan,
                kk.kecamatan,
                kk.kabupaten_kota,
                kk.kode_pos,
                kk.provinsi,
                len(kk.anggota_keluarga),
            ]
        )
    _style_header_and_autofit(summary_sheet, {1, 4, 8})

    output = BytesIO()
    workbook.save(output)
    output.seek(0)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"data_kk_sidigikk_{timestamp}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/csv")
def export_kk_csv(
    search: str | None = Query(default=None),
    kelurahan: str | None = Query(default=None),
    kecamatan: str | None = Query(default=None),
    no_kk_list: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Export joined Kartu Keluarga and family member records as UTF-8 BOM CSV."""
    kk_records = _fetch_export_kks(db, search, kelurahan, kecamatan, no_kk_list)

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(COMBINED_HEADERS)
    for row in _build_combined_rows(kk_records):
        writer.writerow(row)

    # Prefix UTF-8 BOM so Microsoft Excel preserves Indonesian characters and encoding.
    encoded = ("\ufeff" + buffer.getvalue()).encode("utf-8")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"data_kk_sidigikk_{timestamp}.csv"

    return StreamingResponse(
        BytesIO(encoded),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
