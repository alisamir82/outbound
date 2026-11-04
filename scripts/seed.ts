import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { mockLeadSource } from "../src/lib/leads/sources/mock";
import { mockVerifier } from "../src/lib/leads/verification/mock";

/**
 * Idempotent seed: a super admin, the dummy pilot client "Acme Demo" with a
 * client admin, a client user, one ICP and 50 mock leads.
 */
async function main() {
  const adminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "Admin12345!";
  const demoPassword = "Demo12345!";

  let admin = await db.query.users.findFirst({ where: eq(schema.users.email, adminEmail) });
  if (!admin) {
    [admin] = await db
      .insert(schema.users)
      .values({ email: adminEmail, name: "Platform Admin", role: "super_admin", passwordHash: await hashPassword(adminPassword) })
      .returning();
    console.log(`created super admin ${adminEmail} / ${adminPassword}`);
  }

  let client = await db.query.clients.findFirst({ where: eq(schema.clients.slug, "acme-demo") });
  if (!client) {
    [client] = await db
      .insert(schema.clients)
      .values({
        name: "Acme Demo",
        slug: "acme-demo",
        status: "active",
        website: "https://acme-demo.example.com",
        instantlyCampaignPrefix: "[acme-demo]",
        timezone: "Europe/London",
        onboarding: { profile: true, knowledgeBase: false, calendar: false, icp: true },
      })
      .returning();
    console.log("created client Acme Demo");
  }

  for (const u of [
    { email: "owner@acme-demo.example.com", name: "Dana Owner", role: "client_admin" as const },
    { email: "sdr@acme-demo.example.com", name: "Sam SDR", role: "client_user" as const },
  ]) {
    const exists = await db.query.users.findFirst({ where: eq(schema.users.email, u.email) });
    if (!exists) {
      await db.insert(schema.users).values({ ...u, clientId: client.id, passwordHash: await hashPassword(demoPassword) });
      console.log(`created ${u.role} ${u.email} / ${demoPassword}`);
    }
  }

  let icp = await db.query.icps.findFirst({ where: eq(schema.icps.clientId, client.id) });
  if (!icp) {
    [icp] = await db
      .insert(schema.icps)
      .values({
        clientId: client.id,
        name: "Mid-market logistics ops leaders",
        prompt: "We sell route-optimisation software to logistics companies with 50-500 drivers in the UK and EU.",
        spec: {
          industries: ["Logistics", "Transportation", "Last-mile delivery"],
          companySizes: ["51-200", "201-500"],
          geographies: ["GB", "DE", "NL", "FR"],
          titles: ["Head of Operations", "Operations Director", "VP Logistics", "Fleet Manager"],
          painPoints: ["Rising fuel costs", "Missed delivery windows", "Manual route planning"],
          disqualifiers: ["Fewer than 20 vehicles", "Already using a competitor on a multi-year contract"],
          valueProposition: "Cut fleet mileage by 12-18% within 90 days with AI route optimisation.",
        },
        createdBy: admin.id,
      })
      .returning();
    console.log("created ICP");
  }

  const existingLeads = await db.query.leads.findMany({ where: eq(schema.leads.clientId, client.id), columns: { email: true } });
  if (existingLeads.length === 0) {
    const [run] = await db
      .insert(schema.leadRuns)
      .values({ clientId: client.id, icpId: icp.id, source: "mock", status: "review", requestedCount: 50, createdBy: admin.id, startedAt: new Date(), finishedAt: new Date() })
      .returning();
    const sourced = await mockLeadSource.search({ icp: icp.spec, limit: 50, exclude: new Set() });
    const verified = await mockVerifier.verify(sourced.map((l) => l.email));
    await db.insert(schema.leads).values(
      sourced.map((l) => ({
        clientId: client.id,
        leadRunId: run.id,
        icpId: icp.id,
        ...l,
        source: "mock",
        verification: verified.get(l.email) ?? "unknown",
        score: 1 + Math.floor(Math.random() * 5),
        qualification: `${l.company} runs a ${l.country} fleet where ${icp.spec.painPoints[0].toLowerCase()} is a likely concern for a ${l.title}.`,
      })),
    );
    await db.update(schema.leadRuns).set({ counts: { sourced: 50, deduped: 50, verified: 50, qualified: 50, pushed: 0 } }).where(eq(schema.leadRuns.id, run.id));
    console.log(`created ${sourced.length} mock leads`);
  }

  await db.insert(schema.platformSettings).values({ key: "lead_source", value: { provider: "mock", dailyCreditCap: 500 } }).onConflictDoNothing();
  await db.insert(schema.platformSettings).values({ key: "email_verification", value: { provider: "mock", acceptCatchAll: false } }).onConflictDoNothing();
  console.log("seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
