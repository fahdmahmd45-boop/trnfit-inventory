"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { LayoutDashboard, Package, ScanLine, History, Settings, Barcode, LogOut } from "lucide-react";
import { useI18n } from "./I18n";
import { ToastProvider } from "./Toast";
import { Logo } from "./Logo";
import { fetcher, api } from "@/lib/api";
import type { SessionUser } from "@/lib/server/auth";
import { createContext, useContext } from "react";

const UserCtx = createContext<SessionUser | null>(null);
export const useUser = () => useContext(UserCtx)!;

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const fullscreen = path.startsWith("/scan");
  const nav = [
    { href: "/", label: t.navDashboard, icon: LayoutDashboard },
    { href: "/items", label: t.navItems, icon: Package },
    { href: "/scan", label: t.navScan, icon: ScanLine, primary: true },
    { href: "/movements", label: t.navMovements, icon: History },
    { href: "/barcodes", label: t.navBarcodes, icon: Barcode, desktopOnly: true },
    { href: "/settings", label: t.navSettings, icon: Settings },
  ];
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const doLogout = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/login");
  };

  return (
    <UserCtx.Provider value={user}>
      <SWRConfig value={{ fetcher, dedupingInterval: 2000, revalidateOnFocus: true, keepPreviousData: true, errorRetryCount: 2 }}>
        <ToastProvider>
          {fullscreen ? children : (
            <div className="md:flex">
              <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface p-4 md:flex">
                <Logo slogan className="mb-8 px-2 pt-2" />
                <nav className="flex flex-1 flex-col gap-1">
                  {nav.map((n) => (
                    <Link key={n.href} href={n.href} prefetch
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors
                        ${n.primary ? "my-2 bg-olive text-offwhite hover:brightness-110" : active(n.href) ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
                      <n.icon className="size-5" /> {n.label}
                    </Link>
                  ))}
                </nav>
                <div className="border-t border-line pt-4">
                  <div className="px-3 text-sm font-semibold">{user.name}</div>
                  <div className="px-3 text-xs text-muted">@{user.username}</div>
                  <button onClick={doLogout} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                    <LogOut className="size-4" /> {t.logout}
                  </button>
                </div>
              </aside>
              <div className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-3 backdrop-blur safe-t md:hidden">
                  <Logo />
                  <span className="text-xs text-muted">{user.name}</span>
                </header>
                <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
              </div>
              <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur safe-b md:hidden">
                <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
                  {nav.filter((n) => !n.desktopOnly).map((n) => n.primary ? (
                    <Link key={n.href} href={n.href} aria-label={n.label} className="-mt-6 flex flex-col items-center gap-1 pb-2">
                      <span className="flex size-16 items-center justify-center rounded-2xl bg-olive text-offwhite shadow-lg shadow-black/40 ring-4 ring-bg active:scale-95 transition-transform">
                        <n.icon className="size-8" />
                      </span>
                      <span className="text-[11px] font-semibold">{n.label}</span>
                    </Link>
                  ) : (
                    <Link key={n.href} href={n.href}
                      className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active(n.href) ? "text-olive-light" : "text-muted"}`}>
                      <n.icon className="size-6" />
                      <span className="max-w-full truncate px-1">{n.label}</span>
                    </Link>
                  ))}
                </div>
              </nav>
            </div>
          )}
        </ToastProvider>
      </SWRConfig>
    </UserCtx.Provider>
  );
}
