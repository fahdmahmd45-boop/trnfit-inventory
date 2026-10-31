import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { route, json, parseBody, ApiError, clientIp } from "@/lib/server/http";
import { requireAdmin, verifyLogin } from "@/lib/server/auth";
import { hashSecret } from "@/lib/password";
import { employeeUpdate } from "@/lib/validation";
import { audit } from "@/lib/server/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const id = z.string().uuid().parse((await params).id);
  const body = await parseBody(req, employeeUpdate);
  if (id === admin.id && (body.active === false || body.role === "staff")) throw new ApiError(400, "CANNOT_DEMOTE_SELF");
  const patch: Partial<typeof schema.employees.$inferInsert> = { updatedAt: new Date() };
  if (body.name) patch.name = body.name;
  if (body.role) patch.role = body.role;
  if (body.active !== undefined) patch.active = body.active;
  if (body.code) {
    const clash = await verifyLogin(body.code);
    if (clash && clash.id !== id) throw new ApiError(409, "CODE_IN_USE");
    patch.accessCodeHash = await hashSecret(body.code);
  }
  const r = await db.update(schema.employees).set(patch).where(eq(schema.employees.id, id)).returning({ id: schema.employees.id });
  if (!r.length) throw new ApiError(404, "NOT_FOUND");
  if (body.active === false || body.code) await db.delete(schema.sessions).where(eq(schema.sessions.employeeId, id));
  await audit(db, admin.id, "employee_update", "employee", id, { ...body, code: body.code ? "***" : undefined }, clientIp(req));
  return json({ ok: true });
});
