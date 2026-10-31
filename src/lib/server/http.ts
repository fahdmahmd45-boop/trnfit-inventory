import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: Record<string, unknown>) {
    super(code);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim().slice(0, 64);
}

/** CSRF defence in depth (cookies are SameSite=Lax): mutating requests must come from our own origin. */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (no Origin) must at least send JSON, which a cross-site form cannot.
    if (!req.headers.get("content-type")?.includes("application/json")) throw new ApiError(403, "BAD_ORIGIN");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new ApiError(403, "BAD_ORIGIN");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "BAD_ORIGIN");
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, "INVALID_JSON"); }
  return schema.parse(raw);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler: origin check + uniform, non-leaky error responses. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Postgres error fields, unwrapping driver/ORM wrappers (Drizzle puts the pg error in `cause`). */
export function pgError(e: unknown): { code?: string; constraint?: string } {
  let cur = e as { code?: string; constraint?: string; cause?: unknown } | undefined;
  for (let i = 0; cur && i < 4; i++) {
    if (typeof cur.code === "string" && /^[0-9A-Z]{5}$/.test(cur.code)) return cur;
    cur = cur.cause as typeof cur;
  }
  return {};
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    const res = json({ error: e.code, ...e.details }, { status: e.status });
    if (e.status === 429 && e.details?.retryAfter) res.headers.set("Retry-After", String(e.details.retryAfter));
    return res;
  }
  if (e instanceof ZodError) {
    return json({ error: "VALIDATION", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const pg = pgError(e);
  if (pg.code === "23505") {
    const field = pg.constraint?.includes("sku") ? "sku" : pg.constraint?.includes("barcode") ? "barcode"
      : pg.constraint?.includes("username") ? "username" : "unknown";
    return json({ error: "DUPLICATE", field }, { status: 409 });
  }
  if (pg.code === "23514") return json({ error: "CONSTRAINT", constraint: pg.constraint }, { status: 409 });
  if (pg.code === "22P02") return json({ error: "BAD_ID" }, { status: 400 });
  console.error("[api] unexpected error", e);
  return json({ error: "SERVER_ERROR" }, { status: 500 });
}
