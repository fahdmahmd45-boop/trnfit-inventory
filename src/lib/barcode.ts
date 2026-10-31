"use client";
// Code 128 rendering for screen, PNG, SVG, PDF labels and print. bwip-js and pdf-lib are loaded lazily.
import type { Item } from "./types";

export type LabelSize = { id: string; w: number; h: number; sheet?: { cols: number; rows: number; pageW: number; pageH: number } };
export const LABEL_SIZES: LabelSize[] = [
  { id: "50x25", w: 50, h: 25 },
  { id: "40x30", w: 40, h: 30 },
  { id: "58x40", w: 58, h: 40 },
  { id: "100x50", w: 100, h: 50 },
  { id: "a4-3x8", w: 70, h: 37, sheet: { cols: 3, rows: 8, pageW: 210, pageH: 297 } },
];

const bwip = () => import("bwip-js/browser");
const DPI = 600;
const DPMM = DPI / 25.4;

/** Vector SVG of the barcode with human-readable text and a 10-module quiet zone on each side. */
export async function barcodeSvg(text: string): Promise<string> {
  const { toSVG } = await bwip();
  return toSVG({ bcid: "code128", text, scale: 3, height: 14, includetext: true, textxalign: "center", textsize: 10, paddingwidth: 10, paddingheight: 2, backgroundcolor: "FFFFFF" });
}

/** Number of modules (bars + spaces) of the symbol, excluding quiet zones. */
async function moduleCount(text: string): Promise<number> {
  const { toCanvas } = await bwip();
  const c = document.createElement("canvas");
  toCanvas(c, { bcid: "code128", text, scale: 1, height: 1, paddingwidth: 0, paddingheight: 0 });
  return c.width;
}

async function barCanvas(text: string, dotsPerModule: number, heightDots: number) {
  const { toCanvas } = await bwip();
  const c = document.createElement("canvas");
  // bwip height is in mm at 72dpi-based units (1 unit = 1/72 in * scale); use scaleY to hit exact dots.
  toCanvas(c, { bcid: "code128", text, scaleX: dotsPerModule, scaleY: 1, height: heightDots / 2.835, paddingwidth: 0, paddingheight: 0 });
  return c;
}

let fontReady: Promise<unknown> | null = null;
const ensureFont = () => (fontReady ??= Promise.all([
  document.fonts?.load('600 40px "IBM Plex Sans Arabic"', "TRN ابجد"),
  document.fonts?.load('500 40px "IBM Plex Sans Arabic"', "TRN"),
]).catch(() => {}));

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

/** Renders one label at 600 DPI: product name, Code 128 barcode (with quiet zones) and SKU. */
export async function renderLabel(item: Pick<Item, "sku" | "barcode">, title: string, size: LabelSize, opts: { showName?: boolean } = {}) {
  await ensureFont();
  const W = Math.round(size.w * DPMM), H = Math.round(size.h * DPMM);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  const margin = 1.5 * DPMM;
  const showName = opts.showName !== false;
  const nameH = showName ? Math.min(3.2, size.h * 0.13) * DPMM : 0;
  const skuH = Math.min(2.8, size.h * 0.11) * DPMM;
  const gap = 0.8 * DPMM;

  if (showName) {
    ctx.font = `600 ${Math.round(nameH)}px "IBM Plex Sans Arabic", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.direction = /[؀-ۿ]/.test(title) ? "rtl" : "ltr";
    ctx.fillText(fitText(ctx, title, W - 2 * margin), W / 2, margin);
  }

  // Integer dots per module → perfectly sharp bars at print resolution.
  const modules = await moduleCount(item.barcode);
  const quiet = 10; // Code 128 requires ≥ 10X quiet zone each side
  const avail = W - 2 * margin;
  const dpm = Math.max(1, Math.floor(avail / (modules + 2 * quiet)));
  const barTop = margin + nameH + (showName ? gap : 0);
  const barH = Math.max(H - barTop - skuH - gap - margin, 4 * DPMM);
  const bars = await barCanvas(item.barcode, dpm, barH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bars, Math.round((W - bars.width) / 2), Math.round(barTop), bars.width, Math.round(barH));

  ctx.font = `500 ${Math.round(skuH)}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.direction = "ltr";
  ctx.fillText(fitText(ctx, item.sku, W - 2 * margin), W / 2, H - margin);
  return c;
}

const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadPng(item: Item, title: string, size: LabelSize, showName = true) {
  download(await canvasBlob(await renderLabel(item, title, size, { showName })), `${item.sku}.png`);
}

export async function downloadSvg(item: Item) {
  download(new Blob([await barcodeSvg(item.barcode)], { type: "image/svg+xml" }), `${item.sku}.svg`);
}

/** Print-ready PDF: one label per page (roll printers) or an A4 sheet grid. */
export async function labelsPdf(entries: { item: Item; title: string; copies: number }[], size: LabelSize, showName = true): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle("TRN FIT labels"); pdf.setCreator("TRN FIT");
  const pt = (mm: number) => (mm * 72) / 25.4;
  const images = [];
  for (const e of entries) {
    const png = await pdf.embedPng(await (await canvasBlob(await renderLabel(e.item, e.title, size, { showName }))).arrayBuffer());
    for (let i = 0; i < e.copies; i++) images.push(png);
  }
  if (size.sheet) {
    const { cols, rows, pageW, pageH } = size.sheet;
    const offX = (pageW - cols * size.w) / 2, offY = (pageH - rows * size.h) / 2;
    for (let i = 0; i < images.length; i += cols * rows) {
      const page = pdf.addPage([pt(pageW), pt(pageH)]);
      images.slice(i, i + cols * rows).forEach((img, k) => {
        const col = k % cols, row = Math.floor(k / cols);
        page.drawImage(img, { x: pt(offX + col * size.w), y: pt(pageH - offY - (row + 1) * size.h), width: pt(size.w), height: pt(size.h) });
      });
    }
  } else {
    for (const img of images) {
      const page = pdf.addPage([pt(size.w), pt(size.h)]);
      page.drawImage(img, { x: 0, y: 0, width: pt(size.w), height: pt(size.h) });
    }
  }
  return new Blob([await pdf.save() as BlobPart], { type: "application/pdf" });
}

export async function labelDataUrl(item: Item, title: string, size: LabelSize, showName = true) {
  return (await renderLabel(item, title, size, { showName })).toDataURL("image/png");
}
