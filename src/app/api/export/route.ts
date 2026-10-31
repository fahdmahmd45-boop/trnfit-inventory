import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { listItems, listMovements } from "@/lib/server/inventory";
import { toCsv } from "@/lib/csv";

const query = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  dataset: z.enum(["inventory", "movements"]).default("inventory"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const q = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  let header: string[];
  let rows: (string | number)[][];
  if (q.dataset === "inventory") {
    const items = await listItems();
    header = ["Product", "Product (AR)", "Variant", "SKU", "Barcode", "Category", "Color", "Size",
      "Quantity", "Min stock", "Status", "Created", "Updated"];
    rows = items.map((i) => [i.name, i.nameAr ?? "", i.variantName, i.sku, i.barcode, i.category, i.color, i.size,
      i.quantity, i.lowStockThreshold, i.quantity === 0 ? "OUT" : i.quantity <= i.lowStockThreshold ? "LOW" : "OK",
      i.createdAt, i.updatedAt]);
  } else {
    const { items } = await listMovements({ limit: 5000, from: q.from, to: q.to });
    header = ["ID", "Date", "SKU", "Product", "Variant", "Type", "Change", "Before", "After", "Employee", "Reason", "Note"];
    rows = items.map((mv) => [mv.id, mv.createdAt, mv.sku, mv.productName, mv.variantName, mv.type, mv.quantity,
      mv.quantityBefore, mv.quantityAfter, mv.employeeName, mv.reason ?? "", mv.note ?? ""]);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `trnfit-${q.dataset}-${stamp}`;
  if (q.format === "csv") {
    return new Response(toCsv([header, ...rows]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TRN FIT";
  const ws = wb.addWorksheet(q.dataset === "inventory" ? "Inventory" : "Movements", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFF5F3F0" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A5728" } };
  ws.columns.forEach((c, i) => {
    const max = Math.max(header[i].length, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    c.width = Math.min(Math.max(max + 2, 8), 48);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
