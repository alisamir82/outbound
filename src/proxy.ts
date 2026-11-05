import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC = [/^\/login$/, /^\/forgot-password$/, /^\/reset-password\//, /^\/accept-invite\//, /^\/api\/auth\//, /^\/api\/health$/, /^\/api\/webhooks\//];

export default auth((req) => {
  // nextUrl.pathname excludes the basePath; cloning nextUrl keeps the basePath on redirects.
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const to = (path: string, next?: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  };

  const user = req.auth?.user;
  if (!user) return to("/login", pathname);
  const isAdmin = user.role === "super_admin";
  if (pathname === "/") return to(isAdmin ? "/admin" : "/app");
  if (pathname.startsWith("/admin") && !isAdmin) return to("/app");
  if (pathname.startsWith("/app") && isAdmin && !req.cookies.get("view_as_client")) return to("/admin/clients");
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)"],
};
