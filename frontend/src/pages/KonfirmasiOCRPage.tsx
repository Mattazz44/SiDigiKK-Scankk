import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  checkNikAvailability,
  createKk,
  resolveMediaUrl,
} from "../api/client";
import type {
  AnggotaCreate,
  OCRAnggotaDraft,
  OCRExtractionResponse,
  OCRFieldIssue,
  OCRIdentitasDraft,
} from "../types/kk";
import {
  AGAMA_OPTIONS,
  calculateAgeAndCategory,
  createEmptyAnggotaDraft,
  isExact16Digits,
  JENIS_KELAMIN_OPTIONS,
  joinRtRw,
  PENDIDIKAN_OPTIONS,
  splitRtRw,
  STATUS_HUBUNGAN_OPTIONS,
  STATUS_PERKAWINAN_OPTIONS,
} from "../utils/formatters";
import { AgeCategoryBadge } from "../components/AgeCategoryBadge";
import { DocumentPreviewPane } from "../components/DocumentPreviewPane";
import { useToast } from "../components/ToastProvider";

interface KonfirmasiOCRPageProps {
  ocrResult: OCRExtractionResponse | null;
  manualMode: boolean;
  embeddedInUserDock?: boolean;
  onSavedSuccess: (savedNoKk: string) => void;
  onCancelToUpload: () => void;
  onStartManual: () => void;
}

interface ValidationIssue {
  fieldPath: string;
  reason: string;
}

const REQUIRED_IDENTITY_LABELS: Array<[keyof OCRIdentitasDraft, string]> = [
  ["nama_kepala_keluarga", "Nama Kepala Keluarga"],
  ["alamat", "Alamat"],
  ["desa_kelurahan", "Desa/Kelurahan"],
  ["kecamatan", "Kecamatan"],
  ["kabupaten_kota", "Kabupaten/Kota"],
  ["provinsi", "Provinsi"],
];

export function KonfirmasiOCRPage({
  ocrResult,
  manualMode,
  embeddedInUserDock = false,
  onSavedSuccess,
  onCancelToUpload,
  onStartManual,
}: KonfirmasiOCRPageProps) {
  const { showToast } = useToast();

  const [identitas, setIdentitas] = useState<OCRIdentitasDraft>({
    no_kk: "",
    nama_kepala_keluarga: "",
    alamat: "",
    rt_rw: "",
    desa_kelurahan: "",
    kecamatan: "",
    kabupaten_kota: "",
    kode_pos: "",
    provinsi: "",
  });
  const [rtPart, setRtPart] = useState("");
  const [rwPart, setRwPart] = useState("");
  const [anggotaList, setAnggotaList] = useState<OCRAnggotaDraft[]>([
    createEmptyAnggotaDraft(),
  ]);

  const [editedPaths, setEditedPaths] = useState<Set<string>>(() => new Set());
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [nikDuplicateWarnings, setNikDuplicateWarnings] = useState<Record<number, string>>({});
  const [submitErrorBanner, setSubmitErrorBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState<"preview" | "form">("form");
  const [issueCursor, setIssueCursor] = useState(0);

  const fieldRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerFieldRef = useCallback(
    (fieldPath: string) => (el: HTMLElement | null) => {
      if (el) {
        fieldRefs.current.set(fieldPath, el);
      } else {
        fieldRefs.current.delete(fieldPath);
      }
    },
    []
  );

  const ocrFlagMap = useMemo(() => {
    const map = new Map<string, OCRFieldIssue>();
    for (const issue of ocrResult?.low_confidence_fields ?? []) {
      map.set(issue.field_path, issue);
    }
    return map;
  }, [ocrResult]);

  useEffect(() => {
    if (ocrResult) {
      setIdentitas({ ...ocrResult.identitas });
      const { rt, rw } = splitRtRw(ocrResult.identitas.rt_rw);
      setRtPart(rt);
      setRwPart(rw);
      setAnggotaList(
        ocrResult.anggota_keluarga.length > 0
          ? ocrResult.anggota_keluarga.map((m) => ({ ...m }))
          : [createEmptyAnggotaDraft()]
      );
      setEditedPaths(new Set());
      setServerErrors({});
      setNikDuplicateWarnings({});
      setSubmitErrorBanner(null);
      setIssueCursor(0);
      setMobileTab("form");
    } else if (manualMode) {
      setIdentitas({
        no_kk: "",
        nama_kepala_keluarga: "",
        alamat: "",
        rt_rw: "",
        desa_kelurahan: "",
        kecamatan: "",
        kabupaten_kota: "",
        kode_pos: "",
        provinsi: "",
      });
      setRtPart("");
      setRwPart("");
      setAnggotaList([createEmptyAnggotaDraft()]);
      setEditedPaths(new Set());
      setServerErrors({});
      setNikDuplicateWarnings({});
      setSubmitErrorBanner(null);
    }
  }, [ocrResult, manualMode]);

  const currentIssues = useMemo<ValidationIssue[]>(() => {
    const list: ValidationIssue[] = [];
    const seenPaths = new Set<string>();

    const pushIssue = (fieldPath: string, reason: string) => {
      if (seenPaths.has(fieldPath)) return;
      seenPaths.add(fieldPath);
      list.push({ fieldPath, reason });
    };

    const cleanNoKk = identitas.no_kk.replace(/\s+/g, "");
    const noKkDigits = cleanNoKk.replace(/\D/g, "");
    if (!isExact16Digits(cleanNoKk)) {
      pushIssue(
        "identitas.no_kk",
        `${noKkDigits.length} digit: Nomor KK harus 16 angka.`
      );
    } else if (ocrFlagMap.has("identitas.no_kk") && !editedPaths.has("identitas.no_kk")) {
      pushIssue("identitas.no_kk", ocrFlagMap.get("identitas.no_kk")!.reason);
    }

    for (const [key, label] of REQUIRED_IDENTITY_LABELS) {
      const path = `identitas.${key}`;
      const val = (identitas[key] || "").trim();
      if (!val) {
        pushIssue(path, `${label} wajib diisi.`);
      } else if (ocrFlagMap.has(path) && !editedPaths.has(path)) {
        pushIssue(path, ocrFlagMap.get(path)!.reason);
      }
    }

    if (!rtPart.trim() && !rwPart.trim()) {
      pushIssue("identitas.rt_rw", "RT/RW wajib diisi.");
    } else if (ocrFlagMap.has("identitas.rt_rw") && !editedPaths.has("identitas.rt_rw")) {
      pushIssue("identitas.rt_rw", ocrFlagMap.get("identitas.rt_rw")!.reason);
    }

    const cleanKodePos = identitas.kode_pos.replace(/\s+/g, "");
    if (cleanKodePos && !/^\d{5}$/.test(cleanKodePos)) {
      pushIssue("identitas.kode_pos", "Kode Pos harus 5 digit angka.");
    }

    const nikCounts = new Map<string, number>();
    anggotaList.forEach((m) => {
      const c = m.nik.replace(/\s+/g, "");
      if (c) nikCounts.set(c, (nikCounts.get(c) ?? 0) + 1);
    });

    anggotaList.forEach((member, idx) => {
      const nikPath = `anggota.${idx}.nik`;
      const cleanNik = member.nik.replace(/\s+/g, "");
      const nikDigits = cleanNik.replace(/\D/g, "");
      if (!isExact16Digits(cleanNik)) {
        pushIssue(nikPath, `${nikDigits.length} digit: NIK harus 16 angka.`);
      } else if ((nikCounts.get(cleanNik) ?? 0) > 1) {
        pushIssue(nikPath, "NIK duplikat dengan anggota lain di form ini.");
      } else if (nikDuplicateWarnings[idx]) {
        pushIssue(nikPath, nikDuplicateWarnings[idx]);
      } else if (ocrFlagMap.has(nikPath) && !editedPaths.has(nikPath)) {
        pushIssue(nikPath, ocrFlagMap.get(nikPath)!.reason);
      }

      const requiredMemberFields: Array<[keyof OCRAnggotaDraft, string]> = [
        ["nama_lengkap", "Nama Lengkap"],
        ["jenis_kelamin", "Jenis Kelamin"],
        ["tempat_lahir", "Tempat Lahir"],
        ["tanggal_lahir", "Tanggal Lahir"],
        ["agama", "Agama"],
        ["pendidikan", "Pendidikan"],
        ["jenis_pekerjaan", "Jenis Pekerjaan"],
        ["status_perkawinan", "Status Perkawinan"],
        ["status_hubungan", "Status Hubungan"],
        ["kewarganegaraan", "Kewarganegaraan"],
      ];

      for (const [key, label] of requiredMemberFields) {
        const path = `anggota.${idx}.${key}`;
        const val = (member[key] || "").trim();
        if (!val) {
          pushIssue(path, `${label} baris ${idx + 1} wajib diisi.`);
        } else if (key === "tanggal_lahir" && !calculateAgeAndCategory(val)) {
          pushIssue(path, `Tanggal lahir baris ${idx + 1} tidak valid.`);
        } else if (ocrFlagMap.has(path) && !editedPaths.has(path)) {
          pushIssue(path, ocrFlagMap.get(path)!.reason);
        }
      }
    });

    for (const [path, msg] of Object.entries(serverErrors)) {
      pushIssue(path, msg);
    }

    return list;
  }, [
    identitas,
    rtPart,
    rwPart,
    anggotaList,
    ocrFlagMap,
    editedPaths,
    nikDuplicateWarnings,
    serverErrors,
  ]);

  const issueByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of currentIssues) {
      map.set(item.fieldPath, item.reason);
    }
    return map;
  }, [currentIssues]);

  const focusFieldPath = useCallback((fieldPath: string) => {
    setMobileTab("form");
    const tryFocus = () => {
      const target = fieldRefs.current.get(fieldPath);
      if (target && target.offsetParent !== null) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus();
        return true;
      }
      return false;
    };
    if (!tryFocus()) {
      window.setTimeout(() => {
        const target = fieldRefs.current.get(fieldPath);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.focus();
        }
      }, 60);
    }
  }, []);

  // Automatically focus the first problematic field when an OCR draft loads.
  useEffect(() => {
    if (!ocrResult) return;
    const firstIssue =
      ocrResult.low_confidence_fields[0]?.field_path ??
      currentIssues[0]?.fieldPath;
    if (firstIssue) {
      focusFieldPath(firstIssue);
    }
    // Run only when a fresh ocrResult arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocrResult]);

  if (!ocrResult && !manualMode) {
    return (
      <div
        className={`mx-auto flex max-w-2xl flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center ${
          embeddedInUserDock ? "min-h-[50vh]" : ""
        }`}
      >
        <h1 className="font-display text-base font-bold text-slate-900">
          Belum Ada Draft OCR yang Aktif
        </h1>
        <p className="mt-1.5 max-w-md text-xs text-slate-600">
          Unggah gambar Kartu Keluarga terlebih dahulu untuk menjalankan ekstraksi otomatis, atau mulai pengisian data secara manual.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <button
            type="button"
            onClick={onCancelToUpload}
            className="font-display inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 sm:min-h-[36px]"
          >
            <FileUp className="h-4 w-4" aria-hidden="true" />
            <span>Unggah Scan KK</span>
          </button>
          <button
            type="button"
            onClick={onStartManual}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 sm:min-h-[36px]"
          >
            Input Manual Tanpa Scan
          </button>
        </div>
      </div>
    );
  }

  const markEdited = (path: string) => {
    setEditedPaths((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    if (serverErrors[path]) {
      setServerErrors((prev) => {
        const copy = { ...prev };
        delete copy[path];
        return copy;
      });
    }
  };

  const updateIdentityField = (key: keyof OCRIdentitasDraft, value: string) => {
    markEdited(`identitas.${key}`);
    setIdentitas((prev) => ({ ...prev, [key]: value }));
  };

  const updateMemberField = (
    idx: number,
    key: keyof OCRAnggotaDraft,
    value: string
  ) => {
    markEdited(`anggota.${idx}.${key}`);
    setAnggotaList((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item))
    );
    if (key === "nik") {
      setNikDuplicateWarnings((prev) => {
        if (!prev[idx]) return prev;
        const copy = { ...prev };
        delete copy[idx];
        return copy;
      });
    }
  };

  const handleNikBlurCheck = async (idx: number, rawNik: string) => {
    const cleaned = rawNik.replace(/\s+/g, "");
    if (!isExact16Digits(cleaned)) return;
    try {
      const check = await checkNikAvailability(cleaned);
      if (check.exists) {
        setNikDuplicateWarnings((prev) => ({
          ...prev,
          [idx]: `NIK sudah terdaftar pada KK ${check.existing_no_kk} (${check.existing_nama}).`,
        }));
      }
    } catch {
      // Final uniqueness check is still enforced by POST /api/kk.
    }
  };

  const handleValidationPillClick = () => {
    if (currentIssues.length === 0) return;
    const target = currentIssues[issueCursor % currentIssues.length];
    setIssueCursor((prev) => prev + 1);
    focusFieldPath(target.fieldPath);
  };

  const handleSubmit = async () => {
    setSubmitErrorBanner(null);

    const cleanNoKk = identitas.no_kk.replace(/\s+/g, "");
    const rtRwCombined = joinRtRw(rtPart, rwPart);

    const invalidBlocking = currentIssues.filter((issue) => {
      if (issue.fieldPath.endsWith(".no_kk") && !isExact16Digits(cleanNoKk)) return true;
      if (issue.fieldPath.endsWith(".nik")) return true;
      if (issue.reason.includes("wajib diisi") || issue.reason.includes("tidak valid") || issue.reason.includes("sudah terdaftar") || issue.reason.includes("duplikat")) {
        return true;
      }
      return false;
    });

    if (invalidBlocking.length > 0) {
      setSubmitErrorBanner(invalidBlocking[0].reason);
      focusFieldPath(invalidBlocking[0].fieldPath);
      showToast("Periksa kembali field yang ditandai sebelum menyimpan.", "warning");
      return;
    }

    setSaving(true);
    try {
      const membersPayload: AnggotaCreate[] = anggotaList.map((m) => ({
        nik: m.nik.replace(/\s+/g, ""),
        nama_lengkap: m.nama_lengkap.trim(),
        jenis_kelamin: m.jenis_kelamin.trim(),
        tempat_lahir: m.tempat_lahir.trim(),
        tanggal_lahir: m.tanggal_lahir.trim(),
        agama: m.agama.trim(),
        pendidikan: m.pendidikan.trim(),
        jenis_pekerjaan: m.jenis_pekerjaan.trim(),
        status_perkawinan: m.status_perkawinan.trim(),
        status_hubungan: m.status_hubungan.trim(),
        kewarganegaraan: m.kewarganegaraan.trim() || "WNI",
        nama_ayah: m.nama_ayah.trim() || "-",
        nama_ibu: m.nama_ibu.trim() || "-",
      }));

      const saved = await createKk({
        no_kk: cleanNoKk,
        nama_kepala_keluarga: identitas.nama_kepala_keluarga.trim(),
        alamat: identitas.alamat.trim(),
        rt_rw: rtRwCombined,
        desa_kelurahan: identitas.desa_kelurahan.trim(),
        kecamatan: identitas.kecamatan.trim(),
        kabupaten_kota: identitas.kabupaten_kota.trim(),
        kode_pos: identitas.kode_pos.replace(/\s+/g, ""),
        provinsi: identitas.provinsi.trim(),
        file_gambar_path: null,
        temp_ocr_filename: ocrResult?.temp_filename ?? null,
        anggota_keluarga: membersPayload,
      });

      showToast(
        `KK ${saved.no_kk} (${saved.nama_kepala_keluarga}) berhasil disimpan ke database.`,
        "success"
      );
      onSavedSuccess(saved.no_kk);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitErrorBanner(err.message);
        if (err.conflicts && err.conflicts.length > 0) {
          const nextServerErrors: Record<string, string> = {};
          err.conflicts.forEach((conflict) => {
            const idx = anggotaList.findIndex(
              (m) => m.nik.replace(/\s+/g, "") === conflict.nik
            );
            if (idx >= 0) {
              nextServerErrors[`anggota.${idx}.nik`] =
                `NIK sudah terdaftar di KK ${conflict.existing_no_kk} (${conflict.existing_nama}).`;
            }
          });
          setServerErrors(nextServerErrors);
          const firstConflictPath = Object.keys(nextServerErrors)[0];
          if (firstConflictPath) focusFieldPath(firstConflictPath);
        } else if (err.status === 409 && err.message.includes("Nomor KK")) {
          setServerErrors({ "identitas.no_kk": err.message });
          focusFieldPath("identitas.no_kk");
        }
        showToast(err.message, "error");
      } else {
        setSubmitErrorBanner("Gagal menyimpan data KK ke server.");
      }
    } finally {
      setSaving(false);
    }
  };

  const getFieldInputClass = (fieldPath: string, mono = false) => {
    const hasIssue = issueByPath.has(fieldPath);
    return `mt-1 w-full rounded-md border px-2.5 py-2 text-xs text-slate-900 sm:py-1.5 ${
      mono ? "font-mono tabular-nums" : ""
    } ${
      hasIssue
        ? "border-amber-400 bg-amber-50/40"
        : "border-slate-300 bg-white focus:border-blue-700"
    }`;
  };

  const hasPreview = Boolean(ocrResult?.preview_url);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            {hasPreview
              ? "Konfirmasi & Koreksi Hasil OCR"
              : "Input Manual Kartu Keluarga"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            {hasPreview
              ? "Periksa data hasil OCR terhadap dokumen asli di sebelah kiri, lalu koreksi field yang ditandai."
              : "Lengkapi identitas Kartu Keluarga beserta seluruh anggota keluarganya sebelum disimpan ke database."}
          </p>
        </div>

        <button
          type="button"
          onClick={handleValidationPillClick}
          disabled={currentIssues.length === 0}
          className={`inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs font-semibold sm:min-h-[32px] sm:self-auto ${
            currentIssues.length > 0
              ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {currentIssues.length > 0 ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              <span>
                {currentIssues.length} data perlu diperiksa (klik untuk fokus)
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              <span>Data valid dan siap disimpan</span>
            </>
          )}
        </button>
      </div>

      {ocrResult?.warnings && ocrResult.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
          <p className="font-semibold">
            Catatan Engine OCR ({ocrResult.ocr_engine}):
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {ocrResult.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {submitErrorBanner && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
        >
          {submitErrorBanner}
        </div>
      )}

      {hasPreview && (
        <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`min-h-[44px] rounded text-xs font-semibold ${
              mobileTab === "preview"
                ? "bg-white text-slate-900"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Preview Dokumen
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("form")}
            className={`min-h-[44px] rounded text-xs font-semibold ${
              mobileTab === "form"
                ? "bg-white text-slate-900"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Form Koreksi ({currentIssues.length})
          </button>
        </div>
      )}

      <div
        className={
          hasPreview
            ? "grid grid-cols-1 gap-4 lg:grid-cols-12"
            : "mx-auto max-w-4xl"
        }
      >
        {hasPreview && ocrResult && (
          <div
            className={`lg:col-span-6 ${
              mobileTab === "preview" ? "block" : "hidden lg:block"
            }`}
          >
            <div className="lg:sticky lg:top-4">
              <DocumentPreviewPane
                previewUrl={resolveMediaUrl(ocrResult.preview_url)}
                preprocessedUrl={
                  ocrResult.preprocessed_preview_url
                    ? resolveMediaUrl(ocrResult.preprocessed_preview_url)
                    : null
                }
              />
            </div>
          </div>
        )}

        <div
          onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
            if (e.key !== "Enter") return;
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              void handleSubmit();
              return;
            }
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const tag = target.tagName;
            if (tag === "INPUT" || tag === "SELECT") {
              e.preventDefault();
              const focusables = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "input:not([disabled]):not([type='hidden']), select:not([disabled])"
                )
              );
              const idx = focusables.indexOf(target);
              if (idx >= 0 && idx + 1 < focusables.length) {
                focusables[idx + 1].focus();
              }
            }
          }}
          className={`${hasPreview ? "lg:col-span-6" : ""} ${
            hasPreview && mobileTab !== "form" ? "hidden lg:block" : "block"
          } space-y-4`}
        >
          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
              <h2 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                A. Data Identitas KK
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="field-no-kk"
                  className="block text-xs font-medium text-slate-700"
                >
                  Nomor KK (16 digit)
                </label>
                <input
                  id="field-no-kk"
                  ref={registerFieldRef("identitas.no_kk")}
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={identitas.no_kk}
                  onChange={(e) =>
                    updateIdentityField(
                      "no_kk",
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder="16 digit Nomor KK"
                  className={getFieldInputClass("identitas.no_kk", true)}
                />
                {issueByPath.has("identitas.no_kk") && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-800">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{issueByPath.get("identitas.no_kk")}</span>
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="field-kepala"
                  className="block text-xs font-medium text-slate-700"
                >
                  Nama Kepala Keluarga
                </label>
                <input
                  id="field-kepala"
                  ref={registerFieldRef("identitas.nama_kepala_keluarga")}
                  type="text"
                  value={identitas.nama_kepala_keluarga}
                  onChange={(e) =>
                    updateIdentityField("nama_kepala_keluarga", e.target.value)
                  }
                  className={getFieldInputClass("identitas.nama_kepala_keluarga")}
                />
                {issueByPath.has("identitas.nama_kepala_keluarga") && (
                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                    {issueByPath.get("identitas.nama_kepala_keluarga")}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="field-alamat"
                  className="block text-xs font-medium text-slate-700"
                >
                  Alamat
                </label>
                <input
                  id="field-alamat"
                  ref={registerFieldRef("identitas.alamat")}
                  type="text"
                  value={identitas.alamat}
                  onChange={(e) => updateIdentityField("alamat", e.target.value)}
                  className={getFieldInputClass("identitas.alamat")}
                />
                {issueByPath.has("identitas.alamat") && (
                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                    {issueByPath.get("identitas.alamat")}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="field-rt"
                  className="block text-xs font-medium text-slate-700"
                >
                  RT
                </label>
                <input
                  id="field-rt"
                  ref={registerFieldRef("identitas.rt_rw")}
                  type="text"
                  value={rtPart}
                  onChange={(e) => {
                    markEdited("identitas.rt_rw");
                    setRtPart(e.target.value);
                  }}
                  placeholder="002"
                  className={getFieldInputClass("identitas.rt_rw", true)}
                />
              </div>

              <div>
                <label
                  htmlFor="field-rw"
                  className="block text-xs font-medium text-slate-700"
                >
                  RW
                </label>
                <input
                  id="field-rw"
                  type="text"
                  value={rwPart}
                  onChange={(e) => {
                    markEdited("identitas.rt_rw");
                    setRwPart(e.target.value);
                  }}
                  placeholder="004 atau -"
                  className={getFieldInputClass("identitas.rt_rw", true)}
                />
                {issueByPath.has("identitas.rt_rw") && (
                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                    {issueByPath.get("identitas.rt_rw")}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="field-kelurahan"
                  className="block text-xs font-medium text-slate-700"
                >
                  Desa / Kelurahan
                </label>
                <input
                  id="field-kelurahan"
                  ref={registerFieldRef("identitas.desa_kelurahan")}
                  type="text"
                  value={identitas.desa_kelurahan}
                  onChange={(e) =>
                    updateIdentityField("desa_kelurahan", e.target.value)
                  }
                  className={getFieldInputClass("identitas.desa_kelurahan")}
                />
              </div>

              <div>
                <label
                  htmlFor="field-kecamatan"
                  className="block text-xs font-medium text-slate-700"
                >
                  Kecamatan
                </label>
                <input
                  id="field-kecamatan"
                  ref={registerFieldRef("identitas.kecamatan")}
                  type="text"
                  value={identitas.kecamatan}
                  onChange={(e) =>
                    updateIdentityField("kecamatan", e.target.value)
                  }
                  className={getFieldInputClass("identitas.kecamatan")}
                />
              </div>

              <div>
                <label
                  htmlFor="field-kabupaten"
                  className="block text-xs font-medium text-slate-700"
                >
                  Kabupaten / Kota
                </label>
                <input
                  id="field-kabupaten"
                  ref={registerFieldRef("identitas.kabupaten_kota")}
                  type="text"
                  value={identitas.kabupaten_kota}
                  onChange={(e) =>
                    updateIdentityField("kabupaten_kota", e.target.value)
                  }
                  className={getFieldInputClass("identitas.kabupaten_kota")}
                />
              </div>

              <div>
                <label
                  htmlFor="field-kodepos"
                  className="block text-xs font-medium text-slate-700"
                >
                  Kode Pos
                </label>
                <input
                  id="field-kodepos"
                  ref={registerFieldRef("identitas.kode_pos")}
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={identitas.kode_pos}
                  onChange={(e) =>
                    updateIdentityField(
                      "kode_pos",
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder="5 digit"
                  className={getFieldInputClass("identitas.kode_pos", true)}
                />
                {issueByPath.has("identitas.kode_pos") && (
                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                    {issueByPath.get("identitas.kode_pos")}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="field-provinsi"
                  className="block text-xs font-medium text-slate-700"
                >
                  Provinsi
                </label>
                <input
                  id="field-provinsi"
                  ref={registerFieldRef("identitas.provinsi")}
                  type="text"
                  value={identitas.provinsi}
                  onChange={(e) =>
                    updateIdentityField("provinsi", e.target.value)
                  }
                  className={getFieldInputClass("identitas.provinsi")}
                />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
              <h2 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                B. Daftar Anggota Keluarga ({anggotaList.length} orang)
              </h2>
              <button
                type="button"
                onClick={() =>
                  setAnggotaList((prev) => [...prev, createEmptyAnggotaDraft()])
                }
                className="inline-flex min-h-[36px] items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 sm:min-h-[30px]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tambah Anggota</span>
              </button>
            </div>

            <div className="divide-y divide-slate-200">
              {anggotaList.map((member, idx) => {
                const agePreview = calculateAgeAndCategory(member.tanggal_lahir);
                return (
                  <div key={idx} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-900 font-mono tabular-nums text-[11px] font-semibold text-white">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {member.nama_lengkap || `Anggota Baris ${idx + 1}`}
                        </span>
                        {agePreview && (
                          <AgeCategoryBadge
                            kategori={agePreview.kategori}
                            umur={agePreview.umur}
                          />
                        )}
                      </div>
                      {anggotaList.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setAnggotaList((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          aria-label={`Hapus anggota baris ${idx + 1}`}
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Hapus Baris</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`anggota-${idx}-nik`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          NIK (16 digit)
                        </label>
                        <input
                          id={`anggota-${idx}-nik`}
                          ref={registerFieldRef(`anggota.${idx}.nik`)}
                          type="text"
                          inputMode="numeric"
                          maxLength={16}
                          value={member.nik}
                          onChange={(e) =>
                            updateMemberField(
                              idx,
                              "nik",
                              e.target.value.replace(/\D/g, "")
                            )
                          }
                          onBlur={(e) => void handleNikBlurCheck(idx, e.target.value)}
                          placeholder="16 digit NIK"
                          className={getFieldInputClass(`anggota.${idx}.nik`, true)}
                        />
                        {issueByPath.has(`anggota.${idx}.nik`) && (
                          <p className="mt-1 text-[11px] font-medium text-amber-800">
                            {issueByPath.get(`anggota.${idx}.nik`)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-nama`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Nama Lengkap
                        </label>
                        <input
                          id={`anggota-${idx}-nama`}
                          ref={registerFieldRef(`anggota.${idx}.nama_lengkap`)}
                          type="text"
                          value={member.nama_lengkap}
                          onChange={(e) =>
                            updateMemberField(idx, "nama_lengkap", e.target.value)
                          }
                          className={getFieldInputClass(`anggota.${idx}.nama_lengkap`)}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-jk`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Jenis Kelamin
                        </label>
                        <select
                          id={`anggota-${idx}-jk`}
                          ref={registerFieldRef(`anggota.${idx}.jenis_kelamin`)}
                          value={member.jenis_kelamin}
                          onChange={(e) =>
                            updateMemberField(idx, "jenis_kelamin", e.target.value)
                          }
                          className={getFieldInputClass(`anggota.${idx}.jenis_kelamin`)}
                        >
                          <option value="">Pilih jenis kelamin</option>
                          {JENIS_KELAMIN_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-agama`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Agama
                        </label>
                        <input
                          id={`anggota-${idx}-agama`}
                          ref={registerFieldRef(`anggota.${idx}.agama`)}
                          list="ocr-agama-list"
                          value={member.agama}
                          onChange={(e) =>
                            updateMemberField(idx, "agama", e.target.value)
                          }
                          className={getFieldInputClass(`anggota.${idx}.agama`)}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-tempat`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Tempat Lahir
                        </label>
                        <input
                          id={`anggota-${idx}-tempat`}
                          ref={registerFieldRef(`anggota.${idx}.tempat_lahir`)}
                          type="text"
                          value={member.tempat_lahir}
                          onChange={(e) =>
                            updateMemberField(idx, "tempat_lahir", e.target.value)
                          }
                          className={getFieldInputClass(`anggota.${idx}.tempat_lahir`)}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-tgl`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Tanggal Lahir
                        </label>
                        <input
                          id={`anggota-${idx}-tgl`}
                          ref={registerFieldRef(`anggota.${idx}.tanggal_lahir`)}
                          type="date"
                          value={member.tanggal_lahir}
                          onChange={(e) =>
                            updateMemberField(idx, "tanggal_lahir", e.target.value)
                          }
                          className={getFieldInputClass(
                            `anggota.${idx}.tanggal_lahir`,
                            true
                          )}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-pendidikan`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Pendidikan
                        </label>
                        <input
                          id={`anggota-${idx}-pendidikan`}
                          ref={registerFieldRef(`anggota.${idx}.pendidikan`)}
                          list="ocr-pendidikan-list"
                          value={member.pendidikan}
                          onChange={(e) =>
                            updateMemberField(idx, "pendidikan", e.target.value)
                          }
                          className={getFieldInputClass(`anggota.${idx}.pendidikan`)}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-pekerjaan`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Jenis Pekerjaan
                        </label>
                        <input
                          id={`anggota-${idx}-pekerjaan`}
                          ref={registerFieldRef(`anggota.${idx}.jenis_pekerjaan`)}
                          type="text"
                          value={member.jenis_pekerjaan}
                          onChange={(e) =>
                            updateMemberField(
                              idx,
                              "jenis_pekerjaan",
                              e.target.value
                            )
                          }
                          className={getFieldInputClass(
                            `anggota.${idx}.jenis_pekerjaan`
                          )}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-kawin`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Status Perkawinan
                        </label>
                        <input
                          id={`anggota-${idx}-kawin`}
                          ref={registerFieldRef(`anggota.${idx}.status_perkawinan`)}
                          list="ocr-kawin-list"
                          value={member.status_perkawinan}
                          onChange={(e) =>
                            updateMemberField(
                              idx,
                              "status_perkawinan",
                              e.target.value
                            )
                          }
                          className={getFieldInputClass(
                            `anggota.${idx}.status_perkawinan`
                          )}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-hubungan`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Status Hubungan
                        </label>
                        <input
                          id={`anggota-${idx}-hubungan`}
                          ref={registerFieldRef(`anggota.${idx}.status_hubungan`)}
                          list="ocr-hubungan-list"
                          value={member.status_hubungan}
                          onChange={(e) =>
                            updateMemberField(
                              idx,
                              "status_hubungan",
                              e.target.value
                            )
                          }
                          className={getFieldInputClass(
                            `anggota.${idx}.status_hubungan`
                          )}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-ayah`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Nama Ayah
                        </label>
                        <input
                          id={`anggota-${idx}-ayah`}
                          type="text"
                          value={member.nama_ayah}
                          onChange={(e) =>
                            updateMemberField(idx, "nama_ayah", e.target.value)
                          }
                          placeholder="-"
                          className={getFieldInputClass(`anggota.${idx}.nama_ayah`)}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`anggota-${idx}-ibu`}
                          className="block text-[11px] font-medium text-slate-700"
                        >
                          Nama Ibu
                        </label>
                        <input
                          id={`anggota-${idx}-ibu`}
                          type="text"
                          value={member.nama_ibu}
                          onChange={(e) =>
                            updateMemberField(idx, "nama_ibu", e.target.value)
                          }
                          placeholder="-"
                          className={getFieldInputClass(`anggota.${idx}.nama_ibu`)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div
        className={`${
          embeddedInUserDock
            ? "bg-slate-50/70"
            : "sticky bottom-3 z-20 bg-white"
        } flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-4 py-3`}
      >
        <p className="text-xs text-slate-600">
          {currentIssues.length > 0
            ? `${currentIssues.length} field memerlukan verifikasi sebelum disimpan.`
            : "Seluruh field wajib tervalidasi."}
        </p>
        <div className="flex w-full justify-end gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onCancelToUpload}
            disabled={saving}
            className="min-h-[44px] rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-[36px]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="font-display inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400 sm:min-h-[36px]"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {saving ? "Menyimpan..." : "Konfirmasi & Simpan ke Database"}
            </span>
          </button>
        </div>
      </div>

      <datalist id="ocr-agama-list">
        {AGAMA_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="ocr-pendidikan-list">
        {PENDIDIKAN_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="ocr-kawin-list">
        {STATUS_PERKAWINAN_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="ocr-hubungan-list">
        {STATUS_HUBUNGAN_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </div>
  );
}
