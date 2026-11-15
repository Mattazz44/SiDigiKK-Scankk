import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  FileUp,
  FolderKanban,
  RefreshCw,
} from "lucide-react";
import { ApiError, getDashboardStats, listAuditLogs } from "../api/client";
import type {
  AuditLogOut,
  DashboardStatsResponse,
  KategoriUsia,
} from "../types/kk";
import { formatTimestampIndo } from "../utils/formatters";

export type DashboardNavTarget = "dashboard" | "input" | "konfirmasi" | "data";

interface DashboardPageProps {
  onNavigate: (route: DashboardNavTarget) => void;
}

const AGE_BRACKET_META: Record<
  KategoriUsia,
  { range: string; barColor: string }
> = {
  Balita: { range: "0 - 4 tahun", barColor: "bg-sky-600" },
  "Usia Sekolah": { range: "5 - 17 tahun", barColor: "bg-indigo-600" },
  Produktif: { range: "18 - 59 tahun", barColor: "bg-emerald-600" },
  Lansia: { range: "60+ tahun", barColor: "bg-amber-600" },
};

const AKSI_BADGE_STYLES: Record<string, string> = {
  CREATE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  UPDATE: "border-blue-200 bg-blue-50 text-blue-800",
  DELETE: "border-red-200 bg-red-50 text-red-800",
};

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [logs, setLogs] = useState<AuditLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [statsData, logsData] = await Promise.all([
        getDashboardStats(),
        listAuditLogs(12),
      ]);
      setStats(statsData);
      setLogs(logsData);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Gagal mengambil ringkasan statistik dari server."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const lakiCount = stats?.ringkasan_gender["LAKI-LAKI"] ?? 0;
  const perempuanCount = stats?.ringkasan_gender["PEREMPUAN"] ?? 0;
  const totalGender = lakiCount + perempuanCount;
  const lakiPct = totalGender > 0 ? Math.round((lakiCount / totalGender) * 100) : 0;
  const perempuanPct = totalGender > 0 ? 100 - lakiPct : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Dashboard Kependudukan SiDigiKK
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Ringkasan Kartu Keluarga terdigitalisasi, sebaran usia penduduk, dan jejak audit sistem.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-[34px]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Muat Ulang</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("data")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 sm:min-h-[34px]"
          >
            <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Buka Data KK</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("input")}
            className="font-display inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 sm:min-h-[34px]"
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>+ Input KK Baru</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2.5 text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1 text-xs">
              <p className="font-semibold">Koneksi statistik gagal</p>
              <p className="mt-0.5">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="mt-2 rounded border border-red-300 bg-white px-3 py-1 font-medium text-red-800 hover:bg-red-100"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && !stats ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-xs text-slate-600">
          Mengambil metrik kependudukan dan audit log terbaru...
        </div>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div className="p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Total Kartu Keluarga
                </p>
                <p className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {stats.total_kk}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Dokumen KK aktif
                </p>
              </div>
              <div className="border-l border-slate-200 p-3.5 sm:border-l-0">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Total Jiwa Terdaftar
                </p>
                <p className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {stats.total_penduduk}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Anggota keluarga unik
                </p>
              </div>
              <div className="p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Rata-Rata Jiwa / KK
                </p>
                <p className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {stats.rata_rata_anggota_per_kk.toFixed(1)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Anggota per keluarga
                </p>
              </div>
              <div className="border-l border-slate-200 p-3.5 sm:border-l-0">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Rasio Laki-Laki / Perempuan
                </p>
                <p className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {lakiCount} : {perempuanCount}
                </p>
                <p className="mt-0.5 font-mono tabular-nums text-[11px] text-slate-600">
                  {totalGender > 0 ? `${lakiPct}% L / ${perempuanPct}% P` : "Belum ada data"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <section className="rounded-md border border-slate-200 bg-white lg:col-span-5">
                <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
                  <h2 className="font-display text-xs font-semibold tracking-wider text-slate-700 uppercase">
                    Sebaran Usia Penduduk Terdaftar
                  </h2>
                </div>
                <div className="space-y-3.5 p-4">
                  {stats.total_penduduk === 0 ? (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
                      <p>Belum ada data penduduk untuk dihitung distribusinya.</p>
                      <button
                        type="button"
                        onClick={() => onNavigate("input")}
                        className="mt-2 font-semibold text-blue-700 underline hover:text-blue-800"
                      >
                        Unggah Kartu Keluarga pertama
                      </button>
                    </div>
                  ) : (
                    <>
                      {stats.distribusi_usia.map((item) => {
                        const meta = AGE_BRACKET_META[item.kategori];
                        return (
                          <div key={item.kategori} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-semibold text-slate-800">
                                  {item.kategori}
                                </span>
                                <span className="ml-1.5 text-[11px] text-slate-500">
                                  ({meta.range})
                                </span>
                              </div>
                              <div className="font-mono tabular-nums text-xs text-slate-800">
                                <span className="font-semibold">{item.jumlah}</span>
                                <span className="ml-1.5 text-slate-600">
                                  ({item.persentase.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-100">
                              <div
                                className={`h-full ${meta.barColor}`}
                                style={{ width: `${Math.min(100, item.persentase)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      <div className="border-t border-slate-200 pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">
                            Proporsi Jenis Kelamin
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-600">
                            L: {lakiCount} ({lakiPct}%) | P: {perempuanCount} ({perempuanPct}%)
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                          <div
                            className="h-full bg-slate-800"
                            style={{ width: `${lakiPct}%` }}
                          />
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${perempuanPct}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white lg:col-span-7">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
                  <h2 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                    Catatan Aktivitas Audit Terbaru
                  </h2>
                  <span className="font-mono tabular-nums text-[11px] text-slate-600">
                    {logs.length} entri terakhir
                  </span>
                </div>
                {logs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600">
                    Belum ada catatan aktivitas di `tbl_auditLogs`. Aktivitas CREATE, UPDATE, dan DELETE akan muncul otomatis di sini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                        <tr>
                          <th className="px-3 py-2">Waktu</th>
                          <th className="px-3 py-2">Aksi</th>
                          <th className="px-3 py-2">Tabel</th>
                          <th className="px-3 py-2">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono tabular-nums text-[11px] whitespace-nowrap text-slate-600">
                              {formatTimestampIndo(log.timestamp)}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                  AKSI_BADGE_STYLES[log.aksi] ??
                                  "border-slate-200 bg-slate-50 text-slate-700"
                                }`}
                              >
                                {log.aksi}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-slate-700">
                              {log.target_tabel}
                            </td>
                            <td className="px-3 py-2 text-slate-800">
                              {log.detail || log.target_id || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
}
