import type { KategoriUsia, OCRAnggotaDraft } from "../types/kk";

export const JENIS_KELAMIN_OPTIONS = ["LAKI-LAKI", "PEREMPUAN"] as const;

export const AGAMA_OPTIONS = [
  "ISLAM",
  "KRISTEN",
  "KATOLIK",
  "HINDU",
  "BUDDHA",
  "KHONGHUCU",
] as const;

export const PENDIDIKAN_OPTIONS = [
  "TIDAK/BELUM SEKOLAH",
  "BELUM TAMAT SD/SEDERAJAT",
  "TAMAT SD/SEDERAJAT",
  "SLTP/SEDERAJAT",
  "SLTA/SEDERAJAT",
  "DIPLOMA I/II",
  "AKADEMI/DIPLOMA III/S. MUDA",
  "DIPLOMA IV/STRATA I",
  "STRATA II",
  "STRATA III",
] as const;

export const STATUS_PERKAWINAN_OPTIONS = [
  "BELUM KAWIN",
  "KAWIN",
  "KAWIN TERCATAT",
  "KAWIN BELUM TERCATAT",
  "CERAI HIDUP",
  "CERAI MATI",
] as const;

export const STATUS_HUBUNGAN_OPTIONS = [
  "KEPALA KELUARGA",
  "SUAMI",
  "ISTRI",
  "ANAK",
  "MENANTU",
  "CUCU",
  "ORANG TUA",
  "MERTUA",
  "FAMILI LAIN",
  "LAINNYA",
] as const;

export function createEmptyAnggotaDraft(): OCRAnggotaDraft {
  return {
    nik: "",
    nama_lengkap: "",
    jenis_kelamin: "",
    tempat_lahir: "",
    tanggal_lahir: "",
    agama: "",
    pendidikan: "",
    jenis_pekerjaan: "",
    status_perkawinan: "",
    status_hubungan: "",
    kewarganegaraan: "WNI",
    nama_ayah: "",
    nama_ibu: "",
  };
}

export function splitRtRw(rtRw: string): { rt: string; rw: string } {
  const parts = (rtRw || "").split("/").map((p) => p.trim());
  if (parts.length >= 2) {
    return { rt: parts[0], rw: parts[1] };
  }
  return { rt: rtRw.trim(), rw: "" };
}

export function joinRtRw(rt: string, rw: string): string {
  const cleanRt = rt.trim();
  const cleanRw = rw.trim();
  if (!cleanRt && !cleanRw) return "";
  const formattedRt = /^\d+$/.test(cleanRt) ? cleanRt.padStart(3, "0") : cleanRt || "-";
  const formattedRw = /^\d+$/.test(cleanRw) ? cleanRw.padStart(3, "0") : cleanRw || "-";
  return `${formattedRt}/${formattedRw}`;
}

export function formatRtRwDisplay(rtRw: string): string {
  const { rt, rw } = splitRtRw(rtRw);
  if (!rt && !rw) return "-";
  return `RT ${rt || "-"} / RW ${rw || "-"}`;
}

export function formatDateIndo(isoDate: string): string {
  if (!isoDate) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatTimestampIndo(isoTimestamp: string): string {
  if (!isoTimestamp) return "-";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function calculateAgeAndCategory(
  isoDate: string
): { umur: number; kategori: KategoriUsia } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dob = new Date(year, month - 1, day);
  if (
    Number.isNaN(dob.getTime()) ||
    dob.getFullYear() !== year ||
    dob.getMonth() !== month - 1 ||
    dob.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (dob > today) return null;

  let umur = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    umur -= 1;
  }
  umur = Math.max(0, umur);

  if (umur <= 4) return { umur, kategori: "Balita" };
  if (umur <= 17) return { umur, kategori: "Usia Sekolah" };
  if (umur <= 59) return { umur, kategori: "Produktif" };
  return { umur, kategori: "Lansia" };
}

export function isExact16Digits(value: string): boolean {
  return /^\d{16}$/.test(value.replace(/\s+/g, ""));
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
