import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LeadRun } from "@/db/schema";
import { qualifyLeads } from "@/lib/ai/qualify";
import { resolveLeadSource, resolveVerifier } from "@/lib/leads/registry";
import { getIntegration } from "@/lib/settings";

/**
 * Lead-run pipeline: source → dedupe → verify → qualify → review.
 * Each stage updates lead_runs.status so the UI can show progress.
 */
export async function processLeadRun(leadRunId: string) {
  const run = await db.query.leadRuns.findFirst({ where: eq(schema.leadRuns.id, leadRunId), with: { icp: true } });
  if (!run) throw new Error(`lead run ${leadRunId} not found`);
  if (!run.icp) throw new Error("lead run has no ICP");
  if (run.status !== "queued") return; // already processed (retry after partial failure is handled below)

  const setStatus = (status: LeadRun["status"], extra: Partial<typeof schema.leadRuns.$inferInsert> = {}) =>
    db.update(schema.leadRuns).set({ status, ...extra }).where(eq(schema.leadRuns.id, leadRunId));

  try {
    await setStatus("sourcing", { startedAt: new Date() });

    // Exclusions: existing leads for this client + global/client suppressions
    const [existing, suppressed] = await Promise.all([
      db.query.leads.findMany({ where: eq(schema.leads.clientId, run.clientId), columns: { email: true } }),
      db.query.suppressions.findMany({
        where: or(isNull(schema.suppressions.clientId), eq(schema.suppressions.clientId, run.clientId)),
        columns: { value: true },
      }),
    ]);
    const exclude = new Set([...existing.map((l) => l.email.toLowerCase()), ...suppressed.map((s) => s.value.toLowerCase())]);
    const suppressedDomains = new Set(suppressed.map((s) => s.value.toLowerCase()).filter((v) => !v.includes("@")));

    const { value: sourceCfg } = await getIntegration("lead_source");
    const cap = Number(sourceCfg.dailyCreditCap ?? 500);
    const limit = Math.min(run.requestedCount, cap);

    const source = await resolveLeadSource();
    const sourced = await source.search({ icp: run.icp.spec, limit, exclude });
    const deduped = sourced.filter((l) => !exclude.has(l.email.toLowerCase()) && !suppressedDomains.has((l.domain ?? "").toLowerCase()));

    if (deduped.length === 0) {
      await setStatus("review", { counts: { sourced: sourced.length, deduped: 0, verified: 0, qualified: 0, pushed: 0 }, finishedAt: new Date() });
      return;
    }

    const inserted = await db
      .insert(schema.leads)
      .values(
        deduped.map((l) => ({
          clientId: run.clientId,
          leadRunId: run.id,
          icpId: run.icpId,
          email: l.email.toLowerCase(),
          firstName: l.firstName,
          lastName: l.lastName,
          title: l.title,
          company: l.company,
          domain: l.domain,
          country: l.country,
          linkedinUrl: l.linkedinUrl,
          source: source.key,
          sourceRef: l.sourceRef,
        })),
      )
      .onConflictDoNothing()
      .returning();

    await setStatus("verifying", { counts: { sourced: sourced.length, deduped: inserted.length, verified: 0, qualified: 0, pushed: 0 } });
    const { value: verCfg } = await getIntegration("email_verification");
    const verifier = await resolveVerifier();
    const results = await verifier.verify(inserted.map((l) => l.email));
    const acceptCatchAll = Boolean(verCfg.acceptCatchAll);
    let verified = 0;
    for (const lead of inserted) {
      const v = results.get(lead.email) ?? "unknown";
      const ok = v === "valid" || (v === "catch_all" && acceptCatchAll);
      if (ok) verified++;
      await db
        .update(schema.leads)
        .set({ verification: v, status: ok ? "new" : "rejected" })
        .where(eq(schema.leads.id, lead.id));
    }

    await setStatus("qualifying", { counts: { sourced: sourced.length, deduped: inserted.length, verified, qualified: 0, pushed: 0 } });
    const toQualify = inserted.filter((l) => {
      const v = results.get(l.email) ?? "unknown";
      return v === "valid" || (v === "catch_all" && acceptCatchAll);
    });
    const quals = await qualifyLeads({ clientId: run.clientId, leadRunId: run.id, icp: run.icp.spec, leads: toQualify });
    for (const q of quals) {
      await db.update(schema.leads).set({ score: q.score, qualification: q.qualification }).where(eq(schema.leads.id, q.id));
    }

    await setStatus("review", {
      counts: { sourced: sourced.length, deduped: inserted.length, verified, qualified: quals.length, pushed: 0 },
      finishedAt: new Date(),
    });
  } catch (e) {
    await setStatus("failed", { error: (e as Error).message, finishedAt: new Date() });
    throw e;
  }
}

/** Marks leads approved/rejected. Only leads in `new` (or the opposite decision) can change. */
export async function decideLeads(clientId: string, ids: string[], decision: "approved" | "rejected") {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(schema.leads)
    .set({ status: decision })
    .where(and(eq(schema.leads.clientId, clientId), inArray(schema.leads.id, ids), inArray(schema.leads.status, ["new", "approved", "rejected"])))
    .returning({ id: schema.leads.id });
  return rows.length;
}
