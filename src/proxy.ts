import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC = [/^\/login$/, /^\/forgot-password$/, /^\/reset-password\//, /^\/accept-invite\//, /^\/api\/auth\//, /^\/api\/health$/];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const user = req.auth?.user;
  if (!user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const isAdmin = user.role === "super_admin";
  if (pathname === "/") return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/app", req.url));
  if (pathname.startsWith("/admin") && !isAdmin) return NextResponse.redirect(new URL("/app", req.url));
  if (pathname.startsWith("/app") && isAdmin && !req.nextUrl.searchParams.has("as"))
    return NextResponse.redirect(new URL("/admin", req.url));
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)"],
};
