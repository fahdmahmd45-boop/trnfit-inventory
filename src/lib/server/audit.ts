import "server-only";
import { db, schema } from "@/db";

type Exec = Pick<typeof db, "insert">;

export async function audit(
  exec: Exec, employeeId: string | null, action: string, entityType: string,
  entityId: string | null, details?: Record<string, unknown>, ip?: string,
) {
  await exec.insert(schema.auditLogs).values({ employeeId, action, entityType, entityId, details: details ?? null, ip: ip ?? null });
}
