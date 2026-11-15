Baca dan patuhi seluruh aturan dalam file RULES.md. Kita akan membangun sistem full-stack "SiDigiKK" sesuai desain UI yang sudah ada (sidebar navy gelap, area kerja terang, tampilan split-screen OCR, dan tabel master).

Kerjakan secara bertahap dimulai dari FASE 1 (Backend Python FastAPI) terlebih dahulu. Pastikan seluruh kode ditulis lengkap 100% tanpa placeholder atau kode yang disingkat.

### FASE 1: Bangun Backend Python (FastAPI) Lengkap
Buatkan struktur folder dan seluruh file kode untuk fitur berikut:
1. **Database & Relasi (`models.py` & `schemas.py`):**
   - `tbl_identitasKK`: `no_kk` (PK, 16 digit), `nama_kepala_keluarga`, `alamat`, `rt_rw`, `desa_kelurahan`, `kecamatan`, `kabupaten_kota`, `kode_pos`, `provinsi`, `file_gambar_path`, `created_at`, `updated_at`.
   - `tbl_anggotaKeluargaKK`: `id` (PK), `no_kk` (FK Cascade), `nik` (Unique, 16 digit), `nama_lengkap`, `jenis_kelamin`, `tempat_lahir`, `tanggal_lahir`, `agama`, `pendidikan`, `jenis_pekerjaan`, `status_perkawinan`, `status_hubungan`, `kewarganegaraan`, `nama_ayah`, `nama_ibu`.
   - `tbl_auditLogs`: mencatat aksi (`CREATE`, `UPDATE`, `DELETE`), target tabel, dan timestamp.

2. **Service OCR & Image Processing (`ocr_service.py`):**
   - Terima upload file JPG/PNG, lakukan pre-processing otomatis (grayscale & peningkatan kontras dengan OpenCV/Pillow).
   - Sediakan fungsi ekstraksi terstruktur yang mengembalikan JSON sesuai skema `tbl_identitasKK` dan list `tbl_anggotaKeluargaKK` (sertakan parser/prompt terstruktur jika memakai Vision API/Gemini atau Tesseract).

3. **REST API Endpoints Lengkap (`routers/`):**
   - `POST /api/ocr/extract`: Upload gambar KK -> simpan sementara -> kembalikan hasil JSON OCR + URL preview gambar.
   - `POST /api/kk`: Simpan data identitas KK beserta array anggota keluarganya dalam satu transaksi database. Sertakan pengecekan duplikasi NIK lintas KK.
   - `GET /api/kk`: Mendukung pagination, pencarian (`search` by No. KK / Nama Kepala Keluarga), dan filter (`kelurahan`, `kecamatan`).
   - `GET /api/kk/{no_kk}`: Mengambil detail identitas KK beserta seluruh anggota keluarganya + kalkulasi otomatis umur dan kategori usia (Balita, Usia Sekolah, Produktif, Lansia) untuk tiap anggota.
   - `PUT /api/kk/{no_kk}` & `DELETE /api/kk/{no_kk}`: Update dan hapus KK.
   - `POST /api/kk/{no_kk}/anggota`, `PUT /api/anggota/{id}`, `DELETE /api/anggota/{id}`: CRUD spesifik untuk anggota keluarga.
   - `GET /api/dashboard/stats`: Mengembalikan statistik total KK, total penduduk, dan distribusi kategori usia.
   - `GET /api/export/excel`: Generate file `.xlsx` berisi data gabungan KK dan anggota keluarga menggunakan `pandas` atau `openpyxl`.

4. **Prinsip Desain UI Anti-Slop (Admin Data-Heavy Standard):**
- **DILARANG** menggunakan layout kartu raksasa dengan padding berlebihan (`p-6`/`p-8`) atau shadow tebal (`shadow-md`/`shadow-xl`). Gunakan flat surface dengan border 1px (`border-slate-200`).
- **Tipografi Data:** Gunakan font `Inter` atau `Plus Jakarta Sans` untuk teks, dan wajib terapkan class `font-mono tabular-nums` untuk semua kolom NIK, No. KK, Tanggal Lahir, dan Kode Pos.
- **Kepadatan Tabel:** Tinggi baris tabel (`tr`) maksimal `36px - 40px` (`py-2 px-3`), header tabel menggunakan teks `11px` uppercase (`tracking-wider text-slate-500 bg-slate-50/80`).
- **Interaksi Admin:**
  - Gunakan **Slide-Over Drawer** (lebar `600px - 800px`) untuk melihat & mengedit detail anggota keluarga tanpa meninggalkan halaman tabel utama.
  - Sediakan **Sticky Header** pada tabel dan **Sticky Action Bar** di bagian bawah layar saat ada baris yang dicentang (Bulk Action).
  - Pada halaman **Split-Screen OCR**, field yang tingkat akurasi/confidence-nya rendah atau digitnya != 16 harus otomatis di-highlight dengan border `amber-400` dan langsung fokus ke input pertama yang bermasalah.

Tuliskan kode lengkap untuk setiap file di Fase 1 ini secara berurutan. Setelah Fase 1 selesai dan saya verifikasi, kita akan lanjut ke Fase 2 (Integrasi Frontend React).
