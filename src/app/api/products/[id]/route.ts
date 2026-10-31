import { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, parseBody, clientIp } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { updateProduct } from "@/lib/server/inventory";
import { productUpdate } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const body = await parseBody(req, productUpdate);
  await updateProduct(z.string().uuid().parse((await params).id), body, user.id, clientIp(req));
  return json({ ok: true });
});
