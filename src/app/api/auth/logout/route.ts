import { route, json } from "@/lib/server/http";
import { logout } from "@/lib/server/auth";

export const POST = route(async () => {
  await logout();
  return json({ ok: true });
});
