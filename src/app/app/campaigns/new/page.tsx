import { desc, eq } from "drizzle-orm";
import { createCampaignAction } from "@/actions/campaigns";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const { clientId } = await requireClientScope();
  const icps = await db.query.icps.findMany({ where: eq(schema.icps.clientId, clientId), orderBy: desc(schema.icps.createdAt) });
  return (
    <>
      <PageHeader title="New campaign" subtitle="Claude drafts a 3-step sequence from your brief. You review and approve before anything is sent." />
      <Card>
        {icps.length === 0 ? (
          <p className="text-sm text-zinc-600">Create an ICP first.</p>
        ) : (
          <ActionForm action={createCampaignAction} submitLabel="Generate copy">
            <Field label="Campaign name">
              <Input name="name" required placeholder="Q4 UK logistics outreach" />
            </Field>
            <Field label="ICP">
              <Select name="icpId" defaultValue={icps[0].id}>
                {icps.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brief" help="Angle, proof points, offer, tone. Anything the copywriter should know.">
              <Textarea name="brief" rows={5} required placeholder="Lead with the fuel-cost angle. Mention the Northwind case study (14% fewer miles in 60 days). Offer a 15-minute route audit." />
            </Field>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
