import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, integer, boolean, timestamp, bigserial, jsonb, pgEnum,
  index, uniqueIndex, check,
} from "drizzle-orm/pg-core";

export const employeeRole = pgEnum("employee_role", ["admin", "staff"]);
export const movementType = pgEnum("movement_type", ["in", "out", "adjust"]);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  username: text("username").notNull(),
  accessCodeHash: text("access_code_hash").notNull(),
  role: employeeRole("role").notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("employees_username_uq").on(sql`lower(${t.username})`)]);

export const sessions = pgTable("sessions", {
  // SHA-256 of the random cookie token; the raw token is never stored.
  id: text("id").primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => [
  index("sessions_employee_idx").on(t.employeeId),
  index("sessions_expires_idx").on(t.expiresAt),
]);

export const loginAttempts = pgTable("login_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ip: text("ip").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("login_attempts_ip_time_idx").on(t.ip, t.createdAt)]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  category: text("category").notNull().default(""),
  description: text("description"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("products_name_idx").on(t.name)]);

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  sku: text("sku").notNull(),
  barcode: text("barcode").notNull(),
  variantName: text("variant_name").notNull().default(""),
  color: text("color").notNull().default(""),
  size: text("size").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("variants_sku_uq").on(t.sku),
  uniqueIndex("variants_barcode_uq").on(t.barcode),
  index("variants_product_idx").on(t.productId),
  check("variants_quantity_nonneg", sql`${t.quantity} >= 0`),
  check("variants_threshold_nonneg", sql`${t.lowStockThreshold} >= 0`),
  check("variants_sku_format", sql`${t.sku} ~ '^[A-Z0-9][A-Z0-9-]{1,47}$'`),
  check("variants_barcode_ascii", sql`${t.barcode} ~ '^[\\x20-\\x7E]{1,48}$'`),
]);

export const stockMovements = pgTable("stock_movements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  sku: text("sku").notNull(),
  type: movementType("type").notNull(),
  // Signed change applied to stock (+ for in, - for out, either for adjust)
  quantity: integer("quantity").notNull(),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  note: text("note"),
  reason: text("reason"),
  // Client-generated idempotency key: retries of the same action never double-apply.
  requestId: uuid("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("movements_request_uq").on(t.requestId),
  index("movements_variant_time_idx").on(t.variantId, t.id),
  index("movements_time_idx").on(t.createdAt),
  check("movements_after_nonneg", sql`${t.quantityAfter} >= 0`),
  check("movements_math", sql`${t.quantityAfter} = ${t.quantityBefore} + ${t.quantity}`),
]);

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_time_idx").on(t.createdAt),
  index("audit_entity_idx").on(t.entityType, t.entityId),
]);
