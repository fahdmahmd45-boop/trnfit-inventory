import { route, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { dashboardStats, listItems, listMovements } from "@/lib/server/inventory";

export const GET = route(async () => {
  await requireUser();
  const [stats, recent, low, out] = await Promise.all([
    dashboardStats(), listMovements({ limit: 8 }), listItems(undefined, "low"), listItems(undefined, "out"),
  ]);
  return json({ stats, recent: recent.items, alerts: [...out, ...low].slice(0, 20) });
});
