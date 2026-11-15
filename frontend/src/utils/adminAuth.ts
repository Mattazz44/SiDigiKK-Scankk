export interface AdminSession {
  username: string;
  loggedInAt: string;
}

const STORAGE_KEY = "sidigikk_admin_session";

export const DEMO_ADMIN_USERNAME = "admin";
export const DEMO_ADMIN_PASSWORD = "admin123";

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (typeof parsed.username === "string" && parsed.username.trim()) {
      return {
        username: parsed.username,
        loggedInAt:
          typeof parsed.loggedInAt === "string"
            ? parsed.loggedInAt
            : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function authenticateAdmin(
  username: string,
  password: string
): { ok: true; session: AdminSession } | { ok: false; message: string } {
  const cleanUser = username.trim();
  if (!cleanUser || !password) {
    return {
      ok: false,
      message: "Username dan password wajib diisi.",
    };
  }
  if (cleanUser === DEMO_ADMIN_USERNAME && password === DEMO_ADMIN_PASSWORD) {
    const session: AdminSession = {
      username: cleanUser,
      loggedInAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return { ok: true, session };
  }
  return {
    ok: false,
    message: "Username atau password salah. Gunakan akun admin yang valid.",
  };
}

export function logoutAdminSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
