"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Pencil, Download, Plus, ChevronLeft, ChevronRight, Archive, X } from "lucide-react";
import { useI18n } from "./I18n";
import { useToast } from "./Toast";
import { useUser } from "./Shell";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { StockSheet, type SheetSubmit } from "./StockSheet";
import { useMovement, type MoveType } from "./useMovement";
import { MovementRow } from "./MovementList";
import { errorText, itemTitle, Skeleton, StockBadge, Spinner } from "./ui";
import { api } from "@/lib/api";
import type { Item, Movement } from "@/lib/types";

export function ItemDetail({ id }: { id: string }) {
  const { t, lang, fmt, fmtDate } = useI18n();
  const toast = useToast();
  const move = useMovement();
  const user = useUser();
  const router = useRouter();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, mutate } = useSWR<{ item: Item }>(`/api/items/${id}`);
  const hist = useSWRInfinite<{ items: Movement[]; nextCursor: number | null }>(
    (i, prev) => (i > 0 && !prev?.nextCursor ? null : `/api/movements?variantId=${id}&limit=20${i > 0 ? `&cursor=${prev!.nextCursor}` : ""}`),
  );
  const [sheet, setSheet] = useState<MoveType | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const item = data?.item;

  useEffect(() => {
    if (!item) return;
    let live = true;
    import("@/lib/barcode").then((b) => b.barcodeSvg(item.barcode)).then((s) => live && setSvg(s)).catch(() => {});
    return () => { live = false; };
  }, [item?.barcode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="card p-8 text-center text-muted">{errorText(t, error)}</p>;
  if (!item) return <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40" /><Skeleton className="h-60" /></div>;

  const submit = async (s: SheetSubmit) => {
    setBusy(true);
    try { await move({ item, ...s }); toast("success", t.movementSaved); setSheet(null); hist.mutate(); }
    catch (e) { toast("error", errorText(t, e)); } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!item || archiving) return;
    setArchiving(true);
    try {
      await api(`/api/items/${id}`, { method: "DELETE", body: {} });
      void mutateGlobal((k) => typeof k === "string" && (k.startsWith("/api/items") || k.startsWith("/api/dashboard")));
      toast("success", lang === "ar" ? "تمت أرشفة المنتج وإخفاؤه من المخزون" : "Item archived and hidden from inventory");
      router.replace("/items");
    } catch (e) {
      const code = (e as { code?: string }).code;
      toast("error", code === "NONZERO_STOCK"
        ? (lang === "ar" ? "لا يمكن الأرشفة قبل تصفير الكمية عن طريق جرد المخزون" : "Set stock to zero using an inventory adjustment first")
        : errorText(t, e));
    } finally { setArchiving(false); }
  };
  const Back = lang === "ar" ? ChevronRight : ChevronLeft;
  const movements = hist.data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!hist.data?.[hist.data.length - 1]?.nextCursor;

  return (
    <div className="space-y-4">
      <Link href="/items" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><Back className="size-4" />{t.navItems}</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" data-testid="item-title">{itemTitle(item, lang)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span dir="ltr" className="font-mono">{item.sku}</span>
            {item.category && <span>· {item.category}</span>}
            <StockBadge item={item} />
          </div>
        </div>
        <div className="card px-6 py-3 text-center">
          <div className="text-xs text-muted">{t.available}</div>
          <div className="num text-4xl font-bold" data-testid="detail-qty">{fmt(item.quantity)}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className="btn-olive h-14" onClick={() => setSheet("in")} data-testid="btn-in"><ArrowDownToLine className="size-5" />{t.typeIn}</button>
        <button className="btn h-14 bg-beige text-brand-black" onClick={() => setSheet("out")} data-testid="btn-out"><ArrowUpFromLine className="size-5" />{t.typeOut}</button>
        <button className="btn-ghost h-14" onClick={() => setSheet("adjust")} data-testid="btn-adjust"><SlidersHorizontal className="size-5" />{t.typeAdjust}</button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{t.details}</h2>
            <div className="flex gap-2 whitespace-nowrap">
              <Link href={`/items/new?product=${item.productId}&name=${encodeURIComponent(item.name)}`} className="btn-ghost h-9 text-sm"><Plus className="size-4" />{t.addVariant}</Link>
              <button className="btn-ghost h-9 text-sm" onClick={() => setEditing((e) => !e)} data-testid="edit-btn"><Pencil className="size-4" />{t.editProduct}</button>
              {user.role === "admin" && <button type="button" className="btn-ghost h-9 text-sm text-danger" onClick={() => setArchiveOpen(true)} data-testid="archive-item"><Archive className="size-4" />{lang === "ar" ? "أرشفة المنتج" : "Archive item"}</button>}
            </div>
          </div>
          {editing ? <EditForm item={item} onSaved={(it) => { mutate({ item: it }, { revalidate: false }); setEditing(false); }} /> : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                [t.productName, item.name], [t.productNameAr, item.nameAr || "—"], [t.variant, item.variantName || "—"],
                [t.color, item.color || "—"], [t.size, item.size || "—"], [t.category, item.category || "—"],
                [t.sku, item.sku], [t.barcode, item.barcode], [t.minStock, fmt(item.lowStockThreshold)],
                [t.created, fmtDate(item.createdAt)], [t.updated, fmtDate(item.updatedAt)],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium break-words">{v}</dd></div>
              ))}
            </dl>
          )}
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-bold">{t.barcode} <span className="text-xs font-normal text-muted">Code 128</span></h2>
          <div className="flex min-h-32 items-center justify-center rounded-xl bg-white p-3">
            {svg ? <div className="w-full max-w-sm [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} data-testid="barcode-svg" /> : <Spinner className="size-6 text-black" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost h-10 text-sm" onClick={async () => { const b = await import("@/lib/barcode"); await b.downloadPng(item, itemTitle(item, lang), b.LABEL_SIZES[0]); }}><Download className="size-4" />PNG</button>
            <button className="btn-ghost h-10 text-sm" onClick={async () => { const b = await import("@/lib/barcode"); await b.downloadSvg(item); }}><Download className="size-4" />SVG</button>
            <Link href={`/barcodes?ids=${item.id}`} className="btn-ghost h-10 text-sm">{t.labelsPdf} / {t.print}</Link>
          </div>
        </section>
      </div>

      <section className="card p-4">
        <h2 className="mb-1 font-bold">{t.history}</h2>
        {!hist.data ? <Skeleton className="h-24" /> : movements.length === 0 ? <p className="py-6 text-center text-muted">{t.noMovements}</p> : (
          <ul className="divide-y divide-line">{movements.map((m) => <MovementRow key={m.id} m={m} showItem={false} />)}</ul>
        )}
        {hasMore && <button className="btn-ghost mt-3 w-full" onClick={() => hist.setSize(hist.size + 1)} disabled={hist.isValidating}>{hist.isValidating ? <Spinner /> : t.loadMore}</button>}
      </section>

      {sheet && <StockSheet item={item} initialType={sheet} busy={busy} onClose={() => setSheet(null)} onSubmit={submit} />}
      {archiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !archiving && setArchiveOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="archive-title" className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h2 id="archive-title" className="text-lg font-bold">{lang === "ar" ? "تأكيد أرشفة المنتج" : "Confirm item archive"}</h2>
              <button type="button" disabled={archiving} onClick={() => setArchiveOpen(false)} aria-label={t.close}><X className="size-5" /></button>
            </div>
            <p className="mt-3 text-sm text-muted">{lang === "ar" ? "سيختفي المنتج من القائمة والمسح، لكن سجله وحركاته القديمة ستبقى محفوظة. لا يمكن أرشفته إلا إذا كانت الكمية صفرًا." : "This item will disappear from inventory and scanning, while preserving its movement history. Stock must be zero."}</p>
            <p className="my-3 font-mono text-sm" dir="ltr">{item.sku} · {fmt(item.quantity)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" disabled={archiving} onClick={() => setArchiveOpen(false)}>{lang === "ar" ? "تراجع" : "Back"}</button>
              <button className="btn bg-danger text-white" disabled={archiving || item.quantity !== 0} onClick={() => { void archive(); }} data-testid="confirm-archive">{archiving ? <Spinner /> : <Archive className="size-4" />}{lang === "ar" ? "تأكيد الأرشفة" : "Archive"}</button>
            </div>
            {item.quantity !== 0 && <p className="mt-3 text-sm text-danger">{lang === "ar" ? "صفّر رصيد المنتج أولًا عن طريق تعديل الجرد مع كتابة السبب." : "Adjust stock to zero with a reason first."}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({ item, onSaved }: { item: Item; onSaved: (i: Item) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({
    name: item.name, nameAr: item.nameAr ?? "", category: item.category, variantName: item.variantName,
    color: item.color, size: item.size, sku: item.sku, barcode: item.barcode, lowStockThreshold: item.lowStockThreshold,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: k === "lowStockThreshold" ? parseInt(e.target.value || "0", 10) : e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/products/${item.productId}`, { method: "PATCH", body: { name: f.name, nameAr: f.nameAr || null, category: f.category } });
      const r = await api<{ item: Item }>(`/api/items/${item.id}`, { method: "PATCH", body: {
        variantName: f.variantName, color: f.color, size: f.size, sku: f.sku, barcode: f.barcode, lowStockThreshold: f.lowStockThreshold,
      } });
      toast("success", t.saved);
      onSaved(r.item);
    } catch (err) { toast("error", errorText(t, err)); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label">{label}</label><input className="input" value={f[k]} onChange={set(k)} {...extra} data-testid={`edit-${k}`} /></div>
  );
  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {field("name", t.productName, { required: true, dir: "ltr" })}
      {field("nameAr", t.productNameAr, { dir: "rtl" })}
      {field("category", t.category)}
      {field("variantName", t.variant)}
      {field("color", t.color)}
      {field("size", t.size)}
      {field("sku", t.sku, { dir: "ltr", className: "input font-mono uppercase", pattern: "[A-Za-z0-9][A-Za-z0-9\\-]{1,47}" })}
      {field("barcode", t.barcode, { dir: "ltr", className: "input font-mono" })}
      {field("lowStockThreshold", t.minStock, { type: "number", min: 0, inputMode: "numeric" })}
      <div className="flex items-end"><button className="btn-primary w-full" disabled={busy} data-testid="save-edit">{busy ? <Spinner /> : t.save}</button></div>
    </form>
  );
}
