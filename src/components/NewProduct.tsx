"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { useI18n } from "./I18n";
import { useToast } from "./Toast";
import { PageHeader, Spinner, errorText } from "./ui";
import { api } from "@/lib/api";

type V = { variantName: string; color: string; size: string; sku: string; barcode: string; lowStockThreshold: number; initialQuantity: number };
const emptyV = (barcode = ""): V => ({ variantName: "", color: "", size: "", sku: "", barcode, lowStockThreshold: 5, initialQuantity: 0 });

export function NewProduct() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const productId = sp.get("product");
  const [p, setP] = useState({ name: sp.get("name") ?? "", nameAr: "", category: "", description: "" });
  const [vs, setVs] = useState<V[]>([emptyV(sp.get("barcode") ?? "")]);
  const [busy, setBusy] = useState(false);

  const setV = (i: number, patch: Partial<V>) => setVs((l) => l.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const gen = async (i: number) => {
    try {
      const r = await api<{ sku: string }>(`/api/sku?name=${encodeURIComponent(p.name)}&variant=${encodeURIComponent(vs[i].variantName || vs[i].color)}`);
      const taken = vs.filter((_, k) => k !== i).map((v) => v.sku);
      let sku = r.sku, n = 2;
      while (taken.includes(sku)) sku = `${r.sku}-${n++}`;
      setV(i, { sku });
    } catch (e) { toast("error", errorText(t, e)); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const clean = (v: V) => ({ ...v, sku: v.sku.trim() || undefined, barcode: v.barcode.trim() || undefined });
    try {
      if (productId) {
        const r = await api<{ variantId: string }>(`/api/products/${productId}/variants`, { body: clean(vs[0]) });
        mutate((k) => typeof k === "string" && (k.startsWith("/api/items") || k.startsWith("/api/dashboard")));
        router.push(`/items/${r.variantId}`);
      } else {
        const r = await api<{ variantIds: string[] }>("/api/products", { body: { ...p, nameAr: p.nameAr || null, description: p.description || null, variants: vs.map(clean) } });
        mutate((k) => typeof k === "string" && (k.startsWith("/api/items") || k.startsWith("/api/dashboard")));
        router.push(r.variantIds.length === 1 ? `/items/${r.variantIds[0]}` : "/items");
      }
      toast("success", t.saved);
    } catch (err) { toast("error", errorText(t, err)); setBusy(false); }
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={productId ? `${t.addVariant} — ${p.name}` : t.addProduct} />
      {!productId && (
        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <div><label className="label">{t.productName} *</label><input className="input" dir="ltr" required minLength={2} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} data-testid="np-name" /></div>
          <div><label className="label">{t.productNameAr}</label><input className="input" dir="rtl" value={p.nameAr} onChange={(e) => setP({ ...p, nameAr: e.target.value })} /></div>
          <div><label className="label">{t.category}</label><input className="input" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} /></div>
          <div><label className="label">{t.description}</label><input className="input" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></div>
        </section>
      )}
      {vs.map((v, i) => (
        <section key={i} className="card grid gap-3 p-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <h2 className="font-bold">{t.variant} {vs.length > 1 ? i + 1 : ""}</h2>
            {vs.length > 1 && <button type="button" onClick={() => setVs((l) => l.filter((_, k) => k !== i))} className="btn-ghost h-9 text-sm text-danger"><Trash2 className="size-4" />{t.removeVariant}</button>}
          </div>
          <div><label className="label">{t.variant}</label><input className="input" value={v.variantName} onChange={(e) => setV(i, { variantName: e.target.value })} data-testid={`nv-variant-${i}`} /></div>
          <div><label className="label">{t.color}</label><input className="input" value={v.color} onChange={(e) => setV(i, { color: e.target.value })} /></div>
          <div><label className="label">{t.size}</label><input className="input" value={v.size} onChange={(e) => setV(i, { size: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <label className="label">{t.sku} <span className="text-xs">({t.skuAuto})</span></label>
            <div className="flex gap-2">
              <input className="input font-mono uppercase" dir="ltr" value={v.sku} onChange={(e) => setV(i, { sku: e.target.value.toUpperCase() })} pattern="[A-Z0-9][A-Z0-9\-]{1,47}" data-testid={`nv-sku-${i}`} />
              <button type="button" className="btn-ghost shrink-0" onClick={() => gen(i)} disabled={!p.name} data-testid={`nv-gen-${i}`}><Wand2 className="size-4" />{t.generate}</button>
            </div>
          </div>
          <div><label className="label">{t.barcode} <span className="text-xs">({t.barcodeSameAsSku})</span></label><input className="input font-mono" dir="ltr" value={v.barcode} onChange={(e) => setV(i, { barcode: e.target.value })} /></div>
          <div><label className="label">{t.minStock}</label><input className="input" type="number" min={0} inputMode="numeric" value={v.lowStockThreshold} onChange={(e) => setV(i, { lowStockThreshold: parseInt(e.target.value || "0", 10) })} /></div>
          <div><label className="label">{t.initialQty}</label><input className="input" type="number" min={0} inputMode="numeric" value={v.initialQuantity} onChange={(e) => setV(i, { initialQuantity: parseInt(e.target.value || "0", 10) })} data-testid={`nv-qty-${i}`} /></div>
        </section>
      ))}
      <div className="flex flex-wrap gap-2">
        {!productId && <button type="button" className="btn-ghost" onClick={() => setVs((l) => [...l, emptyV()])}><Plus className="size-4" />{t.addVariant}</button>}
        <button className="btn-primary ms-auto min-w-40" disabled={busy} data-testid="np-save">{busy ? <Spinner /> : t.save}</button>
      </div>
    </form>
  );
}
