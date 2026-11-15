import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  FileUp,
  Info,
  Loader2,
  PenSquare,
  X,
} from "lucide-react";
import { ApiError, extractOcr } from "../api/client";
import type { OCRExtractionResponse } from "../types/kk";
import { useToast } from "../components/ToastProvider";

interface InputKKPageProps {
  onOcrSuccess: (result: OCRExtractionResponse) => void;
  onStartManualEntry: () => void;
}

const MAX_BYTES = 10 * 1024 * 1024;

const EXTRACTION_STEPS = [
  "Mengoptimalkan kejernihan foto...",
  "Mengekstrak data Kartu Keluarga...",
  "Menyiapkan lembar koreksi...",
] as const;

function buildSampleKkFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 920;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas tidak didukung browser."));
      return;
    }

    ctx.fillStyle = "#f4f6f4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("KARTU KELUARGA (CONTOH SIMULASI)", 700, 95);
    ctx.font = "bold 28px monospace";
    ctx.fillText("No. 320101050612000", 700, 138);

    ctx.textAlign = "left";
    ctx.font = "18px sans-serif";
    const leftMeta = [
      "Nama Kepala Keluarga : Joko Widodo Prasetyo",
      "Alamat               : Jl. Ahmad Yani No. 21",
      "RT/RW                : 002/004",
      "Kode Pos             : 16129",
    ];
    const rightMeta = [
      "Desa/Kelurahan : Tegallega",
      "Kecamatan      : Bogor Tengah",
      "Kabupaten/Kota : Kota Bogor",
      "Provinsi       : Jawa Barat",
    ];

    leftMeta.forEach((line, i) => ctx.fillText(line, 70, 200 + i * 30));
    rightMeta.forEach((line, i) => ctx.fillText(line, 780, 200 + i * 30));

    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(64, 340, canvas.width - 128, 220);
    ctx.beginPath();
    ctx.moveTo(64, 390);
    ctx.lineTo(canvas.width - 64, 390);
    ctx.stroke();

    ctx.font = "bold 16px sans-serif";
    ctx.fillText("No  Nama Lengkap          NIK               JK         Tempat Lahir  Tgl Lahir   Agama", 80, 372);
    ctx.font = "16px monospace";
    ctx.fillText("1   Joko Widodo Prasetyo  3201010101850001  LAKI-LAKI  Bogor         12-04-1985  ISLAM", 80, 430);
    ctx.fillText("2   Siti Rahmawati        3201014506870002  PEREMPUAN  Bandung       15-06-1987  ISLAM", 80, 470);

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Gagal membuat gambar contoh."));
        return;
      }
      resolve(new File([blob], "contoh_kk_simulasi.png", { type: "image/png" }));
    }, "image/png");
  });
}

export function InputKKPage({
  onOcrSuccess,
  onStartManualEntry,
}: InputKKPageProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!uploading) {
      setActiveStepIndex(0);
      return;
    }

    setActiveStepIndex(0);
    const intervalId = window.setInterval(() => {
      setActiveStepIndex((prev) =>
        prev < EXTRACTION_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [uploading]);

  const acceptFile = (file: File) => {
    setErrorMsg(null);
    const ext = file.name.toLowerCase();
    const validType =
      ["image/jpeg", "image/png"].includes(file.type) ||
      ext.endsWith(".jpg") ||
      ext.endsWith(".jpeg") ||
      ext.endsWith(".png");
    if (!validType) {
      setErrorMsg("Format file tidak didukung. Gunakan gambar JPG atau PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorMsg("Ukuran file melebihi batas maksimal 10 MB.");
      return;
    }
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }
    setSelectedFile(file);
    setPreviewObjectUrl(URL.createObjectURL(file));
  };

  const clearSelectedFile = () => {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }
    setSelectedFile(null);
    setPreviewObjectUrl(null);
    setUploadProgress(0);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) acceptFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const handleExtract = async (fileToUpload?: File) => {
    const targetFile = fileToUpload ?? selectedFile;
    if (!targetFile) return;

    setUploading(true);
    setUploadProgress(0);
    setErrorMsg(null);

    try {
      const response = await extractOcr(targetFile, (pct) => {
        setUploadProgress(pct);
      });
      showToast(
        `Ekstraksi selesai (engine: ${response.ocr_engine}). Silakan verifikasi hasil di layar konfirmasi.`,
        response.low_confidence_fields.length > 0 ? "warning" : "success"
      );
      onOcrSuccess(response);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Terjadi kesalahan saat memproses gambar KK.";
      setErrorMsg(message);
      showToast(message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleUseSampleFile = async () => {
    try {
      const sampleFile = await buildSampleKkFile();
      acceptFile(sampleFile);
      showToast("File contoh simulasi dimuat. Klik Proses Ekstraksi Data untuk menguji OCR.", "info");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menyiapkan file contoh."
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
            Input / Upload Kartu Keluarga
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Unggah foto atau hasil pindaian KK (JPG/PNG) untuk diproses OCR, lalu periksa hasilnya sebelum disimpan.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartManualEntry}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 sm:min-h-[36px]"
        >
          <PenSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Input Manual Tanpa Scan</span>
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Gagal memproses berkas</p>
            <p className="mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Grid 2 Kolom Seimbang di Layar Laptop / Desktop (7 kolom kiri vs 5 kolom kanan) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Kolom Kiri: Area Drag & Drop Unggah Dokumen (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed bg-white p-6 text-center transition-colors ${
              isDragging
                ? "border-blue-600 bg-blue-50/40"
                : "border-slate-300 hover:border-slate-400"
            }`}
          >
            <input
              ref={fileInputRef}
              id="kk-file-upload"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleFileChange}
              className="sr-only"
            />

            {!selectedFile ? (
              <div className="mx-auto flex max-w-sm flex-col items-center py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 shadow-xs">
                  <FileUp className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Seret dan lepas file KK di sini
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  atau pilih berkas dari perangkat Anda: JPG, PNG (maks. 10 MB)
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <label
                    htmlFor="kk-file-upload"
                    className="font-display inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 sm:min-h-[36px]"
                  >
                    Pilih Berkas Gambar
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleUseSampleFile()}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 underline decoration-slate-400 underline-offset-2 hover:bg-slate-50 sm:min-h-[36px]"
                  >
                    Gunakan file contoh
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:text-left">
                {previewObjectUrl && (
                  <img
                    src={previewObjectUrl}
                    alt="Pratinjau file KK terpilih"
                    width={200}
                    height={140}
                    className="h-36 w-52 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-contain"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <FileImage className="h-4 w-4 shrink-0 text-slate-700" aria-hidden="true" />
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {selectedFile.name}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      disabled={uploading}
                      aria-label="Hapus file terpilih"
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Ganti</span>
                    </button>
                  </div>

                  {uploading && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          <Loader2
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 animate-spin text-blue-700 motion-reduce:animate-none"
                          />
                          <span>{EXTRACTION_STEPS[activeStepIndex]}</span>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                          {uploadProgress < 100
                            ? `${uploadProgress}%`
                            : `Tahap ${activeStepIndex + 1}/${EXTRACTION_STEPS.length}`}
                        </span>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-700 transition-all duration-500 ease-out"
                          style={{
                            width: `${Math.max(
                              uploadProgress < 100 ? uploadProgress : 0,
                              Math.round(((activeStepIndex + 1) / EXTRACTION_STEPS.length) * 100)
                            )}%`,
                          }}
                        />
                      </div>

                      <ol className="space-y-1.5" aria-label="Tahapan pemrosesan OCR">
                        {EXTRACTION_STEPS.map((label, idx) => {
                          const isCompleted = idx < activeStepIndex;
                          const isActive = idx === activeStepIndex;
                          return (
                            <li
                              key={label}
                              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors duration-200 ${
                                isActive
                                  ? "border border-blue-200 bg-blue-50/80 font-medium text-slate-900"
                                  : isCompleted
                                    ? "text-slate-700"
                                    : "text-slate-500"
                              }`}
                            >
                              {isCompleted ? (
                                <CheckCircle2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                                />
                              ) : isActive ? (
                                <Loader2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-700 motion-reduce:animate-none"
                                />
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500"
                                >
                                  {idx + 1}
                                </span>
                              )}
                              <span>{label}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={!selectedFile || uploading}
              onClick={() => void handleExtract()}
              className="font-display inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 sm:min-h-[38px]"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              <span>{uploading ? "Memproses Ekstraksi..." : "Proses Ekstraksi Data"}</span>
            </button>
          </div>
        </div>

        {/* Kolom Kanan: Panduan Foto KK & 3 Langkah Digitalisasi (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-4.5 text-xs text-sky-950">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-800" aria-hidden="true" />
              <div>
                <h2 className="font-display font-bold text-sky-950">Panduan Foto Kartu Keluarga</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sky-900">
                  <li>Pastikan seluruh teks NIK, Nomor KK, dan kolom tabel anggota terlihat tajam.</li>
                  <li>Letakkan dokumen di permukaan datar dengan pencahayaan merata tanpa pantulan.</li>
                  <li>Seluruh 4 sudut dokumen harus masuk penuh di dalam bingkai foto.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4.5 text-xs text-slate-800">
            <h2 className="font-display font-bold text-slate-900">
              Alur Digitalisasi KK
            </h2>
            <ol className="mt-3 space-y-2.5">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                  1
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Unggah Dokumen Asli</p>
                  <p className="text-[11px] text-slate-600">
                    Pilih foto atau hasil pindaian file KK dalam format JPG atau PNG.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                  2
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Koreksi &amp; Validasi OCR</p>
                  <p className="text-[11px] text-slate-600">
                    Sistem menandai field berakurasi rendah untuk dicek langsung terhadap dokumen asli.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                  3
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Simpan ke Basis Data</p>
                  <p className="text-[11px] text-slate-600">
                    Data tervalidasi langsung tersimpan dan dapat ditelusuri atau diexport kapan saja.
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
