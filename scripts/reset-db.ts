// DANGER: wipes the database in DATABASE_URL. Used only for test databases.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/db/schema";
import { seed } from "./seed";

const url = process.env.DATABASE_URL!;
if (!/_(test|e2e)\b/.test(url)) { console.error("refusing to reset a non-test database:", url); process.exit(1); }
async function main() {
const pool = new Pool({ connectionString: url });
await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await seed(drizzle(pool, { schema }), process.env.INITIAL_ACCESS_CODE ?? "trnfit19");
await pool.end();
console.log("✓ test database reset");
}
main().catch((e) => { console.error(e); process.exit(1); });
