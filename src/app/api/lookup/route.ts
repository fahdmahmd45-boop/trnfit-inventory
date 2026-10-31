import { NextRequest } from "next/server";
import { route, json, ApiError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { lookupCode } from "@/lib/server/inventory";

export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const item = await lookupCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!item) throw new ApiError(404, "NOT_FOUND");
  return json({ item });
});
