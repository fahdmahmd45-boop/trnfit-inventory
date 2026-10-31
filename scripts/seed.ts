import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { loadEnv } from "./env";
import * as schema from "../src/db/schema";
import { hashSecret } from "../src/lib/password";

loadEnv();

export const SEED_PRODUCTS = [
  {
    name: "Cowhide Leather Lifting Straps", nameAr: "أحزمة رفع جلد بقري", category: "Lifting Straps",
    variants: [{ sku: "TRN-LSTRAP-TAN", barcode: "TRN-LSTRAP-TAN", variantName: "Tan Leather", color: "Tan" }],
  },
  {
    name: "Wrist Wraps", nameAr: "رباط المعصم", category: "Wrist Wraps",
    variants: [
      { sku: "TRN-WWRAP-BLK", barcode: "TRN-WWRAP-BLK", variantName: "Black", color: "Black" },
      { sku: "TRN-WWRAP-OLV", barcode: "TRN-WWRAP-OLV", variantName: "Olive Green", color: "Olive Green" },
    ],
  },
];

export async function seed(db: ReturnType<typeof drizzle<typeof schema>>, accessCode: string | undefined) {
  // 1) First admin employee (only if no employees exist yet).
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.employees);
  if (count === 0) {
    if (!accessCode) throw new Error("INITIAL_ACCESS_CODE must be set to create the first employee");
    await db.insert(schema.employees).values({
      name: "TRN FIT Admin", username: "admin", role: "admin", accessCodeHash: await hashSecret(accessCode),
    });
    console.log("✓ created admin employee (access code from INITIAL_ACCESS_CODE)");
  }

  // 2) Initial products — idempotent on SKU.
  for (const p of SEED_PRODUCTS) {
    const existing = await db.select({ productId: schema.productVariants.productId })
      .from(schema.productVariants)
      .where(sql`${schema.productVariants.sku} = ${p.variants[0].sku}`).limit(1);
    let productId = existing[0]?.productId;
    if (!productId) {
      [{ id: productId }] = await db.insert(schema.products)
        .values({ name: p.name, nameAr: p.nameAr, category: p.category })
        .returning({ id: schema.products.id });
    }
    for (const v of p.variants) {
      const r = await db.insert(schema.productVariants)
        .values({ ...v, productId, quantity: 0, lowStockThreshold: 5 })
        .onConflictDoNothing().returning({ id: schema.productVariants.id });
      if (r.length) console.log(`✓ product ${v.sku}`);
    }
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
  seed(drizzle(pool, { schema }), process.env.INITIAL_ACCESS_CODE)
    .then(() => console.log("✓ seed complete"))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
