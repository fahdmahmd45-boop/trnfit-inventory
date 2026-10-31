import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __trnPool: Pool | undefined;
}

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const needsSsl = process.env.DATABASE_SSL === "require";
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 8_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

// Reuse a single pool per server instance (also across Next.js dev hot reloads).
export const pool: Pool = globalThis.__trnPool ?? (globalThis.__trnPool = createPool());
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
