import { NextRequest } from "next/server";
import { route, json, parseBody, clientIp } from "@/lib/server/http";
import { login, sessionCookie } from "@/lib/server/auth";
import { loginInput } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  const { code, username } = await parseBody(req, loginInput);
  const { token, expiresAt, user } = await login(code, clientIp(req), req.headers.get("user-agent"), username || undefined);
  const res = json({ user });
  res.cookies.set(sessionCookie(token, expiresAt));
  return res;
});
