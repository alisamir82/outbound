import type { NextAuthConfig } from "next-auth";

export type Role = "super_admin" | "client_admin" | "client_user";

/** Edge-safe config (no DB imports). Used by proxy.ts and extended in auth.ts. */
export const authConfig = {
  trustHost: true, // app sits behind Caddy; APP_URL is the public origin
  basePath: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role: Role }).role;
        token.clientId = (user as { clientId: string | null }).clientId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      session.user.clientId = (token.clientId as string | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name: string; role: Role; clientId: string | null };
  }
  interface User {
    role: Role;
    clientId: string | null;
  }
}
