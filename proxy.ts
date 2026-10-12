import { NextResponse, type NextRequest } from "next/server";

/**
 * Hosted demo only (ADAPTIVE_DEALS_SESSIONS=1): give each visitor a random id, so every visitor works on their own copy of
 * the deals. The id is passed to the app in a request header and kept in a cookie. Without the flag this does nothing.
 */
const COOKIE = "ad_session";
const HEADER = "x-ad-session";
const PATTERN = /^[a-f0-9]{32}$/;

export function proxy(request: NextRequest) {
  if (process.env.ADAPTIVE_DEALS_SESSIONS !== "1") return NextResponse.next();
  const existing = request.cookies.get(COOKIE)?.value;
  const id = existing && PATTERN.test(existing) ? existing : crypto.randomUUID().replaceAll("-", "");
  const headers = new Headers(request.headers);
  headers.set(HEADER, id);
  const response = NextResponse.next({ request: { headers } });
  if (id !== existing) response.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
