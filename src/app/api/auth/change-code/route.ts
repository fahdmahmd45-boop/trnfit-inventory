import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route, json, parseBody, ApiError, clientIp } from "@/lib/server/http";
import { requireUser, checkLoginRateLimit, verifyLogin } from "@/lib/server/auth";
import { hashSecret, verifySecret } from "@/lib/password";
import { changeCodeInput } from "@/lib/validation";
import { audit } from "@/lib/server/audit";

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const ip = clientIp(req);
  await checkLoginRateLimit(ip);
  const { currentCode, newCode } = await parseBody(req, changeCodeInput);
  const [emp] = await db.select({ hash: schema.employees.accessCodeHash }).from(schema.employees)
    .where(eq(schema.employees.id, user.id)).limit(1);
  if (!emp || !(await verifySecret(currentCode, emp.hash))) {
    await db.insert(schema.loginAttempts).values({ ip, success: false });
    throw new ApiError(401, "INVALID_CODE");
  }
  // Codes identify employees, so they must be unique among active accounts.
  const clash = await verifyLogin(newCode);
  if (clash && clash.id !== user.id) throw new ApiError(409, "CODE_IN_USE");
  await db.update(schema.employees).set({ accessCodeHash: await hashSecret(newCode), updatedAt: new Date() })
    .where(eq(schema.employees.id, user.id));
  // Sign out every session of this employee (including this one) after a code change.
  await db.delete(schema.sessions).where(eq(schema.sessions.employeeId, user.id));
  await audit(db, user.id, "change_code", "employee", user.id, undefined, ip);
  return json({ ok: true, reloginRequired: true });
});
