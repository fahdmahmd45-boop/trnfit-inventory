import "server-only";
import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Item, Movement, DashboardStats, MovementResult } from "@/lib/types";
import type { MovementInput } from "@/lib/validation";
import { z } from "zod";
import { productCreate, productUpdate, variantUpdate, variantInput } from "@/lib/validation";
import { suggestSkuBase } from "@/lib/sku";
import { ApiError, pgError } from "./http";
import { audit } from "./audit";

const v = schema.productVariants;
const p = schema.products;
const m = schema.stockMovements;
const e = schema.employees;

const itemFields = {
  id: v.id, productId: v.productId, name: p.name, nameAr: p.nameAr, category: p.category,
  sku: v.sku, barcode: v.barcode, variantName: v.variantName, color: v.color, size: v.size,
  quantity: v.quantity, lowStockThreshold: v.lowStockThreshold, createdAt: v.createdAt, updatedAt: v.updatedAt,
};

type Row = Omit<Item, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };
const toItem = (r: Row): Item => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });

export type ItemFilter = "all" | "low" | "out";

export async function listItems(q?: string, filter: ItemFilter = "all"): Promise<Item[]> {
  const conds: (SQL | undefined)[] = [eq(v.archived, false), eq(p.archived, false)];
  if (q?.trim()) {
    const like = `%${q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    conds.push(or(ilike(p.name, like), ilike(p.nameAr, like), ilike(v.sku, like), ilike(v.barcode, like),
      ilike(v.variantName, like), ilike(v.color, like), ilike(p.category, like)));
  }
  if (filter === "low") conds.push(sql`${v.quantity} > 0 and ${v.quantity} <= ${v.lowStockThreshold}`);
  if (filter === "out") conds.push(eq(v.quantity, 0));
  const rows = await db.select(itemFields).from(v).innerJoin(p, eq(p.id, v.productId))
    .where(and(...conds)).orderBy(p.name, v.variantName).limit(1000);
  return rows.map(toItem);
}

export async function getItem(id: string): Promise<Item | null> {
  const [r] = await db.select(itemFields).from(v).innerJoin(p, eq(p.id, v.productId)).where(eq(v.id, id)).limit(1);
  return r ? toItem(r) : null;
}

/** Exact match on barcode, falling back to SKU (case-insensitive). Uses the unique indexes. */
export async function lookupCode(code: string): Promise<Item | null> {
  const c = code.trim();
  if (!c || c.length > 64) return null;
  const [r] = await db.select(itemFields).from(v).innerJoin(p, eq(p.id, v.productId))
    .where(and(eq(v.archived, false), or(eq(v.barcode, c), eq(v.sku, c.toUpperCase()))))
    .orderBy(sql`${v.barcode} = ${c} desc`).limit(1);
  return r ? toItem(r) : null;
}

export async function dashboardStats(): Promise<DashboardStats> {
  const [s] = await db.select({
    skus: sql<number>`count(*)::int`,
    products: sql<number>`count(distinct ${v.productId})::int`,
    units: sql<number>`coalesce(sum(${v.quantity}),0)::int`,
    lowStock: sql<number>`count(*) filter (where ${v.quantity} > 0 and ${v.quantity} <= ${v.lowStockThreshold})::int`,
    outOfStock: sql<number>`count(*) filter (where ${v.quantity} = 0)::int`,
  }).from(v).innerJoin(p, eq(p.id, v.productId)).where(and(eq(v.archived, false), eq(p.archived, false)));
  // "Today" in Saudi time (Asia/Riyadh, UTC+3).
  const [t] = await db.select({
    movementsToday: sql<number>`count(*)::int`,
    unitsInToday: sql<number>`coalesce(sum(${m.quantity}) filter (where ${m.type} = 'in'),0)::int`,
    unitsOutToday: sql<number>`coalesce(-sum(${m.quantity}) filter (where ${m.type} = 'out'),0)::int`,
  }).from(m).where(sql`${m.createdAt} >= (date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh')`);
  return { ...s, ...t };
}

const movementFields = {
  id: m.id, variantId: m.variantId, sku: m.sku, type: m.type, quantity: m.quantity,
  quantityBefore: m.quantityBefore, quantityAfter: m.quantityAfter, note: m.note, reason: m.reason,
  employeeName: e.name, productName: p.name, variantName: v.variantName, createdAt: m.createdAt,
};
type MRow = Omit<Movement, "createdAt"> & { createdAt: Date };
const toMovement = (r: MRow): Movement => ({ ...r, createdAt: r.createdAt.toISOString() });

/** Keyset-paginated movement history (newest first). */
export async function listMovements(opts: {
  variantId?: string; type?: "in" | "out" | "adjust"; cursor?: number; limit?: number; from?: Date; to?: Date;
}): Promise<{ items: Movement[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 5000);
  const rows = await db.select(movementFields).from(m)
    .innerJoin(v, eq(v.id, m.variantId)).innerJoin(p, eq(p.id, v.productId)).innerJoin(e, eq(e.id, m.employeeId))
    .where(and(
      opts.variantId ? eq(m.variantId, opts.variantId) : undefined,
      opts.type ? eq(m.type, opts.type) : undefined,
      opts.cursor ? lt(m.id, opts.cursor) : undefined,
      opts.from ? sql`${m.createdAt} >= ${opts.from}` : undefined,
      opts.to ? sql`${m.createdAt} < ${opts.to}` : undefined,
    ))
    .orderBy(desc(m.id)).limit(limit + 1);
  const more = rows.length > limit;
  const items = rows.slice(0, limit).map(toMovement);
  return { items, nextCursor: more ? items[items.length - 1].id : null };
}

async function movementById(id: number) {
  const [r] = await db.select(movementFields).from(m)
    .innerJoin(v, eq(v.id, m.variantId)).innerJoin(p, eq(p.id, v.productId)).innerJoin(e, eq(e.id, m.employeeId))
    .where(eq(m.id, id)).limit(1);
  return toMovement(r);
}

async function existingByRequest(requestId: string): Promise<MovementResult | null> {
  const [r] = await db.select({ id: m.id, variantId: m.variantId }).from(m).where(eq(m.requestId, requestId)).limit(1);
  if (!r) return null;
  return { movement: await movementById(r.id), item: (await getItem(r.variantId))!, duplicate: true };
}

/**
 * Applies a stock movement atomically:
 *  - row lock (SELECT … FOR UPDATE) serialises concurrent updates to the same SKU,
 *  - negative stock is rejected (and also prevented by a CHECK constraint),
 *  - the request_id unique index makes retries idempotent (no duplicate transactions).
 */
export async function applyMovement(input: MovementInput, employeeId: string, ip?: string): Promise<MovementResult> {
  const dup = await existingByRequest(input.requestId);
  if (dup) return dup;
  try {
    const movementId = await db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string; sku: string; quantity: number; archived: boolean }>(
        sql`select id, sku, quantity, archived from product_variants where id = ${input.variantId} for update`);
      const row = locked.rows[0];
      if (!row || row.archived) throw new ApiError(404, "NOT_FOUND");
      const before = row.quantity;
      const delta = input.type === "in" ? input.quantity : input.type === "out" ? -input.quantity : input.quantity - before;
      const after = before + delta;
      if (after < 0) throw new ApiError(409, "INSUFFICIENT_STOCK", { available: before });
      await tx.update(v).set({ quantity: after, updatedAt: new Date() }).where(eq(v.id, input.variantId));
      const [ins] = await tx.insert(m).values({
        variantId: input.variantId, sku: row.sku, type: input.type, quantity: delta,
        quantityBefore: before, quantityAfter: after, employeeId,
        note: input.note || null, reason: input.type === "adjust" ? input.reason : null, requestId: input.requestId,
      }).returning({ id: m.id });
      if (input.type === "adjust") {
        await audit(tx, employeeId, "stock_adjust", "variant", input.variantId, { before, after, reason: input.reason }, ip);
      }
      return ins.id;
    });
    return { movement: await movementById(movementId), item: (await getItem(input.variantId))!, duplicate: false };
  } catch (err) {
    const pg = pgError(err);
    if (pg.code === "23505" && pg.constraint === "movements_request_uq") {
      const again = await existingByRequest(input.requestId);
      if (again) return again;
    }
    throw err;
  }
}

/** Generates a unique SKU like TRN-WWRAP-BLK, appending -2, -3… on collision. */
export async function generateSku(name: string, variant: string, exclude: string[] = []): Promise<string> {
  const base = suggestSkuBase(name, variant);
  const taken = new Set(
    (await db.select({ sku: v.sku }).from(v).where(sql`${v.sku} = ${base} or ${v.sku} like ${base + "-%"}`))
      .map((r) => r.sku).concat(exclude),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  throw new ApiError(409, "SKU_EXHAUSTED");
}

export async function createProduct(input: z.infer<typeof productCreate>, employeeId: string, ip?: string) {
  const skus: string[] = [];
  const variants: (z.infer<typeof variantInput> & { sku: string; barcode: string })[] = [];
  for (const vi of input.variants) {
    const sku = vi.sku ?? (await generateSku(input.name, vi.variantName || vi.color, skus));
    skus.push(sku);
    variants.push({ ...vi, sku, barcode: vi.barcode ?? sku });
  }
  const dupSku = skus.find((s, i) => skus.indexOf(s) !== i);
  if (dupSku) throw new ApiError(409, "DUPLICATE", { field: "sku", value: dupSku });
  const codes = variants.map((x) => x.barcode);
  if (new Set(codes).size !== codes.length) throw new ApiError(409, "DUPLICATE", { field: "barcode" });

  return db.transaction(async (tx) => {
    const [prod] = await tx.insert(p).values({
      name: input.name, nameAr: input.nameAr || null, category: input.category, description: input.description || null,
    }).returning({ id: p.id });
    const ids: string[] = [];
    for (const vi of variants) {
      const [row] = await tx.insert(v).values({
        productId: prod.id, sku: vi.sku, barcode: vi.barcode, variantName: vi.variantName, color: vi.color,
        size: vi.size, lowStockThreshold: vi.lowStockThreshold, quantity: vi.initialQuantity,
      }).returning({ id: v.id });
      ids.push(row.id);
      if (vi.initialQuantity > 0) {
        await tx.insert(m).values({
          variantId: row.id, sku: vi.sku, type: "in", quantity: vi.initialQuantity, quantityBefore: 0,
          quantityAfter: vi.initialQuantity, employeeId, note: "Initial stock", requestId: crypto.randomUUID(),
        });
      }
    }
    await audit(tx, employeeId, "product_create", "product", prod.id, { name: input.name, skus }, ip);
    return { productId: prod.id, variantIds: ids };
  });
}

export async function addVariant(productId: string, input: z.infer<typeof variantInput>, employeeId: string, ip?: string) {
  const [prod] = await db.select({ name: p.name }).from(p).where(eq(p.id, productId)).limit(1);
  if (!prod) throw new ApiError(404, "NOT_FOUND");
  const sku = input.sku ?? (await generateSku(prod.name, input.variantName || input.color));
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(v).values({
      productId, sku, barcode: input.barcode ?? sku, variantName: input.variantName, color: input.color,
      size: input.size, lowStockThreshold: input.lowStockThreshold, quantity: input.initialQuantity,
    }).returning({ id: v.id });
    if (input.initialQuantity > 0) {
      await tx.insert(m).values({
        variantId: row.id, sku, type: "in", quantity: input.initialQuantity, quantityBefore: 0,
        quantityAfter: input.initialQuantity, employeeId, note: "Initial stock", requestId: crypto.randomUUID(),
      });
    }
    await audit(tx, employeeId, "variant_create", "variant", row.id, { sku }, ip);
    return { variantId: row.id };
  });
}

export async function updateProduct(id: string, input: z.infer<typeof productUpdate>, employeeId: string, ip?: string) {
  const r = await db.update(p).set({ ...input, updatedAt: new Date() }).where(eq(p.id, id)).returning({ id: p.id });
  if (!r.length) throw new ApiError(404, "NOT_FOUND");
  await audit(db, employeeId, "product_update", "product", id, input, ip);
}

export async function updateVariant(id: string, input: z.infer<typeof variantUpdate>, employeeId: string, ip?: string) {
  // Note: quantity can never be edited here — only through stock movements.
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ sku: v.sku, barcode: v.barcode }).from(v).where(eq(v.id, id)).for("update");
    if (!before) throw new ApiError(404, "NOT_FOUND");
    await tx.update(v).set({ ...input, updatedAt: new Date() }).where(eq(v.id, id));
    // History rows keep the SKU as it was at movement time; renames are recorded in the audit log.
    await audit(tx, employeeId, "variant_update", "variant", id, { before, changes: input }, ip);
  });
  return getItem(id);
}
