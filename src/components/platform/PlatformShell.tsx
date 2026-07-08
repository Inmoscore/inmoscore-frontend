"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  Gauge,
  History,
  Home,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { clearSession } from "@/lib/auth";
import { isIdentityVerified } from "@/lib/identityVerification";

type PlatformUser = {
  email?: string;
  nombre?: string;
  fullName?: string;
  tipo_usuario?: string;
  identity_verification_status?: string | null;
};

type ShellVariant = "user" | "admin";

type PlatformShellProps = {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  description?: string;
  variant?: ShellVariant;
  user?: PlatformUser | null;
  topbarActions?: ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const userNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Buscar", href: "/buscar", icon: Search },
  { label: "Historial arrendaticio", href: "/aportar-historial", icon: ClipboardCheck },
  { label: "Reportar", href: "/reportar", icon: FileCheck2 },
  { label: "Créditos", href: "/upgrade", icon: CreditCard },
  { label: "Mi plan", href: "/upgrade", icon: BadgeCheck },
  { label: "Configuración", href: "/configuracion", icon: Settings },
  { label: "Admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
];

const adminNav: NavItem[] = [
  { label: "Operaciones", href: "/admin", icon: Gauge },
  { label: "Verificaciones", href: "/admin?module=identityVerifications", icon: UserCheck },
  { label: "Reportes", href: "/admin?module=reports", icon: FileCheck2 },
  { label: "Historiales", href: "/admin?module=rentalHistory", icon: ClipboardCheck },
  { label: "Disputas", href: "/admin?module=disputes", icon: ShieldAlert },
  { label: "Revisión humana", href: "/admin?module=humanReview", icon: CheckCircle2 },
  { label: "Pagos", href: "/admin?module=payments", icon: CreditCard },
  { label: "Auditoría", href: "/admin?module=audit", icon: History },
  { label: "Seguridad", href: "/admin?module=security", icon: LockKeyhole },
];

function getStoredUser(): PlatformUser | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem("user") || localStorage.getItem("inmoscore_user");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PlatformUser;
  } catch {
    return null;
  }
}

function initialsFor(user?: PlatformUser | null) {
  const name = user?.nombre || user?.fullName || user?.email || "IS";
  return name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isActive(pathname: string, currentSearch: string, href: string) {
  const [routeWithHash, query = ""] = href.split("?");
  const route = routeWithHash.split("#")[0];
  const searchParams = new URLSearchParams(currentSearch);
  if (query) {
    const expected = new URLSearchParams(query);
    return pathname === route && Array.from(expected.entries()).every(([key, value]) => searchParams.get(key) === value);
  }
  if (route === "/dashboard") return pathname === "/dashboard";
  if (route === "/admin") return pathname === "/admin" && !searchParams.get("module");
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function PlatformShell({
  children,
  title,
  eyebrow = "Workspace",
  description,
  variant = "user",
  user,
  topbarActions,
}: PlatformShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storedUser, setStoredUser] = useState<PlatformUser | null>(user ?? null);
  const [currentSearch, setCurrentSearch] = useState("");

  useEffect(() => {
    if (!user) setStoredUser(getStoredUser());
  }, [user]);

  useEffect(() => {
    setCurrentSearch(typeof window === "undefined" ? "" : window.location.search);
  }, [pathname]);

  const activeUser = user ?? storedUser;
  const isAdmin = activeUser?.tipo_usuario === "admin" || variant === "admin";
  const identityLocked = variant !== "admin" && !isIdentityVerified(activeUser);
  const navItems = useMemo(
    () => (variant === "admin" ? adminNav : userNav.filter((item) => !item.adminOnly || isAdmin)),
    [isAdmin, variant]
  );
  const displayName = activeUser?.nombre || activeUser?.fullName || activeUser?.email || "InmoScore";
  const workspaceHref = variant === "admin" ? "/admin" : "/dashboard";

  const handleLogout = () => {
    clearSession();
    setMobileOpen(false);
    router.replace("/login");
  };

  const sidebar = (
    <aside className="flex h-full w-[280px] flex-col border-r border-slate-200 bg-slate-950 text-white">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link href={workspaceHref} className="flex min-w-0 items-center gap-3" onClick={() => setMobileOpen(false)}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-300 text-sm font-black text-slate-950">
            IS
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black tracking-tight">InmoScore</span>
            <span className="block truncate text-xs text-slate-400">
              {variant === "admin" ? "Operations Console" : "Risk Workspace"}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
          aria-label="Cerrar navegación"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, currentSearch, item.href);
          const showIdentityLock =
            identityLocked && (item.href === "/reportar" || item.href === "/aportar-historial");
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              onClick={() => {
                setCurrentSearch(item.href.includes("?") ? `?${item.href.split("?")[1]}` : "");
                const module = item.href.includes("?") ? new URLSearchParams(item.href.split("?")[1]).get("module") : null;
                if (module) {
                  window.dispatchEvent(new CustomEvent("inmoscore-admin-module-change", { detail: module }));
                } else if (variant === "admin" && item.href === "/admin") {
                  window.dispatchEvent(new CustomEvent("inmoscore-admin-module-change", { detail: "summary" }));
                }
                setMobileOpen(false);
              }}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-emerald-300/40 bg-emerald-300/15 text-white shadow-[inset_3px_0_0_rgba(110,231,183,1)]"
                  : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-emerald-200" : ""}`} />
              <span className="truncate">{item.label}</span>
              {showIdentityLock && (
                <LockKeyhole
                  className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-200"
                  aria-label="Requiere identidad verificada"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-300 text-xs font-black text-slate-950">
              {initialsFor(activeUser)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{displayName}</p>
              <p className="truncate text-xs text-slate-400">
                {activeUser?.tipo_usuario || (variant === "admin" ? "admin" : "workspace")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white text-sm font-black text-slate-950 transition hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Cerrar navegación"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}

      <div className="lg:pl-[280px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm lg:hidden"
                aria-label="Abrir navegación"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  <Activity className="h-3.5 w-3.5" />
                  {eyebrow}
                </div>
                <h1 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-0.5 hidden max-w-3xl truncate text-sm text-slate-500 md:block">
                    {description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {topbarActions}
              <Link
                href={workspaceHref}
                className="hidden rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 sm:inline-flex"
                aria-label={variant === "admin" ? "Ir a operaciones" : "Ir al dashboard"}
              >
                <Home className="h-4 w-4" />
              </Link>
              <button
                type="button"
                disabled
                title="Próximamente"
                className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-400 shadow-sm"
                aria-label="Notificaciones próximamente"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
