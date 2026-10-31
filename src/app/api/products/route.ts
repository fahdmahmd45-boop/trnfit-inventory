import { NextRequest } from "next/server";
import { route, json, parseBody, clientIp } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { createProduct } from "@/lib/server/inventory";
import { productCreate } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, productCreate);
  return json(await createProduct(body, user.id, clientIp(req)), { status: 201 });
});
