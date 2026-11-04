import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateSequence } from "@/lib/ai/copy";
import { getInstantly } from "@/lib/instantly/client";

export async function processCampaignCopy(campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, campaignId), with: { icp: true } });
  if (!campaign || !campaign.icp) throw new Error("campaign or ICP not found");
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, campaign.clientId) });
  try {
    const steps = await generateSequence({
      clientId: campaign.clientId,
      campaignId,
      campaignName: campaign.name,
      brief: campaign.brief ?? "",
      icp: campaign.icp.spec,
      companyName: client?.name ?? "our company",
    });
    await db.update(schema.campaigns).set({ sequence: steps, status: "review", error: null }).where(eq(schema.campaigns.id, campaignId));
  } catch (e) {
    await db.update(schema.campaigns).set({ status: "failed", error: (e as Error).message }).where(eq(schema.campaigns.id, campaignId));
    throw e;
  }
}

/** Creates the Instantly campaign (once) and pushes every approved lead assigned to it. */
export async function processCampaignPush(campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, campaignId) });
  if (!campaign) throw new Error("campaign not found");
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, campaign.clientId) });
  if (!client) throw new Error("client not found");
  const instantly = await getInstantly();

  try {
    let instantlyId = campaign.instantlyCampaignId;
    if (!instantlyId) {
      const prefix = client.instantlyCampaignPrefix ?? `[${client.slug}]`;
      const created = await instantly.createCampaign({ name: `${prefix} ${campaign.name}`, steps: campaign.sequence, timezone: client.timezone });
      instantlyId = created.id;
      await db.update(schema.campaigns).set({ instantlyCampaignId: instantlyId }).where(eq(schema.campaigns.id, campaignId));
    }

    const leads = await db.query.leads.findMany({
      where: and(eq(schema.leads.campaignId, campaignId), eq(schema.leads.status, "approved")),
    });
    const result = await instantly.addLeads(
      instantlyId,
      leads.map((l) => ({
        email: l.email,
        first_name: l.firstName ?? undefined,
        last_name: l.lastName ?? undefined,
        company_name: l.company ?? undefined,
        website: l.domain ? `https://${l.domain}` : undefined,
        custom_variables: { qualification: l.qualification ?? "", title: l.title ?? "", country: l.country ?? "" },
      })),
    );
    const failed = new Map(result.errors.map((e) => [e.email, e.error]));
    for (const lead of leads) {
      const err = failed.get(lead.email);
      await db
        .update(schema.leads)
        .set(err ? { pushError: err } : { status: "pushed", pushedAt: new Date(), pushError: null, instantlyLeadId: instantly.mode === "mock" ? `mock-${lead.id.slice(0, 8)}` : null })
        .where(eq(schema.leads.id, lead.id));
    }
    await instantly.activateCampaign(instantlyId);
    await db
      .update(schema.campaigns)
      .set({ status: "active", pushedAt: new Date(), error: result.errors.length ? `${result.errors.length} lead(s) failed to push` : null })
      .where(eq(schema.campaigns.id, campaignId));
  } catch (e) {
    await db.update(schema.campaigns).set({ status: "failed", error: (e as Error).message }).where(eq(schema.campaigns.id, campaignId));
    throw e;
  }
}
