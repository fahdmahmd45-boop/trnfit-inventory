import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  applyMovement, createProduct, dashboardStats, generateSku, listItems, listMovements, lookupCode, updateVariant,
} from "@/lib/server/inventory";
import { login } from "@/lib/server/auth";
import { ApiError, errorResponse, pgError } from "@/lib/server/http";

const apiErr = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { const r = errorResponse(e); return { status: r.status, body: await r.json() }; }
  throw new Error("expected rejection");
};

let employeeId: string;
let blk: string; // TRN-WWRAP-BLK variant id

beforeAll(async () => {
  const r = await db.execute<{ id: string }>(sql`select id from employees where username = 'admin'`);
  employeeId = r.rows[0].id;
  blk = (await lookupCode("TRN-WWRAP-BLK"))!.id;
});
afterAll(async () => { await pool.end(); });

const move = (type: "in" | "out", quantity: number, variantId = blk, requestId = randomUUID()) =>
  applyMovement({ type, quantity, variantId, requestId }, employeeId);

describe("seed data", () => {
  it("creates the three TRN FIT SKUs with 0 stock and threshold 5", async () => {
    const items = await listItems();
    expect(items.map((i) => i.sku).sort()).toEqual(["TRN-LSTRAP-TAN", "TRN-WWRAP-BLK", "TRN-WWRAP-OLV"]);
    for (const i of items) { expect(i.quantity).toBe(0); expect(i.lowStockThreshold).toBe(5); expect(i.barcode).toBe(i.sku); }
  });
  it("looks up by barcode and (case-insensitive) SKU", async () => {
    expect((await lookupCode("TRN-LSTRAP-TAN"))?.variantName).toBe("Tan Leather");
    expect((await lookupCode("trn-wwrap-olv"))?.sku).toBe("TRN-WWRAP-OLV");
    expect(await lookupCode("NOPE")).toBeNull();
  });
});

describe("stock movements", () => {
  it("stock in / stock out update quantity and record before/after", async () => {
    const a = await move("in", 10);
    expect(a.item.quantity).toBe(10);
    expect(a.movement).toMatchObject({ type: "in", quantity: 10, quantityBefore: 0, quantityAfter: 10, sku: "TRN-WWRAP-BLK", employeeName: "TRN FIT Admin" });
    const b = await move("out", 3);
    expect(b.item.quantity).toBe(7);
    expect(b.movement).toMatchObject({ type: "out", quantity: -3, quantityBefore: 10, quantityAfter: 7 });
  });

  it("prevents negative inventory", async () => {
    await expect(move("out", 8)).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK", details: { available: 7 } });
    expect((await lookupCode("TRN-WWRAP-BLK"))!.quantity).toBe(7);
  });

  it("database CHECK constraint blocks negative stock even if app logic is bypassed", async () => {
    const e = await db.execute(sql`update product_variants set quantity = -1 where id = ${blk}`).catch((x) => x);
    expect(pgError(e).code).toBe("23514");
  });

  it("adjustments set the counted quantity and require a reason", async () => {
    const r = await applyMovement({ type: "adjust", quantity: 4, reason: "Physical count", variantId: blk, requestId: randomUUID() }, employeeId);
    expect(r.movement).toMatchObject({ type: "adjust", quantity: -3, quantityBefore: 7, quantityAfter: 4, reason: "Physical count" });
    const audit = await db.execute(sql`select count(*)::int as n from audit_logs where action = 'stock_adjust'`);
    expect(audit.rows[0].n).toBeGreaterThan(0);
  });

  it("is idempotent: retrying the same requestId never double-counts", async () => {
    const id = randomUUID();
    const first = await move("in", 5, blk, id);
    const retry = await move("in", 5, blk, id);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(retry.movement.id).toBe(first.movement.id);
    expect((await lookupCode("TRN-WWRAP-BLK"))!.quantity).toBe(9);
    // Same request fired concurrently
    const id2 = randomUUID();
    const res = await Promise.all(Array.from({ length: 8 }, () => move("in", 1, blk, id2)));
    expect(res.filter((r) => !r.duplicate)).toHaveLength(1);
    expect((await lookupCode("TRN-WWRAP-BLK"))!.quantity).toBe(10);
  });

  it("handles concurrent updates from many employees without lost updates", async () => {
    const olv = (await lookupCode("TRN-WWRAP-OLV"))!.id;
    await Promise.all(Array.from({ length: 40 }, () => move("in", 1, olv)));
    expect((await lookupCode("TRN-WWRAP-OLV"))!.quantity).toBe(40);
    // 60 concurrent stock-outs of 1 against 40 units: exactly 40 succeed, stock ends at 0, never negative.
    const results = await Promise.allSettled(Array.from({ length: 60 }, () => move("out", 1, olv)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(40);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof ApiError && r.reason.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect((await lookupCode("TRN-WWRAP-OLV"))!.quantity).toBe(0);
    // Ledger is consistent with stock.
    const sum = await db.execute(sql`select coalesce(sum(quantity),0)::int as s from stock_movements where variant_id = ${olv}`);
    expect(sum.rows[0].s).toBe(0);
  });

  it("paginates history with a keyset cursor", async () => {
    const p1 = await listMovements({ limit: 5 });
    expect(p1.items).toHaveLength(5);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listMovements({ limit: 5, cursor: p1.nextCursor! });
    expect(p2.items[0].id).toBeLessThan(p1.items[4].id);
    const own = await listMovements({ variantId: blk, limit: 100 });
    expect(own.items.every((m) => m.variantId === blk)).toBe(true);
  });

  it("dashboard stats come from the database", async () => {
    const s = await dashboardStats();
    expect(s.skus).toBe(3);
    expect(s.products).toBe(2);
    expect(s.units).toBe(10);
    expect(s.outOfStock).toBe(2);
    expect(s.movementsToday).toBeGreaterThan(0);
  });
});

describe("products", () => {
  it("creates a product with generated unique SKUs and opening stock", async () => {
    const r = await createProduct({ name: "Wrist Wraps", category: "Wrist Wraps", variants: [
      { variantName: "Black", color: "", size: "", lowStockThreshold: 5, initialQuantity: 3 },
    ] }, employeeId);
    const item = (await listItems()).find((i) => i.id === r.variantIds[0])!;
    expect(item.sku).toBe("TRN-WWRAP-BLK-2"); // base taken → suffixed
    expect(item.barcode).toBe(item.sku);
    expect(item.quantity).toBe(3);
    expect(await generateSku("Wrist Wraps", "Black")).toBe("TRN-WWRAP-BLK-3");
  });

  it("rejects duplicate SKUs and barcodes with a 409 (and no partial product)", async () => {
    const before = (await listItems()).length;
    expect(await apiErr(createProduct({ name: "Dup", category: "", variants: [
      { sku: "TRN-WWRAP-OLV", variantName: "", color: "", size: "", lowStockThreshold: 5, initialQuantity: 0 },
    ] }, employeeId))).toEqual({ status: 409, body: { error: "DUPLICATE", field: "sku" } });
    expect(await apiErr(createProduct({ name: "Dup", category: "", variants: [
      { sku: "TRN-NEW-ONE", barcode: "TRN-WWRAP-OLV", variantName: "", color: "", size: "", lowStockThreshold: 5, initialQuantity: 0 },
    ] }, employeeId))).toEqual({ status: 409, body: { error: "DUPLICATE", field: "barcode" } });
    expect(await apiErr(updateVariant(blk, { barcode: "TRN-LSTRAP-TAN" }, employeeId))).toEqual({ status: 409, body: { error: "DUPLICATE", field: "barcode" } });
    const orphans = await db.execute(sql`select count(*)::int n from products p where not exists (select 1 from product_variants v where v.product_id = p.id)`);
    expect(orphans.rows[0].n).toBe(0);
    expect((await listItems()).length).toBe(before);
  });

  it("edits product variant details and threshold", async () => {
    const it2 = await updateVariant(blk, { lowStockThreshold: 12, size: "60cm" }, employeeId);
    expect(it2).toMatchObject({ lowStockThreshold: 12, size: "60cm", quantity: 10 });
    expect((await listItems(undefined, "low")).some((i) => i.id === blk)).toBe(true);
  });
});

describe("login", () => {
  it("accepts the initial access code and rejects wrong codes", async () => {
    const ok = await login("trnfit19", "10.0.0.1", "vitest");
    expect(ok.user.username).toBe("admin");
    expect(ok.token.length).toBeGreaterThan(30);
    const stored = await db.execute(sql`select id from sessions`);
    expect(stored.rows.some((r) => r.id === ok.token)).toBe(false); // only the hash is stored
    await expect(login("wrong", "10.0.0.1", "vitest")).rejects.toMatchObject({ status: 401 });
  });
  it("rate limits repeated failures per IP", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 8; i++) await expect(login("bad" + i, ip, null)).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(login("trnfit19", ip, null)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // Other IPs are unaffected.
    await expect(login("trnfit19", "10.9.9.10", null)).resolves.toBeTruthy();
  });
});
