"use client";
import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Download, Undo2, X } from "lucide-react";
import { useI18n } from "./I18n";
import { useUser } from "./Shell";
import { useToast } from "./Toast";
import { api, ApiClientError } from "@/lib/api";
import { useSWRConfig } from "swr";
import { MovementRow } from "./MovementList";
import { PageHeader, Skeleton, Spinner } from "./ui";
import type { Movement } from "@/lib/types";

type Page = { items: Movement[]; nextCursor: number | null };

export function MovementsView() {
  const { t, lang, fmt } = useI18n();
  const user = useUser();
  const toast = useToast();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [selected, setSelected] = useState<Movement | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"" | "in" | "out" | "adjust">("");
  const { data, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(
    (i, prev) => (i > 0 && !prev?.nextCursor ? null : `/api/movements?limit=30${type ? `&type=${type}` : ""}${i > 0 ? `&cursor=${prev!.nextCursor}` : ""}`),
  );
  const rows = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;
  const cancel = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api(`/api/movements/${selected.id}/cancel`, { method: "POST", body: {} });
      setSelected(null);
      await mutate();
      void mutateGlobal((k) => typeof k === "string" && (k.startsWith("/api/dashboard") || k.startsWith("/api/items")));
      toast("success", lang === "ar" ? "أُلغيت الحركة وتم تصحيح المخزون" : "Movement cancelled and inventory corrected");
    } catch (e) {
      const code = (e as ApiClientError)?.code;
      toast("error", code === "INSUFFICIENT_STOCK"
        ? (lang === "ar" ? "لا يمكن الإلغاء: المخزون الحالي أقل من الكمية المطلوب خصمها" : "Cannot cancel: insufficient current stock")
        : code === "ALREADY_CANCELLED" ? (lang === "ar" ? "هذه الحركة ملغاة مسبقًا" : "Already cancelled")
        : (lang === "ar" ? "تعذّر إلغاء الحركة، تحقق من الاتصال وحاول مجددًا" : "Could not cancel movement"));
    } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title={t.navMovements}>
        <a href="/api/export?format=csv&dataset=movements" className="btn-ghost h-10 text-sm"><Download className="size-4" />CSV</a>
        <a href="/api/export?format=xlsx&dataset=movements" className="btn-ghost h-10 text-sm"><Download className="size-4" />Excel</a>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {([["", t.all], ["in", t.typeIn], ["out", t.typeOut], ["adjust", t.typeAdjust]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setType(k)} className={`h-9 rounded-full px-4 text-sm font-semibold ${type === k ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}>{l}</button>
        ))}
      </div>
      <section className="card px-4">
        {!data ? <Skeleton className="my-4 h-40" /> : rows.length === 0 ? <p className="py-10 text-center text-muted">{t.noMovements}</p> : (
          <ul className="divide-y divide-line">{rows.map((m) => (
            <MovementRow key={m.id} m={m} action={user.role === "admin" && !m.cancelled && !m.isReversal ? (
              <button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:border-danger hover:text-danger"
                onClick={() => setSelected(m)} aria-label={lang === "ar" ? "إلغاء الحركة" : "Cancel movement"} title={lang === "ar" ? "إلغاء الحركة" : "Cancel movement"}>
                <Undo2 className="size-5" />
              </button>
            ) : null} />
          ))}</ul>
        )}
      </section>
      {hasMore && <button className="btn-ghost mt-3 w-full" onClick={() => setSize(size + 1)} disabled={isValidating}>{isValidating ? <Spinner /> : t.loadMore}</button>}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setSelected(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h2 id="cancel-title" className="text-lg font-bold">{lang === "ar" ? "تأكيد إلغاء الحركة" : "Confirm cancellation"}</h2>
              <button type="button" onClick={() => setSelected(null)} disabled={busy} aria-label={t.close}><X className="size-5" /></button>
            </div>
            <p className="mt-3 text-sm text-muted">{lang === "ar" ? "سيُسجّل تصحيح عكسي للمخزون مع الاحتفاظ بتاريخ العملية. لا يمكن إلغاء التصحيح نفسه." : "A compensating stock movement will be recorded and the original history preserved. Corrections cannot be cancelled."}</p>
            <div className="my-4 rounded-xl bg-surface-2 p-4 text-sm">
              <div className="font-bold">{selected.productName} — {selected.variantName}</div>
              <div className="mt-1 font-mono text-muted" dir="ltr">#{selected.id} · {selected.sku}</div>
              <div className="mt-2 font-semibold" dir="ltr">{selected.quantity > 0 ? "+" : ""}{fmt(selected.quantity)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setSelected(null)}>{lang === "ar" ? "تراجع" : "Back"}</button>
              <button type="button" className="btn bg-danger text-white" disabled={busy} onClick={() => { void cancel(); }}>{busy ? <Spinner /> : <Undo2 className="size-4" />}{lang === "ar" ? "تأكيد الإلغاء" : "Confirm cancellation"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
