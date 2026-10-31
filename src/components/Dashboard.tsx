"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ScanLine, ArrowDownToLine, ArrowUpFromLine, Search, AlertTriangle, Boxes, Package, PackageX, TrendingDown } from "lucide-react";
import { useI18n } from "./I18n";
import { useUser } from "./Shell";
import { MovementRow } from "./MovementList";
import { itemTitle, Skeleton, StockBadge } from "./ui";
import type { DashboardStats, Item, Movement } from "@/lib/types";

type D = { stats: DashboardStats; recent: Movement[]; alerts: Item[] };

/** Preload the scanner bundle + WASM the moment the user reaches for the scan button. */
export const warmScanner = () => { void import("@/scanner/engine").then((m) => m.prewarm()); };

export function Dashboard() {
  const { t, lang, fmt } = useI18n();
  const user = useUser();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { data, error } = useSWR<D>("/api/dashboard", { refreshInterval: 20_000 });
  const s = data?.stats;

  const stats = [
    { label: t.totalProducts, value: s?.skus, sub: s ? `${t.productGroups}: ${fmt(s.products)}` : "", icon: Package, tone: "text-fg" },
    { label: t.totalUnits, value: s?.units, sub: s ? `${t.todayIn} +${fmt(s.unitsInToday)} · ${t.todayOut} −${fmt(s.unitsOutToday)}` : "", icon: Boxes, tone: "text-fg" },
    { label: t.lowStock, value: s?.lowStock, icon: TrendingDown, tone: s?.lowStock ? "text-warn" : "text-fg", href: "/items?filter=low" },
    { label: t.outOfStock, value: s?.outOfStock, icon: PackageX, tone: s?.outOfStock ? "text-danger" : "text-fg", href: "/items?filter=out" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">{t.hello} {user.name}</p>
          <h1 className="text-2xl font-bold">{t.navDashboard}</h1>
        </div>
      </div>

      {/* Primary actions — the warehouse flow starts here */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Link href="/scan" onPointerDown={warmScanner} onMouseEnter={warmScanner} data-testid="dash-scan"
          className="col-span-2 flex h-24 items-center justify-center gap-3 rounded-2xl bg-olive text-xl font-bold text-offwhite shadow-lg shadow-olive/20 active:scale-[0.98] transition-transform md:col-span-1">
          <ScanLine className="size-8" /> {t.scanBarcode}
        </Link>
        <Link href="/scan?mode=in" onPointerDown={warmScanner} className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-olive/50 bg-olive/15 font-semibold active:scale-[0.98] transition-transform md:h-24">
          <ArrowDownToLine className="size-5 text-olive-light" /> {t.quickIn}
        </Link>
        <Link href="/scan?mode=out" onPointerDown={warmScanner} className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-beige/40 bg-beige/10 font-semibold active:scale-[0.98] transition-transform md:h-24">
          <ArrowUpFromLine className="size-5 text-beige" /> {t.quickOut}
        </Link>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); router.push(`/items?q=${encodeURIComponent(q)}`); }} className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input className="input ps-12" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPh} type="search" enterKeyHint="search" />
      </form>

      {error && <p className="rounded-xl bg-danger/15 p-3 text-sm text-danger">{t.serverError}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((x) => {
          const body = (
            <>
              <div className="flex items-center justify-between text-sm text-muted"><span>{x.label}</span><x.icon className="size-4" /></div>
              {x.value === undefined ? <Skeleton className="mt-2 h-9 w-16" /> :
                <div className={`num mt-1 text-3xl font-bold ${x.tone}`} data-testid={`stat-${x.label}`}>{fmt(x.value)}</div>}
              {x.sub && <div className="mt-1 truncate text-xs text-muted">{x.sub}</div>}
            </>
          );
          return x.href ? <Link key={x.label} href={x.href} className="card p-4 hover:border-accent/50 transition-colors">{body}</Link>
            : <div key={x.label} className="card p-4">{body}</div>;
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold"><AlertTriangle className="size-4 text-warn" /> {t.warnings}</h2>
          {!data ? <Skeleton className="h-24" /> : data.alerts.length === 0 ? <p className="py-6 text-center text-muted">{t.noWarnings}</p> : (
            <ul className="divide-y divide-line">
              {data.alerts.map((i) => (
                <li key={i.id}>
                  <Link href={`/items/${i.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{itemTitle(i, lang)}</div>
                      <div dir="ltr" className="text-start font-mono text-xs text-muted">{i.sku}</div>
                    </div>
                    <span className="num text-lg font-bold">{fmt(i.quantity)}</span>
                    <StockBadge item={i} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">{t.recentMovements}</h2>
            <Link href="/movements" className="text-sm text-olive-light">{t.viewAll}</Link>
          </div>
          {!data ? <Skeleton className="h-24" /> : data.recent.length === 0 ? <p className="py-6 text-center text-muted">{t.noMovements}</p> : (
            <ul className="divide-y divide-line">{data.recent.map((m) => <MovementRow key={m.id} m={m} />)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
