import { NextRequest } from "next/server";
import { route, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { generateSku } from "@/lib/server/inventory";

export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  return json({ sku: await generateSku((sp.get("name") ?? "").slice(0, 120), (sp.get("variant") ?? "").slice(0, 80)) });
});
