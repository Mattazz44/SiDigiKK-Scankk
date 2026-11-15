import type {
  AnggotaCreate,
  AnggotaOut,
  AnggotaUpdate,
  AuditLogOut,
  BulkDeleteResponse,
  DashboardStatsResponse,
  KKCreate,
  KKDetailOut,
  KKUpdate,
  NikCheckResponse,
  NikConflictItem,
  OCRExtractionResponse,
  PaginatedKKResponse,
} from "../types/kk";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8001";
const RAW_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  DEFAULT_API_BASE_URL;
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  conflicts?: NikConflictItem[];
  existingNoKk?: string;
  existingNama?: string;

  constructor(
    message: string,
    status: number,
    extra?: {
      conflicts?: NikConflictItem[];
      existingNoKk?: string;
      existingNama?: string;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.conflicts = extra?.conflicts;
    this.existingNoKk = extra?.existingNoKk;
    this.existingNama = extra?.existingNama;
  }
}

function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

function parseFastApiError(
  status: number,
  body: unknown,
  fallbackMessage: string
): ApiError {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return new ApiError(detail, status);
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const messages = detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const loc = Array.isArray((item as { loc?: unknown[] }).loc)
              ? (item as { loc: unknown[] }).loc.slice(1).join(".")
              : "";
            const msg = String((item as { msg: unknown }).msg);
            return loc ? `${loc}: ${msg}` : msg;
          }
          return String(item);
        })
        .join("; ");
      return new ApiError(messages || fallbackMessage, status);
    }
    if (detail && typeof detail === "object") {
      const obj = detail as {
        message?: string;
        conflicts?: NikConflictItem[];
        existing_no_kk?: string;
        existing_nama?: string;
      };
      return new ApiError(obj.message || fallbackMessage, status, {
        conflicts: obj.conflicts,
        existingNoKk: obj.existing_no_kk,
        existingNama: obj.existing_nama,
      });
    }
  }
  return new ApiError(fallbackMessage, status);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      `Tidak dapat terhubung ke server backend. Pastikan API FastAPI aktif di ${API_BASE_URL}.`,
      0
    );
  }

  let body: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => null);
  }

  if (!response.ok) {
    throw parseFastApiError(
      response.status,
      body,
      `Permintaan gagal dengan status HTTP ${response.status}.`
    );
  }

  return body as T;
}

export function checkHealth(): Promise<{ status: string; service: string }> {
  return requestJson("/api/health", { method: "GET" });
}

export function extractOcr(
  file: File,
  onUploadProgress?: (percent: number) => void
): Promise<OCRExtractionResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl("/api/ocr/extract"));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onUploadProgress(pct);
      }
    };

    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as OCRExtractionResponse);
      } else {
        reject(
          parseFastApiError(
            xhr.status,
            body,
            `Gagal memproses OCR (HTTP ${xhr.status}).`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new ApiError(
          "Koneksi terputus saat mengunggah dokumen ke layanan OCR.",
          0
        )
      );
    };

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export function createKk(payload: KKCreate): Promise<KKDetailOut> {
  return requestJson("/api/kk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ListKkParams {
  page?: number;
  page_size?: number;
  search?: string;
  kelurahan?: string;
  kecamatan?: string;
}

function buildFilterQuery(params: ListKkParams & { no_kk_list?: string[] }): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined) sp.set("page", String(params.page));
  if (params.page_size !== undefined) sp.set("page_size", String(params.page_size));
  if (params.search?.trim()) sp.set("search", params.search.trim());
  if (params.kelurahan?.trim()) sp.set("kelurahan", params.kelurahan.trim());
  if (params.kecamatan?.trim()) sp.set("kecamatan", params.kecamatan.trim());
  if (params.no_kk_list && params.no_kk_list.length > 0) {
    sp.set("no_kk_list", params.no_kk_list.join(","));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function listKk(params: ListKkParams = {}): Promise<PaginatedKKResponse> {
  return requestJson(`/api/kk${buildFilterQuery(params)}`, { method: "GET" });
}

export function getKkDetail(noKk: string): Promise<KKDetailOut> {
  return requestJson(`/api/kk/${encodeURIComponent(noKk)}`, { method: "GET" });
}

export function updateKk(noKk: string, payload: KKUpdate): Promise<KKDetailOut> {
  return requestJson(`/api/kk/${encodeURIComponent(noKk)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteKk(noKk: string): Promise<{ message: string; no_kk: string }> {
  return requestJson(`/api/kk/${encodeURIComponent(noKk)}`, { method: "DELETE" });
}

export function bulkDeleteKk(noKkList: string[]): Promise<BulkDeleteResponse> {
  return requestJson("/api/kk/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ no_kk_list: noKkList }),
  });
}

export function checkNikAvailability(
  nik: string,
  excludeId?: number
): Promise<NikCheckResponse> {
  const qs = excludeId !== undefined ? `?exclude_id=${excludeId}` : "";
  return requestJson(`/api/anggota/check-nik/${encodeURIComponent(nik)}${qs}`, {
    method: "GET",
  });
}

export function addAnggotaToKk(
  noKk: string,
  payload: AnggotaCreate
): Promise<AnggotaOut> {
  return requestJson(`/api/kk/${encodeURIComponent(noKk)}/anggota`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAnggota(
  anggotaId: number,
  payload: AnggotaUpdate
): Promise<AnggotaOut> {
  return requestJson(`/api/anggota/${anggotaId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAnggota(
  anggotaId: number
): Promise<{ message: string; id: number; nik: string }> {
  return requestJson(`/api/anggota/${anggotaId}`, { method: "DELETE" });
}

export function getDashboardStats(): Promise<DashboardStatsResponse> {
  return requestJson("/api/dashboard/stats", { method: "GET" });
}

export function listAuditLogs(
  limit = 20,
  aksi?: string
): Promise<AuditLogOut[]> {
  const sp = new URLSearchParams({ limit: String(limit) });
  if (aksi) sp.set("aksi", aksi);
  return requestJson(`/api/audit-logs?${sp.toString()}`, { method: "GET" });
}

export async function downloadExportFile(
  format: "excel" | "csv",
  params: Omit<ListKkParams, "page" | "page_size"> & { no_kk_list?: string[] } = {}
): Promise<string> {
  const url = buildApiUrl(`/api/export/${format}${buildFilterQuery(params)}`);
  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch {
    throw new ApiError("Gagal menghubungi server saat mengekspor data.", 0);
  }

  if (!response.ok) {
    throw new ApiError(`Gagal mengekspor data (HTTP ${response.status}).`, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const fallbackExt = format === "excel" ? "xlsx" : "csv";
  const filename = match?.[1] ?? `data_kk_sidigikk.${fallbackExt}`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);

  return filename;
}
