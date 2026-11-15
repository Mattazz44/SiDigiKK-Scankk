export type KategoriUsia = "Balita" | "Usia Sekolah" | "Produktif" | "Lansia";
export type AuditAksi = "CREATE" | "UPDATE" | "DELETE";

export interface AnggotaCreate {
  nik: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  agama: string;
  pendidikan: string;
  jenis_pekerjaan: string;
  status_perkawinan: string;
  status_hubungan: string;
  kewarganegaraan: string;
  nama_ayah: string;
  nama_ibu: string;
}

export type AnggotaUpdate = Partial<AnggotaCreate>;

export interface AnggotaOut extends AnggotaCreate {
  id: number;
  no_kk: string;
  umur: number;
  kategori_usia: KategoriUsia;
}

export interface IdentitasKKBase {
  no_kk: string;
  nama_kepala_keluarga: string;
  alamat: string;
  rt_rw: string;
  desa_kelurahan: string;
  kecamatan: string;
  kabupaten_kota: string;
  kode_pos: string;
  provinsi: string;
  file_gambar_path: string | null;
}

export interface KKCreate extends IdentitasKKBase {
  anggota_keluarga: AnggotaCreate[];
  temp_ocr_filename?: string | null;
}

export type KKUpdate = Partial<IdentitasKKBase>;

export interface KKListItem extends IdentitasKKBase {
  jumlah_anggota: number;
  created_at: string;
  updated_at: string;
}

export interface KKDetailOut extends IdentitasKKBase {
  created_at: string;
  updated_at: string;
  anggota_keluarga: AnggotaOut[];
}

export interface PaginatedKKResponse {
  items: KKListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  available_kecamatan: string[];
  available_kelurahan: string[];
}

export interface OCRIdentitasDraft {
  no_kk: string;
  nama_kepala_keluarga: string;
  alamat: string;
  rt_rw: string;
  desa_kelurahan: string;
  kecamatan: string;
  kabupaten_kota: string;
  kode_pos: string;
  provinsi: string;
}

export interface OCRAnggotaDraft {
  nik: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  agama: string;
  pendidikan: string;
  jenis_pekerjaan: string;
  status_perkawinan: string;
  status_hubungan: string;
  kewarganegaraan: string;
  nama_ayah: string;
  nama_ibu: string;
}

export interface OCRFieldIssue {
  field_path: string;
  confidence: number;
  reason: string;
}

export interface OCRExtractionResponse {
  ocr_engine: string;
  temp_filename: string;
  preview_url: string;
  preprocessed_preview_url: string | null;
  identitas: OCRIdentitasDraft;
  anggota_keluarga: OCRAnggotaDraft[];
  field_confidences: Record<string, number>;
  low_confidence_fields: OCRFieldIssue[];
  raw_text: string | null;
  warnings: string[];
}

export interface AgeDistributionItem {
  kategori: KategoriUsia;
  jumlah: number;
  persentase: number;
}

export interface DashboardStatsResponse {
  total_kk: number;
  total_penduduk: number;
  rata_rata_anggota_per_kk: number;
  distribusi_usia: AgeDistributionItem[];
  ringkasan_gender: Record<string, number>;
}

export interface NikCheckResponse {
  nik: string;
  exists: boolean;
  existing_no_kk: string | null;
  existing_nama: string | null;
}

export interface AuditLogOut {
  id: number;
  aksi: string;
  target_tabel: string;
  target_id: string | null;
  detail: string | null;
  timestamp: string;
}

export interface NikConflictItem {
  nik: string;
  existing_no_kk: string;
  existing_nama: string;
}

export interface BulkDeleteResponse {
  message: string;
  deleted_count: number;
  deleted_no_kk: string[];
}
