# SiDigiKK — Sistem Digitalisasi & Manajemen Kartu Keluarga Berbasis OCR

**SiDigiKK** adalah aplikasi web full-stack untuk mendigitalisasi, memvalidasi, dan mengelola data Kartu Keluarga (KK) Indonesia secara otomatis dari citra/foto dokumen menggunakan **OCR berbasis Google Gemini Vision** (dengan pra-pemrosesan gambar **OpenCV/Pillow** serta dukungan fallback **Tesseract OCR**).

Aplikasi ini memisahkan antarmuka pengguna menjadi dua portal yang terhubung ke satu API Backend FastAPI + SQLite:
- **Portal Pengguna** (port `5173`): fokus pada pengunggahan dokumen KK, konfirmasi hasil OCR *split-screen*, dan penelusuran daftar kartu tersimpan.
- **Portal Admin** (port `5174`): ruang kerja operasional untuk pemantauan statistik kependudukan, penyuntingan terstruktur, audit log, dan ekspor laporan.

---

## Fitur Utama

### 1. Portal Pengguna (`http://localhost:5173`)
- **Upload & Auto-Preprocess Citra KK:** Mendukung unggah *drag & drop* berkas `JPG`/`PNG` (maks. 10 MB) beserta tombol *file contoh*. Backend otomatis memperbaiki orientasi EXIF, memutar gambar potret 90° ke lanskap (`width > height`), serta mengompres gambar menjadi maksimal `1000px` grayscale kontras tinggi (`CLAHE` + *unsharp masking*, JPEG 70%) agar pembacaan OCR cepat dan akurat. Dilengkapi **Stepper Status Dinamis** selama proses ekstraksi.
- **Split-Screen Konfirmasi OCR:**
  - **Panel Kiri (`DocumentPreviewPane`):** Menampilkan pratinjau dokumen asli maupun hasil pra-pemrosesan OCR dengan kontrol *zoom*, *pan/geser*, rotasi 90°, dan mode kontras tinggi.
  - **Panel Kanan (`KonfirmasiOCRPage`):** Formulir identitas KK dan tabel/daftar anggota keluarga dengan sorotan peringatan pada field yang berpotensi buram/kurang meyakinkan (di bawah `OCR_CONFIDENCE_THRESHOLD`), tambah/hapus baris anggota, serta opsi **Input Manual** tanpa OCR.
- **Validasi 16 Digit NIK & No. KK:** Pemeriksaan ketat tepat **16 digit angka** pada `No. KK` dan `NIK`, normalisasi otomatis format `RT/RW` (`000/000`) dan tanggal lahir (ISO `YYYY-MM-DD`, `DD-MM-YYYY`, atau nama bulan Indonesia), serta deteksi konflik duplikasi NIK secara *real-time* maupun saat penyimpanan transaksi.
- **Daftar Kartu Digital & Navigasi Floating Dock:** Tab **Daftar Kartu** menyajikan daftar KK tersimpan dengan pencarian cepat (`No. KK`, `Kepala Keluarga`, `NIK`), tombol salin `No. KK`, serta modal detail anggota keluarga beserta kategori usianya. Dilengkapi latar titik interaktif (`InteractiveDotBackground`) yang merespons mouse & sentuhan layar, serta *Floating Bottom Navigation Dock* (*Input KK*, *Konfirmasi OCR*, *Daftar Kartu*).

### 2. Portal Admin (`http://localhost:5174`)
- **Login Admin Terlindungi Sesi:** Halaman login khusus administrator (`AdminLoginPage`) dengan visibilitas password, validasi akun, penyimpanan sesi di `localStorage`, serta tombol **Isi Akun Demo**.
- **Dashboard Kependudukan & Kategori Usia Otomatis:** Menampilkan ringkasan total KK, total penduduk, rata-rata anggota per KK, proporsi gender (`LAKI-LAKI` vs `PEREMPUAN`), aktivitas terbaru, serta pengelompokan **4 kategori usia otomatis** berdasarkan tanggal lahir:
  - **Balita:** `0 – 4 tahun`
  - **Usia Sekolah:** `5 – 17 tahun`
  - **Produktif:** `18 – 59 tahun`
  - **Lansia:** `60+ tahun`
- **Manajemen Data KK dengan Slide-Over Drawer & Inline Editing:** Tabel data berkepadatan tinggi dilengkapi pencarian, filter dinamis berdasarkan **Kecamatan** & **Kelurahan**, pagination, dan **hapus massal** (*bulk delete*). Mengklik baris akan membuka **Slide-Over Drawer** (`KKSlideOverDrawer`) untuk meninjau scan KK, memperbarui identitas KK, melakukan **inline editing** pada data tiap anggota keluarga, menambah anggota baru, atau menghapus anggota. Tersedia pula modal **Input KK Baru** langsung di Portal Admin.
- **Audit Log Aktivitas Sistem (`tbl_auditLogs`):** Mencatat secara otomatis setiap aksi `CREATE`, `UPDATE`, dan `DELETE` pada tabel KK maupun anggota keluarga lengkap dengan detail dan filter jenis aksi.
- **Export Excel (`.xlsx`) & CSV:** Unduh data gabungan KK & anggota keluarga ke **Microsoft Excel (`.xlsx`)** dengan 2 sheet (*Data Gabungan KK & Anggota* dan *Ringkasan KK*, kolom `No. KK`, `RT/RW`, `Kode Pos`, dan `NIK` diformat sebagai teks `@` agar seluruh 16 digit dan angka `0` awal tidak berubah) atau format **CSV (UTF-8 BOM)**. Ekspor mengikuti filter pencarian/wilayah maupun baris KK yang dicentang.

---

## Tech Stack

| Lapisan | Teknologi |
| :--- | :--- |
| **Backend API** | Python, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2.x |
| **Database** | SQLite (`backend/storage/sidigikk.db`, mendukung konfigurasi `DATABASE_URL`) |
| **OCR & Pengolahan Citra** | Google GenAI SDK (`google-genai` / Gemini Vision), OpenCV (`opencv-python-headless`), Pillow, NumPy, Pytesseract (`pytesseract`) |
| **Export Laporan** | OpenPyXL (`openpyxl`) untuk `.xlsx`, modul `csv` Python untuk CSV UTF-8 BOM |
| **Frontend** | React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React |

---

## Struktur Folder

```text
miniproject_kk_citra/
├── .gitignore                          # Aturan ignore (.env, venv, node_modules, *.db, uploads)
├── README.md                           # Dokumentasi utama proyek
├── rules.md                            # Pedoman skema & standar UI proyek
├── backend/
│   ├── .env.example                    # Template konfigurasi environment backend
│   ├── requirements.txt                # Dependensi Python backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py                 # Konfigurasi SQLAlchemy, SQLite FK pragma & folder storage
│   │   ├── main.py                     # Inisialisasi FastAPI, CORS, static /storage & startup log OCR
│   │   ├── models.py                   # Model ORM: tbl_identitasKK, tbl_anggotaKeluargaKK, tbl_auditLogs
│   │   ├── schemas.py                  # Skema Pydantic, validasi 16 digit & hitung_umur_dan_kategori
│   │   ├── routers/
│   │   │   ├── kk.py                   # CRUD Kartu Keluarga & bulk delete (/api/kk)
│   │   │   ├── anggota.py              # CRUD Anggota Keluarga & cek keunikan NIK (/api/anggota, /api/kk/{no_kk}/anggota)
│   │   │   ├── ocr.py                  # Status konfigurasi & ekstraksi OCR (/api/ocr/status, /api/ocr/extract)
│   │   │   ├── dashboard.py            # Statistik kependudukan & audit log (/api/dashboard/stats, /api/audit-logs)
│   │   │   └── export.py               # Unduh Excel .xlsx & CSV (/api/export/excel, /api/export/csv)
│   │   └── services/
│   │       ├── ocr_service.py          # Pipeline preprocessing OpenCV/Pillow, Gemini Vision OCR & Tesseract fallback
│   │       └── audit_service.py        # Helper pencatatan audit trail ke tbl_auditLogs
│   └── storage/                        # Direktori runtime (dibuat/diisi otomatis, file hasil tidak di-commit)
│       ├── temp_ocr/                   # Berkas unggahan sementara & hasil preprocessed OCR
│       └── uploads/                    # Berkas scan KK permanen yang terhubung ke database
└── frontend/
    ├── .env                            # Konfigurasi mode default portal user (port 5173)
    ├── .env.admin                      # Konfigurasi mode portal admin (port 5174)
    ├── .env.example                    # Contoh konfigurasi environment frontend
    ├── index.html
    ├── package.json                    # Skrip npm (dev:user, dev:admin, build, lint)
    ├── tsconfig.json
    ├── vite.config.ts
    ├── public/
    │   └── rusdi.jpg                   # Aset logo aplikasi
    └── src/
        ├── App.tsx                     # Router portal (User vs Admin berdasar VITE_APP_PORTAL / port 5174)
        ├── index.css                   # Tailwind v4 & animasi utilitas
        ├── main.tsx
        ├── api/
        │   └── client.ts               # Klien HTTP (fetch/XHR progress) ke backend port 8001
        ├── types/
        │   └── kk.ts                   # Tipe TypeScript sinkron dengan skema backend
        ├── utils/
        │   ├── adminAuth.ts            # Autentikasi sesi admin & kredensial demo
        │   └── formatters.ts           # Formatter tanggal, RT/RW, opsi dropdown KK & kalkulasi usia
        ├── components/
        │   ├── AdminSidebar.tsx        # Sidebar navigasi responsif Portal Admin
        │   ├── AgeCategoryBadge.tsx    # Badge warna kategori usia (Balita, Usia Sekolah, Produktif, Lansia)
        │   ├── AuditLogView.tsx        # Tampilan riwayat aktivitas & filter aksi CREATE/UPDATE/DELETE
        │   ├── ConfirmModal.tsx        # Dialog konfirmasi aksi destruktif
        │   ├── DocumentPreviewPane.tsx # Panel pratinjau dokumen interaktif (zoom, pan, rotasi, kontras)
        │   ├── InteractiveDotBackground.tsx # Latar titik interaktif untuk desktop & perangkat sentuh
        │   ├── KKSlideOverDrawer.tsx   # Drawer detail KK & inline editing anggota keluarga
        │   ├── ToastProvider.tsx       # Sistem notifikasi toast global
        │   └── UserWorkspace.tsx       # Layout Portal Pengguna, Daftar Kartu & Floating Bottom Dock
        └── pages/
            ├── AdminLoginPage.tsx      # Halaman login Portal Admin
            ├── AdminWorkspace.tsx      # Workspace manajemen data, filter, bulk delete & ekspor Admin
            ├── DashboardPage.tsx       # Halaman statistik kependudukan & sebaran usia
            ├── InputKKPage.tsx         # Halaman upload citra KK & Dynamic Status Stepper OCR
            └── KonfirmasiOCRPage.tsx   # Halaman konfirmasi split-screen hasil OCR & validasi
```

---

## Panduan Instalasi & Menjalankan Aplikasi

### Prasyarat
- **Python 3.10+**
- **Node.js 18+** (atau 20+) dan **npm**
- **Google Gemini API Key** dari Google AI Studio untuk menjalankan mesin OCR utama (`gemini-3.5-flash-lite` dengan daftar fallback otomatis). *(Opsional: instalasi Tesseract OCR di sistem apabila ingin memakai fallback offline).*

### 1. Setup & Jalankan Backend (`port 8001`)

Buka terminal pertama dan masuk ke folder `backend/`:

```bash
cd backend
```

Buat dan aktifkan virtual environment Python:

```powershell
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1
```

> Untuk Command Prompt (CMD) gunakan `.\venv\Scripts\activate.bat`, sedangkan untuk Linux/macOS gunakan `source venv/bin/activate`.

Instal seluruh dependensi Python:

```bash
pip install -r requirements.txt
```

Salin `.env.example` menjadi `.env`, lalu isi `GEMINI_API_KEY`:

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
```

> Untuk Linux/macOS gunakan `cp .env.example .env`.

Buka file `backend/.env` dan masukkan API Key Gemini Anda:

```env
DATABASE_URL=sqlite:///./storage/sidigikk.db
GEMINI_API_KEY=ISI_API_KEY_GEMINI_ANDA_DI_SINI
GEMINI_OCR_MODEL=gemini-3.5-flash-lite
TESSERACT_CMD=
OCR_CONFIDENCE_THRESHOLD=0.80
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173
```

Jalankan server FastAPI di port `8001`:

```bash
uvicorn app.main:app --reload --port 8001
```

Saat server menyala, database SQLite (`backend/storage/sidigikk.db`) dan tabel (`tbl_identitasKK`, `tbl_anggotaKeluargaKK`, `tbl_auditLogs`) dibuat otomatis. Anda dapat memeriksa kesiapan engine OCR melalui `http://127.0.0.1:8001/api/ocr/status` atau membuka dokumentasi interaktif Swagger di `http://127.0.0.1:8001/docs`.

### 2. Setup & Jalankan Frontend (`port 5173` & `port 5174`)

Pastikan server backend di port `8001` sudah aktif. Buka terminal baru, masuk ke folder `frontend/`, dan instal dependensi npm:

```bash
cd frontend
npm install
```

Jalankan **Portal Pengguna** (port `5173`):

```bash
npm run dev:user
```

Akses Portal Pengguna di browser: **`http://localhost:5173`**

Untuk membuka **Portal Admin** secara bersamaan, buka satu terminal tambahan di folder `frontend/`, lalu jalankan:

```bash
npm run dev:admin
```

Akses Portal Admin di browser: **`http://localhost:5174`**

---

## Cara Menggunakan Aplikasi

### A. Untuk Pengguna Umum (Portal Pengguna — `http://localhost:5173`)
1. **Unggah Foto/Scan KK:**
   - Pada tab **Input KK** di dock navigasi bawah, seret dan lepas file gambar KK (`JPG`/`PNG`, maks. `10 MB`) ke area unggah, klik **Pilih Berkas Gambar**, atau coba menggunakan tombol **Gunakan file contoh**.
   - Klik **Proses Ekstraksi Data**. Aplikasi akan menampilkan *stepper* 3 tahap otomatis sementara backend melakukan auto-rotate/kompresi gambar dan ekstraksi data via Gemini Vision.
   - *(Alternatif)* Klik tombol **Input Manual Tanpa Scan** jika ingin mengisi seluruh data KK secara manual tanpa pemindaian gambar.
2. **Verifikasi Hasil OCR (Split-Screen):**
   - Setelah ekstraksi selesai, Anda diarahkan ke tab **Konfirmasi OCR**.
   - Bandingkan teks hasil ekstraksi pada formulir sebelah kanan dengan foto asli sebelah kiri. Anda dapat memperbesar (*zoom*), menggeser (*pan*), memutar gambar 90°, mengaktifkan mode kontras tinggi, atau beralih ke tampilan gambar hasil pra-pemrosesan.
   - Periksa kembali field yang ditandai indikator peringatan, pastikan **No. KK** dan setiap **NIK** anggota berjumlah **tepat 16 digit angka** serta tidak duplikat, lalu klik tombol simpan.
3. **Melihat Daftar Kartu Tersimpan:**
   - Buka tab **Daftar Kartu** untuk mencari KK berdasarkan No. KK, nama Kepala Keluarga, atau NIK, menyalin No. KK, serta membuka rincian seluruh anggota keluarga.

### B. Untuk Administrator (Portal Admin — `http://localhost:5174`)
1. **Login Admin:**
   - Buka `http://localhost:5174`.
   - Masukkan kredensial administrator sesuai konfigurasi pada `frontend/src/utils/adminAuth.ts`:
     - **Username:** `admin`
     - **Password:** `admin123`
   - Anda juga dapat mengklik tombol **Isi Akun Demo** lalu klik **Masuk ke Admin Workspace**.
2. **Dashboard Statistik (`Dashboard Kependudukan`):**
   - Pantau jumlah total KK, total penduduk terdaftar, rata-rata anggota per KK, distribusi gender, serta persentase sebaran kategori usia (*Balita*, *Usia Sekolah*, *Produktif*, *Lansia*).
3. **Pengelolaan Data KK (`Data Kartu Keluarga`):**
   - Gunakan kotak pencarian (`No. KK`, `Kepala Keluarga`, `NIK`) serta dropdown filter **Kecamatan** dan **Kelurahan**.
   - Klik salah satu baris KK untuk membuka **Slide-Over Drawer**: lihat gambar scan KK, ubah identitas KK, klik edit per baris anggota untuk **inline editing**, tambah anggota baru, atau hapus anggota tertentu.
   - Centang satu atau beberapa baris KK untuk melakukan **hapus massal** (*bulk delete*), atau klik **+ Input KK Baru** untuk memindai/menginput data baru langsung dari Portal Admin.
4. **Export Laporan ke Excel & CSV:**
   - Klik **Export Excel (`.xlsx`)** untuk mengunduh file workbook berisi sheet *Data Gabungan KK & Anggota* dan *Ringkasan KK*, atau klik **CSV** untuk mengunduh berkas CSV UTF-8. Jika ada baris yang dicentang atau filter aktif, hasil ekspor menyesuaikan pilihan/filter tersebut.
5. **Memeriksa Jejak Perubahan (`Audit Log`):**
   - Pilih menu **Audit Log** pada sidebar untuk melihat seluruh riwayat `CREATE`, `UPDATE`, dan `DELETE` yang tersimpan pada `tbl_auditLogs`.
