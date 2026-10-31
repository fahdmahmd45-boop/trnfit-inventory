"use client";
import { useI18n } from "./I18n";
import type { Item } from "@/lib/types";
import { Loader2 } from "lucide-react";

export function stockState(i: Pick<Item, "quantity" | "lowStockThreshold">): "ok" | "low" | "out" {
  return i.quantity === 0 ? "out" : i.quantity <= i.lowStockThreshold ? "low" : "ok";
}

export function StockBadge({ item }: { item: Pick<Item, "quantity" | "lowStockThreshold"> }) {
  const { t } = useI18n();
  const s = stockState(item);
  const cls = s === "out" ? "bg-danger/15 text-danger" : s === "low" ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok";
  return <span className={`chip ${cls}`}>{t[s]}</span>;
}

export function itemTitle(i: Pick<Item, "name" | "nameAr" | "variantName">, lang: string) {
  const name = lang === "ar" && i.nameAr ? i.nameAr : i.name;
  return i.variantName ? `${name} — ${i.variantName}` : name;
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function errorText(t: ReturnType<typeof useI18n>["t"], e: unknown): string {
  const err = e as { code?: string; data?: { available?: number; field?: string } };
  switch (err?.code) {
    case "NETWORK": return t.networkError;
    case "INSUFFICIENT_STOCK": return `${t.insufficient}: ${err.data?.available ?? 0}`;
    case "INVALID_CODE": return t.invalidCode;
    case "RATE_LIMITED": return t.rateLimited;
    case "VALIDATION": return t.validationError;
    case "NOT_FOUND": return t.notFound;
    case "CODE_IN_USE": return t.codeInUse;
    case "DUPLICATE": return err.data?.field === "barcode" ? t.duplicateBarcode : t.duplicateSku;
    case "UNAUTHENTICATED": return t.sessionExpired;
    default: return t.serverError;
  }
}
