import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  CheckSquare,
  Copy,
  FileText,
  FileUp,
  Search,
  Users,
  X,
} from "lucide-react";
import { ApiError, getKkDetail, listKk } from "../api/client";
import type {
  KKDetailOut,
  KKListItem,
  OCRExtractionResponse,
} from "../types/kk";
import {
  copyTextToClipboard,
  formatDateIndo,
  formatRtRwDisplay,
  formatTimestampIndo,
} from "../utils/formatters";
import { InputKKPage } from "../pages/InputKKPage";
import { KonfirmasiOCRPage } from "../pages/KonfirmasiOCRPage";
import { AgeCategoryBadge } from "./AgeCategoryBadge";
import { InteractiveDotBackground } from "./InteractiveDotBackground";
import { useToast } from "./ToastProvider";

type UserTab = "input" | "confirm" | "cards";

interface UserWorkspaceProps {
  backendHealthy: boolean | null;
}

function UserSavedCardsView({ onStartInput }: { onStartInput: () => void }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<KKListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedNoKk, setCopiedNoKk] = useState<string | null>(null);

  const [detailTarget, setDetailTarget] = useState<KKDetailOut | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await listKk({
        page: 1,
        page_size: 20,
        search: debouncedSearch || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Gagal memuat daftar Kartu Keluarga."
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!detailTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailTarget(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailTarget]);

  const handleCopy = async (noKk: string) => {
    const ok = await copyTextToClipboard(noKk);
    if (ok) {
      setCopiedNoKk(noKk);
      showToast(`Tersalin: ${noKk}`, "success");
      window.setTimeout(() => {
        setCopiedNoKk((curr) => (curr === noKk ? null : curr));
      }, 1500);
    }
  };

  const handleOpenDetail = async (noKk: string) => {
    setDetailLoading(true);
    try {
      const detail = await getKkDetail(noKk);
      setDetailTarget(detail);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Gagal memuat detail KK.",
        "error"
      );
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-base font-bold tracking-tight text-slate-900">
              Daftar Kartu Keluarga Tersimpan
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              {total} dokumen KK tercatat. Klik kartu untuk melihat rincian anggota keluarga.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari No. KK, Nama, atau NIK..."
              aria-label="Cari Kartu Keluarga"
              className="w-full rounded-lg border border-slate-300 bg-slate-50/70 py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-blue-700 focus:bg-white"
            />
          </div>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
        >
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white/90 p-4"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white/90 p-8 text-center backdrop-blur-xs">
          <p className="font-display text-base font-bold text-slate-800">
            {debouncedSearch
              ? "Tidak ditemukan Kartu Keluarga yang cocok."
              : "Belum ada Kartu Keluarga yang diunggah."}
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-600">
            {debouncedSearch
              ? "Ubah kata kunci pencarian Anda untuk menampilkan daftar kartu."
              : "Mulai unggah foto atau pindaian Kartu Keluarga di tab Input KK untuk melihat daftar di sini."}
          </p>
          {!debouncedSearch && (
            <button
              type="button"
              onClick={onStartInput}
              className="font-display mt-5 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Input KK Sekarang</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.no_kk}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-xs backdrop-blur-xs transition-colors hover:border-slate-300"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-800">
                      {item.no_kk}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopy(item.no_kk)}
                      aria-label={`Salin Nomor KK ${item.no_kk}`}
                      title="Salin Nomor KK"
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      {copiedNoKk === item.no_kk ? (
                        <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    <span>{item.jumlah_anggota} jiwa</span>
                  </span>
                </div>

                <h2 className="mt-2.5 text-sm font-semibold text-slate-900">
                  {item.nama_kepala_keluarga}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {item.alamat} ({formatRtRwDisplay(item.rt_rw)})
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.desa_kelurahan}, {item.kecamatan}, {item.kabupaten_kota}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[11px] text-slate-500">
                  {formatTimestampIndo(item.created_at)}
                </span>
                <button
                  type="button"
                  disabled={detailLoading}
                  onClick={() => void handleOpenDetail(item.no_kk)}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                >
                  Lihat Anggota
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {detailTarget && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-kk-detail-title"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div>
                <h2
                  id="user-kk-detail-title"
                  className="font-display text-sm font-semibold text-slate-900"
                >
                  {detailTarget.nama_kepala_keluarga}
                </h2>
                <p className="text-xs text-slate-600">
                  No. KK: <span className="font-mono tabular-nums font-semibold text-slate-900">{detailTarget.no_kk}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                aria-label="Tutup rincian Kartu Keluarga"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 sm:min-h-[34px] sm:min-w-[34px]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="text-[11px] text-slate-500">Alamat</span>
                  <p className="font-medium text-slate-900">
                    {detailTarget.alamat} ({formatRtRwDisplay(detailTarget.rt_rw)})
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Kelurahan / Kecamatan</span>
                  <p className="font-medium text-slate-900">
                    {detailTarget.desa_kelurahan}, {detailTarget.kecamatan}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Kota / Provinsi</span>
                  <p className="font-medium text-slate-900">
                    {detailTarget.kabupaten_kota}, {detailTarget.provinsi}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-700">
                  Daftar Anggota Keluarga ({detailTarget.anggota_keluarga.length})
                </h3>
                {detailTarget.anggota_keluarga.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {member.nama_lengkap}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        NIK <span className="font-mono tabular-nums font-semibold text-slate-900">{member.nik}</span> | {member.tempat_lahir},{" "}
                        {formatDateIndo(member.tanggal_lahir)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {member.status_hubungan} | {member.jenis_pekerjaan}
                      </p>
                    </div>
                    <AgeCategoryBadge
                      kategori={member.kategori_usia}
                      umur={member.umur}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UserWorkspace({ backendHealthy }: UserWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<UserTab>("input");
  const [ocrDraft, setOcrDraft] = useState<OCRExtractionResponse | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Record<UserTab, HTMLButtonElement | null>>({
    input: null,
    confirm: null,
    cards: null,
  });
  const [pillRect, setPillRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [pillAnimated, setPillAnimated] = useState(false);

  const handleOcrSuccess = (result: OCRExtractionResponse) => {
    setOcrDraft(result);
    setManualMode(false);
    setActiveTab("confirm");
  };

  const handleStartManualEntry = () => {
    setOcrDraft(null);
    setManualMode(true);
    setActiveTab("confirm");
  };

  const handleSavedSuccess = () => {
    setOcrDraft(null);
    setManualMode(false);
    setActiveTab("cards");
  };

  const handleCancelToUpload = () => {
    setOcrDraft(null);
    setManualMode(false);
    setActiveTab("input");
  };

  const hasDraft = ocrDraft !== null || manualMode;
  const issueCount = ocrDraft?.low_confidence_fields.length ?? 0;

  const updatePillMetrics = useCallback(() => {
    const activeButton = tabRefs.current[activeTab];
    if (!activeButton) return;
    const nextRect = {
      left: activeButton.offsetLeft,
      top: activeButton.offsetTop,
      width: activeButton.offsetWidth,
      height: activeButton.offsetHeight,
    };
    setPillRect((prev) =>
      prev.left === nextRect.left &&
      prev.top === nextRect.top &&
      prev.width === nextRect.width &&
      prev.height === nextRect.height
        ? prev
        : nextRect
    );
  }, [activeTab]);

  useLayoutEffect(() => {
    updatePillMetrics();
  }, [updatePillMetrics, hasDraft, issueCount]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updatePillMetrics();
      setPillAnimated(true);
    });

    const handleResize = () => updatePillMetrics();
    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && navRef.current) {
      observer = new ResizeObserver(() => updatePillMetrics());
      observer.observe(navRef.current);
      Object.values(tabRefs.current).forEach((btn) => {
        if (btn) observer?.observe(btn);
      });
    }

    if ("fonts" in document && document.fonts?.ready) {
      void document.fonts.ready.then(() => updatePillMetrics());
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
  }, [updatePillMetrics]);

  return (
    <div className="relative min-h-screen text-slate-900">
      <InteractiveDotBackground />

      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/rusdi.jpg"
              alt="Logo SiDigiKK"
              width={36}
              height={36}
              fetchPriority="high"
              className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover shadow-2xs"
            />
            <div>
              <p className="font-display text-sm font-bold tracking-tight text-slate-900">
                SiDigiKK
              </p>
              <p className="text-[11px] text-slate-500">
                Portal Digitalisasi Kartu Keluarga
              </p>
            </div>
          </div>

          {/* Hanya tampilkan indikator jika server offline */}
          {backendHealthy === false && (
            <span
              role="alert"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse"
              />
              <span>Server Offline</span>
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-36 md:max-w-3xl lg:max-w-5xl sm:px-6 sm:pb-32">
        <div key={activeTab} className="animate-ios-tab-enter">
          {activeTab === "input" && (
            <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-xs backdrop-blur-xs sm:p-6 lg:p-7">
              <InputKKPage
                onOcrSuccess={handleOcrSuccess}
                onStartManualEntry={handleStartManualEntry}
              />
            </div>
          )}

          {activeTab === "confirm" && (
            <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-xs backdrop-blur-xs sm:p-6 lg:p-7">
              <KonfirmasiOCRPage
                ocrResult={ocrDraft}
                manualMode={manualMode}
                embeddedInUserDock
                onSavedSuccess={handleSavedSuccess}
                onCancelToUpload={handleCancelToUpload}
                onStartManual={handleStartManualEntry}
              />
            </div>
          )}

          {activeTab === "cards" && (
            <UserSavedCardsView onStartInput={() => setActiveTab("input")} />
          )}
        </div>
      </main>

      <nav
        ref={navRef}
        aria-label="Navigasi Portal User"
        className="fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100vw-0.5rem)] -translate-x-1/2 items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/85 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:gap-1"
      >
        <span
          aria-hidden="true"
          style={{
            width: `${pillRect.width}px`,
            height: `${pillRect.height}px`,
            top: `${pillRect.top}px`,
            transform: `translate3d(${pillRect.left}px, 0, 0)`,
            opacity: pillRect.width > 0 ? 1 : 0,
          }}
          className={`pointer-events-none absolute left-0 rounded-full bg-slate-900 shadow-xs ${
            pillAnimated ? "ios-sliding-pill" : ""
          }`}
        />

        <button
          ref={(el) => {
            tabRefs.current.input = el;
          }}
          type="button"
          onClick={() => setActiveTab("input")}
          aria-current={activeTab === "input" ? "page" : undefined}
          className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2.5 text-xs font-medium active:scale-95 transition-[color,transform] duration-150 min-[380px]:px-3.5 sm:px-5 sm:text-sm ${
            activeTab === "input"
              ? "text-white"
              : "text-slate-700 hover:text-slate-900"
          }`}
        >
          <FileUp className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="whitespace-nowrap">Input KK</span>
        </button>

        <button
          ref={(el) => {
            tabRefs.current.confirm = el;
          }}
          type="button"
          onClick={() => setActiveTab("confirm")}
          aria-current={activeTab === "confirm" ? "page" : undefined}
          className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2.5 text-xs font-medium active:scale-95 transition-[color,transform] duration-150 min-[380px]:px-3.5 sm:px-5 sm:text-sm ${
            activeTab === "confirm"
              ? "text-white"
              : "text-slate-700 hover:text-slate-900"
          }`}
        >
          <CheckSquare className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="whitespace-nowrap">Konfirmasi OCR</span>
          {hasDraft && (
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-semibold ${
                issueCount > 0
                  ? "bg-amber-400 text-slate-950"
                  : "bg-emerald-500 text-slate-950"
              }`}
            >
              {issueCount > 0 ? issueCount : "OK"}
            </span>
          )}
        </button>

        <button
          ref={(el) => {
            tabRefs.current.cards = el;
          }}
          type="button"
          onClick={() => setActiveTab("cards")}
          aria-current={activeTab === "cards" ? "page" : undefined}
          className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2.5 text-xs font-medium active:scale-95 transition-[color,transform] duration-150 min-[380px]:px-3.5 sm:px-5 sm:text-sm ${
            activeTab === "cards"
              ? "text-white"
              : "text-slate-700 hover:text-slate-900"
          }`}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="whitespace-nowrap">Daftar Kartu</span>
        </button>
      </nav>
    </div>
  );
}
