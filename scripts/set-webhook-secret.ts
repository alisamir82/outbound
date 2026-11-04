import "dotenv/config";
import { db } from "../src/db";
import { saveIntegration } from "../src/lib/settings";

/** Dev helper: `pnpm tsx scripts/set-webhook-secret.ts <secret>` */
async function main() {
  const secret = process.argv[2];
  if (!secret) throw new Error("usage: tsx scripts/set-webhook-secret.ts <secret>");
  const admin = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.role, "super_admin") });
  if (!admin) throw new Error("seed first");
  const current = await db.query.platformSettings.findFirst({ where: (s, { eq }) => eq(s.key, "instantly") });
  await saveIntegration("instantly", current?.value ?? { enabled: false }, { webhookSecret: secret }, admin.id);
  console.log("webhook secret set");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
