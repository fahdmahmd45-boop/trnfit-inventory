import { route, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

export const GET = route(async () => json({ user: await requireUser() }));
