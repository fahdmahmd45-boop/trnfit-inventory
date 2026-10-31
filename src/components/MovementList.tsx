"use client";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import { useI18n } from "./I18n";
import type { Movement } from "@/lib/types";

export function MovementRow({ m, showItem = true }: { m: Movement; showItem?: boolean }) {
  const { t, fmt, fmtDate } = useI18n();
  const Icon = m.type === "in" ? ArrowDownToLine : m.type === "out" ? ArrowUpFromLine : SlidersHorizontal;
  const color = m.type === "in" ? "bg-olive/25 text-olive-light" : m.type === "out" ? "bg-beige/20 text-beige" : "bg-surface-2 text-muted";
  const label = m.type === "in" ? t.typeIn : m.type === "out" ? t.typeOut : t.typeAdjust;
  return (
    <li className="flex items-center gap-3 py-3" data-testid="movement-row">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">
          {showItem ? `${m.productName}${m.variantName ? " — " + m.variantName : ""}` : label}
        </div>
        <div className="truncate text-xs text-muted">
          {showItem && <span className="me-1">{label} ·</span>}
          <bdi dir="ltr" className="font-mono">{m.sku}</bdi> · <bdi>{m.employeeName}</bdi> · <bdi>{fmtDate(m.createdAt)}</bdi>
          {m.reason && <> · <bdi>{m.reason}</bdi></>}{m.note && <> · <bdi>{m.note}</bdi></>}
        </div>
      </div>
      <div className="text-end">
        <div className={`num font-bold ${m.quantity > 0 ? "text-ok" : m.quantity < 0 ? "text-beige" : "text-muted"}`} dir="ltr">
          {m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : "±"}{fmt(Math.abs(m.quantity))}
        </div>
        <div className="num text-xs text-muted" dir="ltr">{fmt(m.quantityBefore)} → {fmt(m.quantityAfter)}</div>
      </div>
    </li>
  );
}
