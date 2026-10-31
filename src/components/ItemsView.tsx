"use client";
import Link from "next/link";
import { useMemo, useState, useDeferredValue } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Search, Download, Barcode, ArrowLeftRight } from "lucide-react";
import { useI18n } from "./I18n";
import { useToast } from "./Toast";
import { itemTitle, PageHeader, Skeleton, StockBadge, stockState, errorText } from "./ui";
import { StockSheet, type SheetSubmit } from "./StockSheet";
import { useMovement } from "./useMovement";
import type { Item } from "@/lib/types";

type F = "all" | "low" | "out";

export function ItemsView() {
  const { t, lang, fmt } = useI18n();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const move = useMovement();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [filter, setFilter] = useState<F>((sp.get("filter") as F) || "all");
  const [sheet, setSheet] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const dq = useDeferredValue(q);
  // One cached request for the whole catalogue; searching and filtering are instant and local.
  const { data, error } = useSWR<{ items: Item[] }>("/api/items");

  const items = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => {
      if (filter !== "all" && stockState(i) !== filter) return false;
      if (!needle) return true;
      return [i.name, i.nameAr ?? "", i.sku, i.barcode, i.variantName, i.color, i.category, i.size].some((x) => x.toLowerCase().includes(needle));
    });
  }, [data, dq, filter]);

  const setF = (f: F) => { setFilter(f); router.replace(`/items?${new URLSearchParams({ ...(q ? { q } : {}), ...(f !== "all" ? { filter: f } : {}) })}`, { scroll: false }); };
  const submit = async (s: SheetSubmit) => {
    if (!sheet) return;
    setBusy(true);
    try { await move({ item: sheet, ...s }); toast("success", t.movementSaved); setSheet(null); }
    catch (e) { toast("error", errorText(t, e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title={t.navItems}>
        <a href="/api/export?format=csv&dataset=inventory" className="btn-ghost h-10 text-sm"><Download className="size-4" />CSV</a>
        <a href="/api/export?format=xlsx&dataset=inventory" className="btn-ghost h-10 text-sm"><Download className="size-4" />Excel</a>
        <Link href="/barcodes" className="btn-ghost h-10 text-sm"><Barcode className="size-4" />{t.navBarcodes}</Link>
        <Link href="/items/new" className="btn-primary h-10 text-sm" data-testid="add-product"><Plus className="size-4" />{t.addProduct}</Link>
      </PageHeader>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input className="input ps-12" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPh} type="search" data-testid="items-search" />
      </div>
      <div className="mb-4 flex gap-2">
        {(["all", "low", "out"] as const).map((f) => (
          <button key={f} onClick={() => setF(f)} className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${filter === f ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}>
            {f === "all" ? t.all : f === "low" ? t.lowStock : t.outOfStock}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-danger/15 p-3 text-sm text-danger">{t.serverError}</p>}
      {!data ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div> : items.length === 0 ? (
        <p className="card p-8 text-center text-muted">{t.noItems}</p>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden">
            {items.map((i) => (
              <li key={i.id} className="card flex items-center gap-2 p-3" data-testid="item-row">
                <Link href={`/items/${i.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{itemTitle(i, lang)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted"><span dir="ltr" className="font-mono">{i.sku}</span><StockBadge item={i} /></div>
                </Link>
                <div className="num px-2 text-2xl font-bold" data-testid="item-qty">{fmt(i.quantity)}</div>
                <button onClick={() => setSheet(i)} className="btn-ghost size-12 p-0" aria-label={t.quickIn}><ArrowLeftRight className="size-5" /></button>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr className="text-start">
                  <th className="p-3 text-start font-medium">{t.product}</th>
                  <th className="p-3 text-start font-medium">{t.sku}</th>
                  <th className="p-3 text-start font-medium">{t.category}</th>
                  <th className="p-3 text-end font-medium">{t.available}</th>
                  <th className="p-3 text-end font-medium">{t.minStock}</th>
                  <th className="p-3 text-start font-medium">{t.status}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-surface-2/60" data-testid="item-row">
                    <td className="p-3"><Link href={`/items/${i.id}`} className="font-semibold hover:text-olive-light">{itemTitle(i, lang)}</Link></td>
                    <td className="p-3 font-mono text-muted" dir="ltr">{i.sku}</td>
                    <td className="p-3 text-muted">{i.category}</td>
                    <td className="num p-3 text-end text-lg font-bold" data-testid="item-qty">{fmt(i.quantity)}</td>
                    <td className="num p-3 text-end text-muted">{fmt(i.lowStockThreshold)}</td>
                    <td className="p-3"><StockBadge item={i} /></td>
                    <td className="p-3 text-end"><button onClick={() => setSheet(i)} className="btn-ghost h-9 text-sm"><ArrowLeftRight className="size-4" />{t.quickIn}/{t.quickOut}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sheet && <StockSheet item={data?.items.find((x) => x.id === sheet.id) ?? sheet} busy={busy} onClose={() => setSheet(null)} onSubmit={submit} />}
    </div>
  );
}
