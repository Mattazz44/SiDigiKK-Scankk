import { useCallback, useEffect, useState } from "react";
import { checkHealth } from "./api/client";
import { ToastProvider, useToast } from "./components/ToastProvider";
import { UserWorkspace } from "./components/UserWorkspace";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminWorkspace } from "./pages/AdminWorkspace";
import {
  type AdminSession,
  getAdminSession,
  logoutAdminSession,
} from "./utils/adminAuth";

const IS_ADMIN_PORTAL =
  import.meta.env.VITE_APP_PORTAL === "admin" ||
  (typeof window !== "undefined" && window.location.port === "5174");

function AppShell() {
  const { showToast } = useToast();
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() =>
    IS_ADMIN_PORTAL ? getAdminSession() : null
  );

  const verifyBackend = useCallback(async () => {
    setCheckingHealth(true);
    try {
      await checkHealth();
      setBackendHealthy(true);
    } catch {
      setBackendHealthy(false);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    void verifyBackend();
  }, [verifyBackend]);

  useEffect(() => {
    document.title = IS_ADMIN_PORTAL
      ? "SiDigiKK Admin | Workspace Pengolahan Data KK"
      : "SiDigiKK | Portal Digitalisasi Kartu Keluarga";
  }, []);

  if (IS_ADMIN_PORTAL) {
    if (!adminSession) {
      return (
        <AdminLoginPage
          backendHealthy={backendHealthy}
          onLoginSuccess={(session) => {
            setAdminSession(session);
            showToast(`Masuk sebagai ${session.username}.`, "success");
          }}
        />
      );
    }

    return (
      <AdminWorkspace
        backendHealthy={backendHealthy}
        checkingHealth={checkingHealth}
        onRecheckHealth={() => void verifyBackend()}
        adminUsername={adminSession.username}
        onLogout={() => {
          logoutAdminSession();
          setAdminSession(null);
          showToast("Sesi admin telah keluar.", "info");
        }}
      />
    );
  }

  return <UserWorkspace backendHealthy={backendHealthy} />;
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
