import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);

export const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,47}$/;
// Printable ASCII only: fully encodable in Code 128 (sets A/B) and safe to type on any keyboard.
export const BARCODE_RE = /^[\x20-\x7E]{1,48}$/;

export const skuSchema = z.string().trim().toUpperCase()
  .regex(SKU_RE, "SKU: A–Z, 0–9 and '-' only (2–48 chars)");
export const barcodeSchema = z.string().trim().regex(BARCODE_RE, "Barcode: printable ASCII, 1–48 chars");

export const MAX_QTY = 1_000_000;
const qty = z.number().int().min(0).max(MAX_QTY);

export const variantInput = z.object({
  sku: skuSchema.optional(),          // generated when missing
  barcode: barcodeSchema.optional(),  // defaults to SKU
  variantName: trimmed(80).default(""),
  color: trimmed(60).default(""),
  size: trimmed(40).default(""),
  lowStockThreshold: qty.default(5),
  initialQuantity: qty.default(0),
});

export const productCreate = z.object({
  name: trimmed(120).min(2),
  nameAr: trimmed(120).optional().nullable(),
  category: trimmed(60).default(""),
  description: trimmed(1000).optional().nullable(),
  variants: z.array(variantInput).min(1).max(50),
});

export const productUpdate = z.object({
  name: trimmed(120).min(2).optional(),
  nameAr: trimmed(120).nullable().optional(),
  category: trimmed(60).optional(),
  description: trimmed(1000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const variantUpdate = z.object({
  sku: skuSchema.optional(),
  barcode: barcodeSchema.optional(),
  variantName: trimmed(80).optional(),
  color: trimmed(60).optional(),
  size: trimmed(40).optional(),
  lowStockThreshold: qty.optional(),
  archived: z.boolean().optional(),
});

export const movementInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("in"), variantId: z.string().uuid(), requestId: z.string().uuid(),
    quantity: z.number().int().min(1).max(MAX_QTY), note: trimmed(500).optional().nullable(),
  }),
  z.object({
    type: z.literal("out"), variantId: z.string().uuid(), requestId: z.string().uuid(),
    quantity: z.number().int().min(1).max(MAX_QTY), note: trimmed(500).optional().nullable(),
  }),
  z.object({
    // For adjustments `quantity` is the new counted stock level (absolute).
    type: z.literal("adjust"), variantId: z.string().uuid(), requestId: z.string().uuid(),
    quantity: qty, reason: trimmed(300).min(3), note: trimmed(500).optional().nullable(),
  }),
]);
export type MovementInput = z.infer<typeof movementInput>;

export const loginInput = z.object({
  code: z.string().min(1).max(128),
  username: trimmed(60).optional(),
});

export const employeeCreate = z.object({
  name: trimmed(80).min(2),
  username: trimmed(40).toLowerCase().regex(/^[a-z0-9._-]{2,40}$/),
  code: z.string().min(6).max(128),
  role: z.enum(["admin", "staff"]).default("staff"),
});
export const employeeUpdate = z.object({
  name: trimmed(80).min(2).optional(),
  active: z.boolean().optional(),
  role: z.enum(["admin", "staff"]).optional(),
  code: z.string().min(6).max(128).optional(),
});
export const changeCodeInput = z.object({
  currentCode: z.string().min(1).max(128),
  newCode: z.string().min(6).max(128),
});
