import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getInstantly } from "@/lib/instantly/client";
import { raiseAlert, clearAlert } from "@/lib/alerts";

/** Daily: refresh sending-account health and raise alerts for the agency. */
export async function checkEmailHealth() {
  const instantly = await getInstantly();
  const accounts = await instantly.listAccounts();
  let warning = 0;
  let critical = 0;
  for (const a of accounts) {
    if (!a.email) continue;
    const issues: string[] = [];
    let health: "healthy" | "warning" | "critical" = "healthy";
    if (a.bounceRateBp >= 500) {
      issues.push(`Bounce rate ${(a.bounceRateBp / 100).toFixed(1)}%`);
      health = "critical";
    } else if (a.bounceRateBp >= 300) {
      issues.push(`Bounce rate ${(a.bounceRateBp / 100).toFixed(1)}%`);
      health = "warning";
    }
    if (a.providerStatus && !["active", "connected", "ok"].includes(a.providerStatus.toLowerCase())) {
      issues.push(`Provider status: ${a.providerStatus}`);
      health = "critical";
    }
    if (!a.warmupEnabled) {
      issues.push("Warm-up disabled");
      if (health === "healthy") health = "warning";
    }
    if (a.warmupScore != null && a.warmupScore < 80) {
      issues.push(`Warm-up score ${a.warmupScore}`);
      if (health === "healthy") health = "warning";
    }
    if (a.dailyLimit > 0 && a.sentToday >= a.dailyLimit) issues.push("Daily limit reached");

    await db
      .insert(schema.emailAccounts)
      .values({ email: a.email, warmupEnabled: a.warmupEnabled, warmupScore: a.warmupScore, dailyLimit: a.dailyLimit, sentToday: a.sentToday, bounceRate: a.bounceRateBp, replyRate: a.replyRateBp, providerStatus: a.providerStatus, health, issues, lastCheckedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.emailAccounts.email,
        set: { warmupEnabled: a.warmupEnabled, warmupScore: a.warmupScore, dailyLimit: a.dailyLimit, sentToday: a.sentToday, bounceRate: a.bounceRateBp, replyRate: a.replyRateBp, providerStatus: a.providerStatus, health, issues, lastCheckedAt: new Date() },
      });

    const key = `email_health:${a.email}`;
    if (health === "critical") {
      critical++;
      await raiseAlert({ clientId: null, severity: "critical", type: "email_health", dedupeKey: key, message: `${a.email}: ${issues.join("; ")}` });
    } else if (health === "warning") {
      warning++;
      await raiseAlert({ clientId: null, severity: "warning", type: "email_health", dedupeKey: key, message: `${a.email}: ${issues.join("; ")}` });
    } else await clearAlert(key);
  }
  return { accounts: accounts.length, warning, critical };
}

export async function healthSummary() {
  const rows = await db.select({ health: schema.emailAccounts.health }).from(schema.emailAccounts);
  return { accounts: rows.length, warning: rows.filter((r) => r.health === "warning").length, critical: rows.filter((r) => r.health === "critical").length };
}

export async function mapAccountToClient(email: string, clientId: string | null) {
  await db.update(schema.emailAccounts).set({ clientId }).where(eq(schema.emailAccounts.email, email));
}
