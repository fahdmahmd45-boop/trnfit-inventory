import { route, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { dashboardStats, inventoryAlerts, listMovements } from "@/lib/server/inventory";

export const GET = route(async () => {
  await requireUser();
  const [stats, recent, alerts] = await Promise.all([
    dashboardStats(), listMovements({ limit: 8 }), inventoryAlerts(20),
  ]);
  return json({ stats, recent: recent.items, alerts });
});
