import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "./env";

loadEnv();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});
migrate(drizzle(pool), { migrationsFolder: "drizzle" })
  .then(() => console.log("✓ migrations applied"))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
