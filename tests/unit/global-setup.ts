import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../../src/db/schema";
import { seed } from "../../scripts/seed";

// Fresh schema for every test run: migrations + seed exactly as in production.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://trnfit:trnfit@localhost:5432/trnfit_test";
  const pool = new Pool({ connectionString: url });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await seed(drizzle(pool, { schema }), "trnfit19");
  await pool.end();
}
