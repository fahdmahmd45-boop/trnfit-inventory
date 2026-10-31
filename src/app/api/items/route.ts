import { NextRequest } from "next/server";
import { route, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { listItems, type ItemFilter } from "@/lib/server/inventory";

export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const f = sp.get("filter");
  const filter: ItemFilter = f === "low" || f === "out" ? f : "all";
  return json({ items: await listItems(sp.get("q")?.slice(0, 100) ?? undefined, filter) });
});
