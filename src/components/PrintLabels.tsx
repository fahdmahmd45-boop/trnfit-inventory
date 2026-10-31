"use client";
import { useEffect, useState } from "react";
import { fetcher } from "@/lib/api";
import { LABEL_SIZES } from "@/lib/barcode";
import { itemTitle } from "./ui";
import { useI18n } from "./I18n";
import type { Item } from "@/lib/types";

/** Print view: each label is an exact-size 600-DPI image; @page matches the label (or A4 sheet). */
export function PrintLabels() {
  const { lang } = useI18n();
  const [labels, setLabels] = useState<string[] | null>(null);
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const size = LABEL_SIZES.find((s) => s.id === params.get("size")) ?? LABEL_SIZES[0];
  const showName = params.get("name") !== "0";

  useEffect(() => {
    (async () => {
      const want = (params.get("ids") ?? "").split(",").filter(Boolean).map((x) => { const [id, n] = x.split(":"); return { id, n: Math.min(500, Math.max(1, +n || 1)) }; });
      const { items } = await fetcher<{ items: Item[] }>("/api/items");
      const b = await import("@/lib/barcode");
      const out: string[] = [];
      for (const w of want) {
        const it = items.find((i) => i.id === w.id);
        if (!it) continue;
        const url = await b.labelDataUrl(it, itemTitle(it, lang), size, showName);
        for (let i = 0; i < w.n; i++) out.push(url);
      }
      setLabels(out);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!labels?.length) return;
    const imgs = Array.from(document.images);
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = r))))).then(() => setTimeout(() => window.print(), 150));
  }, [labels]);

  const sheet = size.sheet;
  const css = sheet
    ? `@page { size: A4; margin: 0 } body { margin: 0 } .sheet { width: 210mm; display: grid; grid-template-columns: repeat(${sheet.cols}, ${size.w}mm); grid-auto-rows: ${size.h}mm; justify-content: center; padding-top: ${(sheet.pageH - sheet.rows * size.h) / 2}mm; } .sheet img:nth-child(${sheet.cols * sheet.rows}n) { break-after: page; }`
    : `@page { size: ${size.w}mm ${size.h}mm; margin: 0 } body { margin: 0 } .sheet img { display: block; break-after: page; }`;
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <style>{css + ` html,body{background:#fff!important} .sheet img{width:${size.w}mm;height:${size.h}mm} @media screen { .sheet { gap: 4mm; padding: 8mm } }`}</style>
      {!labels ? <p style={{ color: "#000", padding: 24 }}>…</p> : (
        <div className="sheet">{labels.map((u, i) => <img key={i} src={u} alt="" />)}</div>
      )}
    </div>
  );
}
