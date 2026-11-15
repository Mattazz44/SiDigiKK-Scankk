import type { KategoriUsia } from "../types/kk";

const BADGE_CLASSES: Record<KategoriUsia, string> = {
  Balita: "border-sky-200 bg-sky-50 text-sky-800",
  "Usia Sekolah": "border-indigo-200 bg-indigo-50 text-indigo-800",
  Produktif: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Lansia: "border-amber-200 bg-amber-50 text-amber-900",
};

export function AgeCategoryBadge({
  kategori,
  umur,
}: {
  kategori: KategoriUsia;
  umur?: number;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${BADGE_CLASSES[kategori]}`}
    >
      <span>{kategori}</span>
      {umur !== undefined && (
        <span className="font-mono tabular-nums text-[10px] opacity-85">
          ({umur} th)
        </span>
      )}
    </span>
  );
}
