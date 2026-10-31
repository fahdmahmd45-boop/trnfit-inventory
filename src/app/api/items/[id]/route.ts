import { NextRequest } from "next/server";
import { route, json, parseBody, ApiError, clientIp } from "@/lib/server/http";
import { requireUser, requireAdmin } from "@/lib/server/auth";
import { getItem, updateVariant, archiveVariant } from "@/lib/server/inventory";
import { variantUpdate } from "@/lib/validation";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };
const id = z.string().uuid();

export const GET = route<Ctx>(async (_req, { params }) => {
  await requireUser();
  const item = await getItem(id.parse((await params).id));
  if (!item) throw new ApiError(404, "NOT_FOUND");
  return json({ item });
});

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const body = await parseBody(req, variantUpdate);
  const item = await updateVariant(id.parse((await params).id), body, user.id, clientIp(req));
  return json({ item });
});

export const DELETE = route<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireAdmin();
  const result = await archiveVariant(id.parse((await params).id), user.id, clientIp(req));
  return json(result);
});
