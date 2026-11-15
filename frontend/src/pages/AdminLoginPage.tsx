import { useState, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, User } from "lucide-react";
import {
  authenticateAdmin,
  DEMO_ADMIN_PASSWORD,
  DEMO_ADMIN_USERNAME,
  type AdminSession,
} from "../utils/adminAuth";

interface AdminLoginPageProps {
  backendHealthy: boolean | null;
  onLoginSuccess: (session: AdminSession) => void;
}

export function AdminLoginPage({
  backendHealthy,
  onLoginSuccess,
}: AdminLoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);
    const result = authenticateAdmin(username, password);
    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    onLoginSuccess(result.session);
  };

  const handleFillDemo = () => {
    setUsername(DEMO_ADMIN_USERNAME);
    setPassword(DEMO_ADMIN_PASSWORD);
    setErrorMsg(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <img
            src="/rusdi.jpg"
            alt="Logo SiDigiKK"
            width={44}
            height={44}
            fetchPriority="high"
            className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              Login Admin SiDigiKK
            </h1>
            <p className="text-xs text-slate-600">
              Workspace Pengolahan Data &amp; Verifikasi Kartu Keluarga
            </p>
          </div>
        </div>

        {backendHealthy === false && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Koneksi server API backend belum terhubung. Pastikan backend di port 8001 aktif.</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="admin-username"
              className="block text-xs font-medium text-slate-700"
            >
              Username Admin
            </label>
            <div className="relative mt-1.5">
              <User
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-md border border-slate-300 bg-white py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 sm:py-2 sm:text-xs"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-xs font-medium text-slate-700"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <Lock
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password admin"
                className="w-full rounded-md border border-slate-300 bg-white py-2.5 pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 sm:py-2 sm:text-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
                className="absolute top-1/2 right-1.5 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="font-display inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <span>Masuk ke Admin Workspace</span>
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs">
          <div className="text-slate-600">
            <span>Akun Demo: </span>
            <code className="font-mono tabular-nums font-semibold text-slate-900">
              {DEMO_ADMIN_USERNAME} / {DEMO_ADMIN_PASSWORD}
            </code>
          </div>
          <button
            type="button"
            onClick={handleFillDemo}
            className="inline-flex min-h-[34px] items-center rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
          >
            Isi Akun Demo
          </button>
        </div>
      </div>
    </div>
  );
}
