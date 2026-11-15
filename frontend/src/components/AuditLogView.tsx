import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { ApiError, listAuditLogs } from "../api/client";
import type { AuditLogOut } from "../types/kk";
import { formatTimestampIndo } from "../utils/formatters";

const AKSI_FILTERS = ["", "CREATE", "UPDATE", "DELETE"] as const;

const AKSI_BADGE_STYLES: Record<string, string> = {
  CREATE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  UPDATE: "border-blue-200 bg-blue-50 text-blue-800",
  DELETE: "border-red-200 bg-red-50 text-red-800",
};

export function AuditLogView() {
  const [logs, setLogs] = useState<AuditLogOut[]>([]);
  const [aksiFilter, setAksiFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const rows = await listAuditLogs(100, aksiFilter || undefined);
      setLogs(rows);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Gagal memuat catatan audit sistem."
      );
    } finally {
      setLoading(false);
    }
  }, [aksiFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
            Audit Log Aktivitas Sistem
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Riwayat perubahan data Kartu Keluarga dan anggota keluarga dari{" "}
            <code className="font-mono text-[11px] text-slate-800">
              tbl_auditLogs
            </code>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-300 bg-white p-0.5 text-xs">
            {AKSI_FILTERS.map((filterVal) => {
              const label = filterVal || "Semua";
              const active = aksiFilter === filterVal;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAksiFilter(filterVal)}
                  className={`min-h-[34px] rounded px-2.5 py-1 text-xs font-medium sm:min-h-[28px] ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-[34px]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-600">
            Memuat riwayat audit log...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-600">
            Belum ada entri audit untuk filter{" "}
            <span className="font-mono font-semibold">{aksiFilter || "Semua"}</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Waktu</th>
                  <th className="px-3 py-2.5">Aksi</th>
                  <th className="px-3 py-2.5">Tabel Target</th>
                  <th className="px-3 py-2.5">Target ID</th>
                  <th className="px-3 py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[13px]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono tabular-nums text-xs text-slate-500">
                      #{log.id}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-xs whitespace-nowrap text-slate-600">
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
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-700">
                      {log.target_tabel}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-xs whitespace-nowrap text-slate-700">
                      {log.target_id || "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-800">
                      {log.detail || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
