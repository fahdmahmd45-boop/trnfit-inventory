import { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, parseBody, clientIp } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { addVariant } from "@/lib/server/inventory";
import { variantInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const body = await parseBody(req, variantInput);
  return json(await addVariant(z.string().uuid().parse((await params).id), body, user.id, clientIp(req)), { status: 201 });
});
