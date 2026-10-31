"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { FileDown, Printer, Download } from "lucide-react";
import { useI18n } from "./I18n";
import { useToast } from "./Toast";
import { itemTitle, PageHeader, Skeleton, Spinner } from "./ui";
import type { Item } from "@/lib/types";
import { LABEL_SIZES } from "@/lib/barcode";

export function BarcodesView() {
  const { t, lang } = useI18n();
  const sp = useSearchParams();
  const toast = useToast();
  const { data } = useSWR<{ items: Item[] }>("/api/items");
  const [sel, setSel] = useState<Record<string, number>>(() =>
    Object.fromEntries((sp.get("ids") ?? "").split(",").filter(Boolean).map((id) => [id, 1])));
  const [size, setSize] = useState(LABEL_SIZES[0].id);
  const [showName, setShowName] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const items = data?.items ?? [];
  const chosen = useMemo(() => items.filter((i) => sel[i.id]), [items, sel]);
  const labelSize = LABEL_SIZES.find((s) => s.id === size)!;

  useEffect(() => {
    const first = chosen[0] ?? items[0];
    if (!first) return;
    let live = true;
    import("@/lib/barcode").then((b) => b.labelDataUrl(first, itemTitle(first, lang), labelSize, showName)).then((u) => live && setPreview(u));
    return () => { live = false; };
  }, [chosen, items, labelSize, showName, lang]);

  const entries = () => chosen.map((item) => ({ item, title: itemTitle(item, lang), copies: sel[item.id] }));
  const pdf = async () => {
    setBusy(true);
    try {
      const b = await import("@/lib/barcode");
      b.download(await b.labelsPdf(entries(), labelSize, showName), `trnfit-labels-${size}.pdf`);
    } catch { toast("error", t.serverError); } finally { setBusy(false); }
  };
  const print = () => {
    const ids = chosen.map((i) => `${i.id}:${sel[i.id]}`).join(",");
    window.open(`/print?size=${size}&name=${showName ? 1 : 0}&ids=${ids}`, "_blank");
  };
  const allSelected = items.length > 0 && chosen.length === items.length;

  return (
    <div>
      <PageHeader title={t.navBarcodes} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-2">
          <label className="flex items-center gap-3 border-b border-line p-3 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={allSelected}
              onChange={(e) => setSel(e.target.checked ? Object.fromEntries(items.map((i) => [i.id, sel[i.id] || 1])) : {})} />
            {t.selectAll} <span className="text-muted">({chosen.length} {t.selected})</span>
          </label>
          {!data ? <Skeleton className="m-3 h-40" /> : (
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={!!sel[i.id]} aria-label={i.sku}
                    onChange={(e) => setSel((s) => { const n = { ...s }; if (e.target.checked) n[i.id] = 1; else delete n[i.id]; return n; })} />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="truncate font-semibold">{itemTitle(i, lang)}</div>
                    <div dir="ltr" className="text-start font-mono text-xs text-muted">{i.barcode}</div>
                  </div>
                  {sel[i.id] ? (
                    <input type="number" min={1} max={500} className="input h-10 w-20 text-center" value={sel[i.id]} aria-label={t.copies}
                      onChange={(e) => setSel((s) => ({ ...s, [i.id]: Math.max(1, Math.min(500, parseInt(e.target.value || "1", 10))) }))} />
                  ) : null}
                  <button className="btn-ghost h-10 px-3 text-xs" onClick={async () => { const b = await import("@/lib/barcode"); await b.downloadPng(i, itemTitle(i, lang), labelSize, showName); }}><Download className="size-4" />PNG</button>
                  <button className="btn-ghost h-10 px-3 text-xs" onClick={async () => { const b = await import("@/lib/barcode"); await b.downloadSvg(i); }}><Download className="size-4" />SVG</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="card h-fit space-y-4 p-4 lg:sticky lg:top-8">
          <div>
            <label className="label">{t.labelSize}</label>
            <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
              {LABEL_SIZES.map((s) => <option key={s.id} value={s.id}>{s.sheet ? `${t.a4Sheet} — ${s.sheet.cols}×${s.sheet.rows} (${s.w}×${s.h} mm)` : `${s.w} × ${s.h} mm`}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[var(--accent)]" checked={showName} onChange={(e) => setShowName(e.target.checked)} />{t.showName}</label>
          <div className="flex min-h-28 items-center justify-center rounded-xl bg-surface-2 p-3">
            {preview ? <img src={preview} alt="label preview" className="max-h-48 w-auto rounded shadow" style={{ aspectRatio: `${labelSize.w}/${labelSize.h}` }} /> : <Spinner />}
          </div>
          <button className="btn-primary w-full" disabled={!chosen.length || busy} onClick={pdf} data-testid="pdf-btn">{busy ? <><Spinner />{t.generating}</> : <><FileDown className="size-5" />{t.downloadPdf}</>}</button>
          <button className="btn-ghost w-full" disabled={!chosen.length} onClick={print}><Printer className="size-5" />{t.printSelected}</button>
        </aside>
      </div>
    </div>
  );
}
