import { eq, sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db, schema } from "./db";
import { verifyPassword } from "./lib/password";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await db.query.users.findFirst({
          where: sql`lower(${schema.users.email}) = ${email.toLowerCase()}`,
          with: { client: true },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        if (user.client && user.client.status === "suspended") return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
        return { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId };
      },
    }),
  ],
});
