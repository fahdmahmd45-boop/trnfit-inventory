"use client";
import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Download } from "lucide-react";
import { useI18n } from "./I18n";
import { MovementRow } from "./MovementList";
import { PageHeader, Skeleton, Spinner } from "./ui";
import type { Movement } from "@/lib/types";

type Page = { items: Movement[]; nextCursor: number | null };

export function MovementsView() {
  const { t } = useI18n();
  const [type, setType] = useState<"" | "in" | "out" | "adjust">("");
  const { data, size, setSize, isValidating } = useSWRInfinite<Page>(
    (i, prev) => (i > 0 && !prev?.nextCursor ? null : `/api/movements?limit=30${type ? `&type=${type}` : ""}${i > 0 ? `&cursor=${prev!.nextCursor}` : ""}`),
  );
  const rows = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;
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
          <ul className="divide-y divide-line">{rows.map((m) => <MovementRow key={m.id} m={m} />)}</ul>
        )}
      </section>
      {hasMore && <button className="btn-ghost mt-3 w-full" onClick={() => setSize(size + 1)} disabled={isValidating}>{isValidating ? <Spinner /> : t.loadMore}</button>}
    </div>
  );
}
