"use client";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, X, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import { useI18n } from "./I18n";
import { itemTitle, StockBadge } from "./ui";
import type { Item } from "@/lib/types";
import type { MoveType } from "./useMovement";

export type SheetSubmit = { type: MoveType; quantity: number; note?: string; reason?: string };

export function StockSheet({ item, initialType = "in", onClose, onSubmit, busy }: {
  item: Item; initialType?: MoveType; onClose: () => void; onSubmit: (s: SheetSubmit) => void; busy?: boolean;
}) {
  const { t, lang, fmt } = useI18n();
  const [type, setType] = useState<MoveType>(initialType);
  const [qty, setQty] = useState<number>(initialType === "adjust" ? item.quantity : 1);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => { setQty(type === "adjust" ? item.quantity : 1); }, [type, item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const after = type === "in" ? item.quantity + qty : type === "out" ? item.quantity - qty : qty;
  const invalid = !Number.isInteger(qty) || qty < (type === "adjust" ? 0 : 1) || after < 0 || (type === "adjust" && reason.trim().length < 3);
  const reasons = lang === "ar" ? ["جرد فعلي", "تالف", "مفقود", "مرتجع"] : ["Physical count", "Damaged", "Missing", "Returned"];
  const types = useMemo(() => [
    { k: "in" as const, label: t.typeIn, icon: ArrowDownToLine, cls: "bg-olive text-offwhite" },
    { k: "out" as const, label: t.typeOut, icon: ArrowUpFromLine, cls: "bg-beige text-brand-black" },
    { k: "adjust" as const, label: t.typeAdjust, icon: SlidersHorizontal, cls: "bg-surface text-fg ring-1 ring-line" },
  ], [t]);

  const submit = () => !invalid && !busy && onSubmit({ type, quantity: qty, note: note.trim() || undefined, reason: reason.trim() || undefined });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 anim-fade md:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={itemTitle(item, lang)}>
      <form className="anim-sheet w-full max-w-lg rounded-t-3xl border border-line bg-surface p-5 pb-6 safe-b md:rounded-3xl"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug" data-testid="sheet-title">{itemTitle(item, lang)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span dir="ltr" className="font-mono">{item.sku}</span>
              <StockBadge item={item} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted">{t.available}</div>
            <div className="num text-3xl font-bold" data-testid="sheet-qty">{fmt(item.quantity)}</div>
          </div>
          <button type="button" onClick={onClose} className="-me-2 -mt-2 rounded-full p-2 text-muted hover:bg-surface-2" aria-label={t.close}><X className="size-5" /></button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist">
          {types.map((x) => (
            <button key={x.k} type="button" role="tab" aria-selected={type === x.k} onClick={() => setType(x.k)}
              className={`flex h-12 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold transition-colors ${type === x.k ? x.cls : "text-muted"}`}>
              <x.icon className="size-4" /> {x.label}
            </button>
          ))}
        </div>

        <label className="label">{type === "adjust" ? t.newCount : t.quantity}</label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost size-14 shrink-0 p-0" onClick={() => setQty((q) => Math.max(type === "adjust" ? 0 : 1, q - 1))} aria-label="-1"><Minus className="size-6" /></button>
          <input inputMode="numeric" pattern="[0-9]*" className="input num h-14 text-center text-2xl font-bold" value={Number.isNaN(qty) ? "" : qty}
            onChange={(e) => setQty(parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10))} onFocus={(e) => e.target.select()} aria-label={t.quantity} data-testid="qty-input" />
          <button type="button" className="btn-ghost size-14 shrink-0 p-0" onClick={() => setQty((q) => q + 1)} aria-label="+1"><Plus className="size-6" /></button>
        </div>
        {type !== "adjust" && (
          <div className="mt-2 flex gap-2">
            {[5, 10, 20, 50].map((n) => (
              <button key={n} type="button" onClick={() => setQty(n)} className={`h-10 flex-1 rounded-xl text-sm font-semibold ${qty === n ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}>{n}</button>
            ))}
          </div>
        )}

        {type === "adjust" && (
          <div className="mt-3">
            <label className="label">{t.reason} *</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPh} maxLength={300} data-testid="reason-input" />
            <div className="mt-2 flex flex-wrap gap-2">
              {reasons.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className="chip bg-surface-2 py-1.5 text-muted">{r}</button>)}
            </div>
          </div>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">{t.note}</summary>
          <input className="input mt-2" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            placeholder={type === "in" ? t.supplierIn : type === "out" ? t.soldOut : ""} />
        </details>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-2 text-sm">
          <span className="text-muted">{t.before}: <b className="num text-fg">{fmt(item.quantity)}</b></span>
          <span className="text-muted">{t.after}: <b className={`num ${after < 0 ? "text-danger" : "text-fg"}`} data-testid="sheet-after">{fmt(after)}</b></span>
        </div>
        {after < 0 && <p className="mt-2 text-sm text-danger" role="alert">{t.insufficient}: {fmt(item.quantity)}</p>}

        <button type="submit" disabled={invalid || busy} data-testid="confirm-movement"
          className={`btn mt-4 h-14 w-full text-lg ${type === "out" ? "bg-beige text-brand-black" : type === "in" ? "bg-olive text-offwhite" : "bg-accent text-accent-fg"}`}>
          {t.confirm} {type === "in" ? t.stockIn : type === "out" ? t.stockOut : t.adjust}
          {type !== "adjust" && <span className="num" dir="ltr">({type === "in" ? "+" : "−"}{qty})</span>}
        </button>
      </form>
    </div>
  );
}
