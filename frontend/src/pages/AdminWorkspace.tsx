import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  PenSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  ApiError,
  bulkDeleteKk,
  deleteKk,
  downloadExportFile,
  getDashboardStats,
  listKk,
} from "../api/client";
import type {
  DashboardStatsResponse,
  KKListItem,
  OCRExtractionResponse,
} from "../types/kk";
import {
  copyTextToClipboard,
  formatRtRwDisplay,
  formatTimestampIndo,
} from "../utils/formatters";
import { AdminSidebar, type AdminTab } from "../components/AdminSidebar";
import { AuditLogView } from "../components/AuditLogView";
import { ConfirmModal } from "../components/ConfirmModal";
import { KKSlideOverDrawer } from "../components/KKSlideOverDrawer";
import { useToast } from "../components/ToastProvider";
import { DashboardPage } from "./DashboardPage";
import { InputKKPage } from "./InputKKPage";
import { KonfirmasiOCRPage } from "./KonfirmasiOCRPage";

interface AdminWorkspaceProps {
  backendHealthy: boolean | null;
  checkingHealth: boolean;
  onRecheckHealth: () => void;
  adminUsername: string;
  onLogout: () => void;
}

export function AdminWorkspace({
  backendHealthy,
  checkingHealth,
  onRecheckHealth,
  adminUsername,
  onLogout,
}: AdminWorkspaceProps) {
  const { showToast } = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("data");

  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrStep, setOcrStep] = useState<"upload" | "verify">("upload");
  const [ocrDraft, setOcrDraft] = useState<OCRExtractionResponse | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);

  const [items, setItems] = useState<KKListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedKecamatan, setSelectedKecamatan] = useState("");
  const [selectedKelurahan, setSelectedKelurahan] = useState("");
  const [availableKecamatan, setAvailableKecamatan] = useState<string[]>([]);
  const [availableKelurahan, setAvailableKelurahan] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedNoKks, setSelectedNoKks] = useState<string[]>([]);
  const [copiedNoKk, setCopiedNoKk] = useState<string | null>(null);
  const [drawerNoKk, setDrawerNoKk] = useState<string | null>(null);

  const [singleDeleteTarget, setSingleDeleteTarget] = useState<KKListItem | null>(
    null
  );
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch {
      // KPI fallback remains intact while primary views handle errors explicitly.
    }
  }, []);

  const fetchTable = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await listKk({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        kecamatan: selectedKecamatan || undefined,
        kelurahan: selectedKelurahan || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setAvailableKecamatan(data.available_kecamatan);
      setAvailableKelurahan(data.available_kelurahan);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Gagal memuat daftar Kartu Keluarga."
      );
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, selectedKecamatan, selectedKelurahan]);

  const refreshWorkspace = useCallback(() => {
    void fetchStats();
    void fetchTable();
  }, [fetchStats, fetchTable]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchTable();
  }, [fetchTable]);

  useEffect(() => {
    if (!ocrModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOcrModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ocrModalOpen]);

  const openOcrVerificationModal = (startStep: "upload" | "verify" = "upload") => {
    setOcrStep(
      startStep === "verify" && (ocrDraft !== null || manualMode)
        ? "verify"
        : "upload"
    );
    setOcrModalOpen(true);
  };

  const handleSidebarSelectTab = (tab: AdminTab) => {
    if (tab === "ocr") {
      openOcrVerificationModal(ocrDraft || manualMode ? "verify" : "upload");
      return;
    }
    setActiveTab(tab);
  };

  const handleOcrSuccess = (result: OCRExtractionResponse) => {
    setOcrDraft(result);
    setManualMode(false);
    setOcrStep("verify");
  };

  const handleStartManualEntry = () => {
    setOcrDraft(null);
    setManualMode(true);
    setOcrStep("verify");
  };

  const handleOcrSaved = () => {
    setOcrDraft(null);
    setManualMode(false);
    setOcrStep("upload");
    setOcrModalOpen(false);
    setActiveTab("data");
    refreshWorkspace();
  };

  const allOnPageSelected =
    items.length > 0 && items.every((row) => selectedNoKks.includes(row.no_kk));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      const pageIds = new Set(items.map((i) => i.no_kk));
      setSelectedNoKks((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([...selectedNoKks, ...items.map((i) => i.no_kk)]);
      setSelectedNoKks(Array.from(merged));
    }
  };

  const toggleRowSelection = (noKk: string) => {
    setSelectedNoKks((prev) =>
      prev.includes(noKk) ? prev.filter((id) => id !== noKk) : [...prev, noKk]
    );
  };

  const handleQuickCopy = async (noKk: string) => {
    const ok = await copyTextToClipboard(noKk);
    if (ok) {
      setCopiedNoKk(noKk);
      showToast(`Tersalin: ${noKk}`, "success");
      window.setTimeout(() => {
        setCopiedNoKk((curr) => (curr === noKk ? null : curr));
      }, 1600);
    }
  };

  const handleExport = async (
    format: "excel" | "csv",
    onlySelected = false
  ) => {
    setExporting(true);
    try {
      const filename = await downloadExportFile(format, {
        search: onlySelected ? undefined : debouncedSearch || undefined,
        kecamatan: onlySelected ? undefined : selectedKecamatan || undefined,
        kelurahan: onlySelected ? undefined : selectedKelurahan || undefined,
        no_kk_list: onlySelected ? selectedNoKks : undefined,
      });
      showToast(`File ${filename} berhasil diunduh.`, "success");
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Gagal mengekspor data.",
        "error"
      );
    } finally {
      setExporting(false);
    }
  };

  const handleSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    setDeleting(true);
    try {
      await deleteKk(singleDeleteTarget.no_kk);
      showToast(
        `KK ${singleDeleteTarget.no_kk} (${singleDeleteTarget.nama_kepala_keluarga}) dihapus.`,
        "success"
      );
      setSelectedNoKks((prev) =>
        prev.filter((id) => id !== singleDeleteTarget.no_kk)
      );
      if (drawerNoKk === singleDeleteTarget.no_kk) {
        setDrawerNoKk(null);
      }
      setSingleDeleteTarget(null);
      refreshWorkspace();
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Gagal menghapus KK.",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedNoKks.length === 0) return;
    setDeleting(true);
    try {
      const res = await bulkDeleteKk(selectedNoKks);
      showToast(res.message, "success");
      if (drawerNoKk && selectedNoKks.includes(drawerNoKk)) {
        setDrawerNoKk(null);
      }
      setSelectedNoKks([]);
      setBulkDeleteConfirmOpen(false);
      refreshWorkspace();
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Gagal menghapus data terpilih.",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setSelectedKecamatan("");
    setSelectedKelurahan("");
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchInput.trim() || selectedKecamatan || selectedKelurahan
  );

  const produktifEntry = stats?.distribusi_usia.find(
    (item) => item.kategori === "Produktif"
  );

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  const todayFormatted = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 lg:h-screen lg:flex-row lg:overflow-hidden">
      <AdminSidebar
        activeTab={ocrModalOpen ? "ocr" : activeTab}
        onSelectTab={handleSidebarSelectTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        hasOcrDraft={ocrDraft !== null || manualMode}
        ocrIssueCount={ocrDraft?.low_confidence_fields.length ?? 0}
        backendHealthy={backendHealthy}
        adminUsername={adminUsername}
        onLogout={onLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
        {/* Banner peringatan jika backend offline */}
        {backendHealthy === false && (
          <div
            role="alert"
            className="flex shrink-0 items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />
              <span>Koneksi backend terputus. Pastikan layanan server API sedang berjalan.</span>
            </div>
            <button
              type="button"
              onClick={onRecheckHealth}
              disabled={checkingHealth}
              className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
            >
              <RefreshCw
                className={`h-3 w-3 ${checkingHealth ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>Coba Hubungkan Ulang</span>
            </button>
          </div>
        )}

        {/* Top KPI Strip (4 compact KPI pills in a single thin row) */}
        <section
          aria-label="Ringkasan KPI Operasional"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
              <span className="text-slate-600">Total KK</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {stats ? stats.total_kk : "-"}
              </span>
            </div>

            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
              <span className="text-slate-600">Total Jiwa</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {stats ? stats.total_penduduk : "-"}
              </span>
            </div>

            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
              <span className="text-slate-600">Produktif</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {produktifEntry
                  ? `${produktifEntry.jumlah} (${produktifEntry.persentase}%)`
                  : "-"}
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-xs text-slate-500 xl:inline-flex">
            <span>{todayFormatted}</span>
            <span className="text-slate-300" aria-hidden="true">•</span>
            <span className="font-medium text-slate-700">Administrator</span>
          </div>
        </section>

        {activeTab === "dashboard" && (
          <main className="flex-1 overflow-y-auto p-4 sm:p-5">
            <DashboardPage
              onNavigate={(dest) => {
                if (dest === "input" || dest === "konfirmasi") {
                  openOcrVerificationModal(
                    dest === "konfirmasi" ? "verify" : "upload"
                  );
                } else if (dest === "data") {
                  setActiveTab("data");
                }
              }}
            />
          </main>
        )}

        {activeTab === "audit" && (
          <main className="flex-1 overflow-y-auto p-4 sm:p-5">
            <AuditLogView />
          </main>
        )}

        {activeTab === "data" && (
          <main className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
            {/* Unified Data Processing Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2">
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari No. KK, Kepala Keluarga, NIK..."
                  aria-label="Cari Kartu Keluarga"
                  className="h-8 w-full rounded border border-slate-300 bg-white pr-2.5 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700"
                />
              </div>

              <select
                aria-label="Filter Kecamatan"
                value={selectedKecamatan}
                onChange={(e) => {
                  setSelectedKecamatan(e.target.value);
                  setPage(1);
                }}
                className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-blue-700"
              >
                <option value="">Semua Kecamatan</option>
                {availableKecamatan.map((kec) => (
                  <option key={kec} value={kec}>
                    {kec}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter Kelurahan"
                value={selectedKelurahan}
                onChange={(e) => {
                  setSelectedKelurahan(e.target.value);
                  setPage(1);
                }}
                className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-blue-700"
              >
                <option value="">Semua Kelurahan</option>
                {availableKelurahan.map((kel) => (
                  <option key={kel} value={kel}>
                    {kel}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset Filter</span>
              </button>

              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <button
                  type="button"
                  disabled={exporting || total === 0}
                  onClick={() => void handleExport("excel")}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  <span>Export Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  disabled={exporting || total === 0}
                  onClick={() => void handleExport("csv")}
                  className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Download className="h-3 w-3" aria-hidden="true" />
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => openOcrVerificationModal("upload")}
                  className="font-display inline-flex h-8 items-center rounded bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <span>+ Input KK Baru</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mx-4 mt-3 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchTable()}
                  className="rounded border border-red-300 bg-white px-2.5 py-1 font-medium text-red-800 hover:bg-red-100"
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {/* Master Data Table Body */}
            <div className="min-h-0 flex-1 overflow-auto bg-white">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-10 animate-pulse rounded border border-slate-100 bg-slate-100/70"
                    />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="font-display text-sm font-semibold text-slate-800">
                    {hasActiveFilters
                      ? "Tidak ada Kartu Keluarga yang sesuai dengan filter saat ini."
                      : "Belum ada data Kartu Keluarga di database."}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {hasActiveFilters
                      ? "Reset filter atau ubah kata kunci pencarian untuk melihat seluruh baris."
                      : "Klik '+ Input KK Baru' untuk memindai dokumen KK atau menginput secara manual."}
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Reset Filter
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openOcrVerificationModal("upload")}
                      className="font-display inline-flex h-8 items-center rounded bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <span>+ Input KK Baru</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop High-Density Table */}
                  <table className="hidden w-full border-collapse text-left md:table">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            onChange={toggleSelectAllOnPage}
                            aria-label="Pilih semua baris di halaman ini"
                            className="h-4 w-4 rounded border-slate-300 text-blue-700"
                          />
                        </th>
                        <th className="px-3 py-2">No. KK</th>
                        <th className="px-3 py-2">Kepala Keluarga</th>
                        <th className="px-3 py-2">Alamat &amp; RT/RW</th>
                        <th className="px-3 py-2">Wilayah</th>
                        <th className="px-3 py-2">Anggota</th>
                        <th className="px-3 py-2">Diperbarui</th>
                        <th className="px-3 py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[13px]">
                      {items.map((row) => {
                        const isSelected = selectedNoKks.includes(row.no_kk);
                        const isCopied = copiedNoKk === row.no_kk;
                        return (
                          <tr
                            key={row.no_kk}
                            onClick={() => setDrawerNoKk(row.no_kk)}
                            className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                              isSelected ? "bg-blue-50/40" : "bg-white"
                            }`}
                          >
                            <td
                              className="px-3 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRowSelection(row.no_kk)}
                                aria-label={`Pilih KK ${row.no_kk}`}
                                className="h-4 w-4 rounded border-slate-300 text-blue-700"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono tabular-nums font-medium text-slate-900">
                                  {row.no_kk}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleQuickCopy(row.no_kk);
                                  }}
                                  aria-label={`Salin Nomor KK ${row.no_kk}`}
                                  title="Salin Nomor KK"
                                  className="relative inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                >
                                  {isCopied ? (
                                    <Check
                                      className="h-3 w-3 text-emerald-700"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Copy className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  {isCopied && (
                                    <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white">
                                      Tersalin
                                    </span>
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {row.nama_kepala_keluarga}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              <p className="max-w-[230px] truncate">{row.alamat}</p>
                              <p className="font-mono tabular-nums text-[11px] text-slate-500">
                                {formatRtRwDisplay(row.rt_rw)}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              <p className="font-medium text-slate-800">
                                {row.desa_kelurahan}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {row.kecamatan}
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center rounded bg-slate-900 px-2 py-0.5 font-mono tabular-nums text-[11px] font-semibold text-white">
                                {row.jumlah_anggota} orang
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-xs text-slate-600">
                              {formatTimestampIndo(row.updated_at)}
                            </td>
                            <td
                              className="px-3 py-2 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDrawerNoKk(row.no_kk)}
                                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                                >
                                  Detail
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSingleDeleteTarget(row)}
                                  aria-label={`Hapus KK ${row.no_kk}`}
                                  className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Compact Cards (< md) */}
                  <div className="divide-y divide-slate-200 md:hidden">
                    {items.map((row) => {
                      const isSelected = selectedNoKks.includes(row.no_kk);
                      const isCopied = copiedNoKk === row.no_kk;
                      return (
                        <div
                          key={row.no_kk}
                          onClick={() => setDrawerNoKk(row.no_kk)}
                          className={`p-3.5 ${
                            isSelected ? "bg-blue-50/40" : "bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRowSelection(row.no_kk)}
                                aria-label={`Pilih KK ${row.no_kk}`}
                                className="h-4 w-4 rounded border-slate-300 text-blue-700"
                              />
                              <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
                                {row.no_kk}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleQuickCopy(row.no_kk)}
                                aria-label={`Salin Nomor KK ${row.no_kk}`}
                                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 bg-white text-slate-600"
                              >
                                {isCopied ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                            <span className="inline-flex items-center rounded bg-slate-900 px-2 py-0.5 font-mono tabular-nums text-[11px] font-semibold text-white">
                              {row.jumlah_anggota} orang
                            </span>
                          </div>

                          <p className="mt-1.5 font-display text-sm font-semibold text-slate-900">
                            {row.nama_kepala_keluarga}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {row.alamat} |{" "}
                            <span className="font-mono tabular-nums">
                              {formatRtRwDisplay(row.rt_rw)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {row.desa_kelurahan}, {row.kecamatan} |{" "}
                            <span className="font-mono tabular-nums">
                              {formatTimestampIndo(row.updated_at)}
                            </span>
                          </p>

                          <div
                            className="mt-3 flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setDrawerNoKk(row.no_kk)}
                              className="min-h-[40px] flex-1 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800"
                            >
                              Detail &amp; Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setSingleDeleteTarget(row)}
                              className="min-h-[40px] rounded border border-red-200 bg-white px-3 text-xs font-medium text-red-700"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Bottom Pagination Strip */}
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
              <span className="font-mono tabular-nums">
                Menampilkan {startIndex}-{endIndex} dari {total} KK
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Baris per halaman"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                >
                  <option value={15}>15 / hal</option>
                  <option value={30}>30 / hal</option>
                  <option value={50}>50 / hal</option>
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Prev</span>
                  </button>
                  <span className="px-2 font-mono tabular-nums font-medium text-slate-800">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </footer>
          </main>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedNoKks.length > 0 && activeTab === "data" && !ocrModalOpen && (
        <div
          role="region"
          aria-label="Aksi massal baris terpilih"
          className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white shadow-md"
        >
          <span className="font-mono tabular-nums font-semibold">
            {selectedNoKks.length} KK dipilih
          </span>
          <div className="h-3.5 w-px bg-slate-700" aria-hidden="true" />
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport("excel", true)}
            className="font-display inline-flex min-h-[32px] items-center gap-1 rounded-full bg-white px-3 py-1 font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export Terpilih (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => setBulkDeleteConfirmOpen(true)}
            className="font-display inline-flex min-h-[32px] items-center gap-1 rounded-full border border-red-400/50 bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Hapus Massal</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedNoKks([])}
            aria-label="Batal pilihan"
            className="rounded-full p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Slide-Over Detail & Inline Editing Drawer */}
      {drawerNoKk && (
        <KKSlideOverDrawer
          noKk={drawerNoKk}
          onClose={() => setDrawerNoKk(null)}
          onDataChanged={(updatedNoKk) => {
            if (updatedNoKk && updatedNoKk !== drawerNoKk) {
              setDrawerNoKk(updatedNoKk);
            }
            refreshWorkspace();
          }}
        />
      )}

      {/* Admin OCR Verification Modal / View */}
      {ocrModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-ocr-modal-title"
          className="fixed inset-0 z-40 flex flex-col bg-slate-50"
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                ADMIN OCR
              </span>
              <h2
                id="admin-ocr-modal-title"
                className="font-display text-sm font-bold text-slate-900"
              >
                {ocrStep === "upload"
                  ? "Unggah Dokumen Kartu Keluarga Baru"
                  : "Verifikasi Cepat Split-Screen (Tab / Enter untuk Navigasi)"}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {ocrStep === "verify" ? (
                <button
                  type="button"
                  onClick={() => setOcrStep("upload")}
                  className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Unggah Ulang Gambar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartManualEntry}
                  className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <PenSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Input Manual</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOcrModalOpen(false)}
                className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tutup (Esc)</span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {ocrStep === "upload" ? (
              <InputKKPage
                onOcrSuccess={handleOcrSuccess}
                onStartManualEntry={handleStartManualEntry}
              />
            ) : (
              <KonfirmasiOCRPage
                ocrResult={ocrDraft}
                manualMode={manualMode}
                onSavedSuccess={handleOcrSaved}
                onCancelToUpload={() => setOcrModalOpen(false)}
                onStartManual={handleStartManualEntry}
              />
            )}
          </div>
        </div>
      )}

      {/* Confirm Single & Bulk Delete */}
      <ConfirmModal
        open={singleDeleteTarget !== null}
        title="Hapus Kartu Keluarga?"
        description={
          singleDeleteTarget
            ? `Nomor KK ${singleDeleteTarget.no_kk} (${singleDeleteTarget.nama_kepala_keluarga}) beserta seluruh anggota keluarganya akan dihapus permanen.`
            : ""
        }
        confirmLabel="Hapus KK"
        loading={deleting}
        onConfirm={() => void handleSingleDelete()}
        onCancel={() => setSingleDeleteTarget(null)}
      />

      <ConfirmModal
        open={bulkDeleteConfirmOpen}
        title={`Hapus ${selectedNoKks.length} Kartu Keluarga Terpilih?`}
        description="Seluruh KK yang dicentang beserta seluruh data anggota keluarganya akan dihapus permanen dari database."
        confirmLabel="Hapus Massal"
        loading={deleting}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />
    </div>
  );
}
