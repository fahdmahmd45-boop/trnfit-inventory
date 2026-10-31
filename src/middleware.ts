import { NextResponse, type NextRequest } from "next/server";

// Cheap edge gate: pages without a session cookie go to /login. Real session validation happens
// server-side (app layout + every API route) against the database.
export function middleware(req: NextRequest) {
  const has = req.cookies.has("trn_session");
  const { pathname } = req.nextUrl;
  if (pathname === "/login") {
    return NextResponse.next();
  }
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|icons|zxing|manifest.webmanifest|sw.js|favicon.ico|robots.txt).*)"],
};
