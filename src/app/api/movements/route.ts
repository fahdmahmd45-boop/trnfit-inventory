import { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, parseBody, clientIp } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { applyMovement, listMovements } from "@/lib/server/inventory";
import { movementInput } from "@/lib/validation";

const query = z.object({
  variantId: z.string().uuid().optional(),
  type: z.enum(["in", "out", "adjust"]).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const q = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  return json(await listMovements(q));
});

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, movementInput);
  const result = await applyMovement(body, user.id, clientIp(req));
  return json(result, { status: result.duplicate ? 200 : 201 });
});
