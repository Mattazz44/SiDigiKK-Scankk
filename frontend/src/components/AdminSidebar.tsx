import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Database,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScanText,
  X,
} from "lucide-react";

export type AdminTab = "dashboard" | "data" | "ocr" | "audit";

interface AdminSidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  hasOcrDraft: boolean;
  ocrIssueCount: number;
  backendHealthy: boolean | null;
  adminUsername: string;
  onLogout: () => void;
}

const ADMIN_NAV_ITEMS: Array<{
  id: AdminTab;
  label: string;
  icon: typeof Database;
}> = [
  { id: "dashboard", label: "Dashboard Kependudukan", icon: BarChart3 },
  { id: "data", label: "Data Kartu Keluarga", icon: Database },
  { id: "ocr", label: "Input / Scan KK Baru", icon: ScanText },
  { id: "audit", label: "Audit Log", icon: ClipboardList },
];

export function AdminSidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  hasOcrDraft,
  ocrIssueCount,
  backendHealthy,
  adminUsername,
  onLogout,
}: AdminSidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeDrawerBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    closeDrawerBtnRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        mobileMenuBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const handleSelect = (tab: AdminTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false);
    mobileMenuBtnRef.current?.focus();
  };

  return (
    <>
      {/* Mobile / Tablet Top Header (< lg) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-[#0F172A] px-3.5 py-2.5 text-white lg:hidden">
        <div className="flex items-center gap-2.5">
          <img
            src="/rusdi.jpg"
            alt="Logo SiDigiKK"
            width={30}
            height={30}
            className="h-7 w-7 shrink-0 rounded border border-slate-700 object-cover"
          />
          <div>
            <p className="font-display text-xs font-bold leading-tight">
              SiDigiKK Admin
            </p>
            <p className="text-[10px] text-slate-400">
              Portal Pengolahan Data
            </p>
          </div>
        </div>

        <button
          ref={mobileMenuBtnRef}
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-expanded={mobileMenuOpen}
          aria-controls="admin-mobile-drawer"
          aria-label="Buka menu navigasi admin"
          className="font-display inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          <span>Menu</span>
        </button>
      </header>

      {/* Animated Slide-In Drawer Menu (< lg) */}
      <div
        id="admin-mobile-drawer"
        aria-hidden={!mobileMenuOpen}
        className={`fixed inset-0 z-50 flex transition-[visibility] duration-300 lg:hidden ${
          mobileMenuOpen
            ? "pointer-events-auto visible"
            : "pointer-events-none invisible"
        }`}
      >
        <div
          onClick={handleCloseMobileMenu}
          className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 ease-out ${
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi Admin"
          className={`relative z-10 flex h-full w-72 max-w-[82vw] flex-col justify-between bg-[#0F172A] text-slate-100 shadow-xl transition-transform duration-300 ease-out ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/rusdi.jpg"
                  alt="Logo SiDigiKK"
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded border border-slate-700 object-cover"
                />
                <div>
                  <p className="font-display text-sm font-bold text-white">
                    SiDigiKK Admin
                  </p>
                  <p className="font-mono text-[10px] text-slate-400">
                    @{adminUsername}
                  </p>
                </div>
              </div>
              <button
                ref={closeDrawerBtnRef}
                type="button"
                onClick={handleCloseMobileMenu}
                aria-label="Tutup menu navigasi admin"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-3">
              <p className="px-2.5 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Menu Administrasi
              </p>
              <nav aria-label="Menu Mobile Admin" className="space-y-1">
                {ADMIN_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      tabIndex={mobileMenuOpen ? 0 : -1}
                      onClick={() => handleSelect(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border-l-2 px-3 py-2 text-left text-xs transition-colors ${
                        active
                          ? "border-blue-400 bg-slate-800 font-semibold text-white"
                          : "border-transparent font-medium text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </span>
                      {item.id === "ocr" && hasOcrDraft && (
                        <span className="rounded bg-amber-400 px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-semibold text-slate-950">
                          {ocrIssueCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="space-y-2.5 border-t border-slate-800 p-3">
            {backendHealthy === false && (
              <div className="flex items-center gap-2 px-1 text-[11px] text-red-300">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full bg-red-400 animate-pulse"
                />
                <span className="font-medium text-red-300">
                  Server Offline
                </span>
              </div>
            )}

            <button
              type="button"
              tabIndex={mobileMenuOpen ? 0 : -1}
              onClick={() => {
                setMobileMenuOpen(false);
                onLogout();
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/50"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Desktop Collapsible Slim Sidebar (220px <-> 64px) */}
      <aside
        className={`hidden lg:flex lg:h-full lg:shrink-0 lg:flex-col lg:justify-between border-r border-slate-800 bg-[#0F172A] text-slate-100 transition-[width] duration-150 ${
          collapsed ? "w-[64px]" : "w-[220px]"
        }`}
      >
        <div>
          <div
            className={`flex items-center border-b border-slate-800 py-2.5 ${
              collapsed ? "justify-center px-2" : "justify-between px-3"
            }`}
          >
            {!collapsed && (
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src="/rusdi.jpg"
                  alt="Logo SiDigiKK"
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded border border-slate-700 object-cover"
                />
                <div className="min-w-0">
                  <p className="font-display truncate text-xs font-bold text-white">
                    SiDigiKK
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    Admin Console
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Luaskan sidebar" : "Ciutkan sidebar"}
              title={collapsed ? "Luaskan sidebar" : "Ciutkan sidebar"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="px-2 pt-3">
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Navigasi Admin
              </p>
            )}
            <nav aria-label="Navigasi Desktop Admin" className="space-y-1">
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
                    className={`flex h-9 w-full items-center rounded border-l-2 transition-colors ${
                      collapsed ? "justify-center px-0" : "justify-between px-2.5"
                    } ${
                      active
                        ? "border-blue-400 bg-slate-800 font-semibold text-white"
                        : "border-transparent font-medium text-slate-300 hover:bg-slate-800/70 hover:text-white"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!collapsed && (
                        <span className="truncate text-xs">{item.label}</span>
                      )}
                    </span>
                    {!collapsed && item.id === "ocr" && hasOcrDraft && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-semibold text-slate-950">
                        {ocrIssueCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

          <div className="space-y-2 border-t border-slate-800 p-2.5">
            {backendHealthy === false && (
              <div
                className={`flex items-center text-[11px] text-red-300 ${
                  collapsed ? "justify-center" : "gap-2 px-1"
                }`}
                title="Koneksi server backend terputus"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full bg-red-400 animate-pulse"
                />
                {!collapsed && (
                  <span className="truncate font-medium text-red-300">
                    Server Offline
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              title={collapsed ? `Logout (${adminUsername})` : undefined}
              className={`flex h-8 w-full items-center rounded border border-red-400/30 bg-red-950/35 text-xs font-medium text-red-200 hover:bg-red-900/50 ${
                collapsed ? "justify-center px-0" : "gap-2 px-2.5"
              }`}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">Logout ({adminUsername})</span>}
            </button>
          </div>
      </aside>
    </>
  );
}
