import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; badge: string; label: string }
> = {
  success: {
    container: "border-emerald-200 bg-white text-slate-900",
    badge: "text-emerald-700",
    label: "Berhasil",
  },
  error: {
    container: "border-red-200 bg-white text-slate-900",
    badge: "text-red-700",
    label: "Gagal",
  },
  warning: {
    container: "border-amber-300 bg-amber-50 text-amber-950",
    badge: "text-amber-800",
    label: "Perhatian",
  },
  info: {
    container: "border-slate-200 bg-white text-slate-900",
    badge: "text-blue-700",
    label: "Info",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextToastId++;
      setToasts((prev) => [...prev.slice(-1), { id, message, variant }]);
      window.setTimeout(() => {
        removeToast(id);
      }, 3600);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-4 top-14 z-50 flex flex-col gap-2 sm:top-3 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2"
      >
        {toasts.map((toast) => {
          const style = VARIANT_STYLES[toast.variant];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-sm shadow-sm ${style.container}`}
            >
              {toast.variant === "success" ? (
                <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${style.badge}`} aria-hidden="true" />
              ) : toast.variant === "error" || toast.variant === "warning" ? (
                <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${style.badge}`} aria-hidden="true" />
              ) : (
                <Info className={`mt-0.5 h-4 w-4 shrink-0 ${style.badge}`} aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <span className="sr-only">{style.label}: </span>
                <p className="text-[13px] leading-snug font-medium">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
