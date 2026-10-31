import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256, verifySecret } from "@/lib/password";
import { ApiError } from "./http";
import { audit } from "./audit";

export const SESSION_COOKIE = "trn_session";
const TTL_MS = Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600_000;
const TOUCH_AFTER_MS = 10 * 60_000;

// Login rate limits (stored in Postgres so they hold across serverless instances).
const WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_GLOBAL_PER_MIN = 60;

export type SessionUser = { id: string; name: string; username: string; role: "admin" | "staff" };

export async function checkLoginRateLimit(ip: string) {
  const [r] = await db.select({
    ipFails: sql<number>`count(*) filter (where ${schema.loginAttempts.ip} = ${ip} and not ${schema.loginAttempts.success})::int`,
    globalFails: sql<number>`count(*) filter (where not ${schema.loginAttempts.success} and ${schema.loginAttempts.createdAt} > now() - interval '1 minute')::int`,
  }).from(schema.loginAttempts)
    .where(gt(schema.loginAttempts.createdAt, sql`now() - make_interval(mins => ${WINDOW_MIN})`));
  if (r.ipFails >= MAX_FAILS_PER_IP) throw new ApiError(429, "RATE_LIMITED", { retryAfter: WINDOW_MIN * 60 });
  if (r.globalFails >= MAX_FAILS_GLOBAL_PER_MIN) throw new ApiError(429, "RATE_LIMITED", { retryAfter: 60 });
}

/** Verifies an access code against active employees. Returns the matching employee or null. */
export async function verifyLogin(code: string, username?: string) {
  const rows = await db.select({
    id: schema.employees.id, name: schema.employees.name, username: schema.employees.username,
    role: schema.employees.role, hash: schema.employees.accessCodeHash,
  }).from(schema.employees).where(and(
    eq(schema.employees.active, true),
    username ? sql`lower(${schema.employees.username}) = lower(${username})` : undefined,
  )).limit(200);
  // Verify every candidate (constant work regardless of which one matches).
  const results = await Promise.all(rows.map((r) => verifySecret(code, r.hash)));
  const idx = results.indexOf(true);
  return idx >= 0 ? rows[idx] : null;
}

export async function login(code: string, ip: string, userAgent: string | null, username?: string) {
  await checkLoginRateLimit(ip);
  const emp = await verifyLogin(code, username);
  await db.insert(schema.loginAttempts).values({ ip, success: !!emp });
  if (!emp) {
    await audit(db, null, "login_failed", "employee", null, { username: username ?? null }, ip);
    throw new ApiError(401, "INVALID_CODE");
  }
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(schema.sessions).values({
    id: sha256(token), employeeId: emp.id, expiresAt, ip, userAgent: userAgent?.slice(0, 300) ?? null,
  });
  await db.update(schema.employees).set({ lastLoginAt: new Date() }).where(eq(schema.employees.id, emp.id));
  await audit(db, emp.id, "login", "employee", emp.id, undefined, ip);
  // Opportunistic housekeeping.
  if (Math.random() < 0.1) {
    await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
    await db.delete(schema.loginAttempts).where(lt(schema.loginAttempts.createdAt, sql`now() - interval '2 days'`));
  }
  return { token, expiresAt, user: { id: emp.id, name: emp.name, username: emp.username, role: emp.role } };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const [row] = await db.select({
    id: schema.employees.id, name: schema.employees.name, username: schema.employees.username,
    role: schema.employees.role, lastSeenAt: schema.sessions.lastSeenAt,
  }).from(schema.sessions)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.sessions.employeeId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date()), eq(schema.employees.active, true)))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    // Sliding expiration, throttled to one write per 10 minutes per session.
    await db.update(schema.sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) })
      .where(eq(schema.sessions.id, id));
  }
  return { id: row.id, name: row.name, username: row.username, role: row.role };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new ApiError(401, "UNAUTHENTICATED");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new ApiError(403, "FORBIDDEN");
  return u;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}
