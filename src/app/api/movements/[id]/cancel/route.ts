import { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, clientIp, ApiError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { cancelMovement } from "@/lib/server/inventory";

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAdmin();
  const { id: raw } = await ctx.params;
  const id = z.coerce.number().int().positive().safeParse(raw);
  if (!id.success) throw new ApiError(400, "BAD_ID");
  return json(await cancelMovement(id.data, user.id, clientIp(req)));
});
