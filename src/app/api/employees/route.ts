import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { route, json, parseBody, ApiError, clientIp } from "@/lib/server/http";
import { requireAdmin, verifyLogin } from "@/lib/server/auth";
import { hashSecret } from "@/lib/password";
import { employeeCreate } from "@/lib/validation";
import { audit } from "@/lib/server/audit";

const fields = {
  id: schema.employees.id, name: schema.employees.name, username: schema.employees.username,
  role: schema.employees.role, active: schema.employees.active, lastLoginAt: schema.employees.lastLoginAt,
  createdAt: schema.employees.createdAt,
};

export const GET = route(async () => {
  await requireAdmin();
  return json({ employees: await db.select(fields).from(schema.employees).orderBy(schema.employees.createdAt) });
});

export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, employeeCreate);
  if (await verifyLogin(body.code)) throw new ApiError(409, "CODE_IN_USE");
  const [row] = await db.insert(schema.employees).values({
    name: body.name, username: body.username, role: body.role, accessCodeHash: await hashSecret(body.code),
  }).returning(fields);
  await audit(db, admin.id, "employee_create", "employee", row.id, { username: row.username, role: row.role }, clientIp(req));
  return json({ employee: row }, { status: 201 });
});
