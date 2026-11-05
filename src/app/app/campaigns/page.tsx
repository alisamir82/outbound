import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge, LinkButton, PageHeader, Table } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

const TONE = { draft: "zinc", generating: "amber", review: "amber", approved: "green", pushing: "amber", pushed: "green", active: "green", paused: "zinc", failed: "red" } as const;

export default async function CampaignsPage() {
  const { clientId } = await requireClientScope();
  const rows = await db
    .select({
      id: schema.campaigns.id,
      name: schema.campaigns.name,
      status: schema.campaigns.status,
      createdAt: schema.campaigns.createdAt,
      stats: schema.campaigns.stats,
      leads: count(schema.leads.id),
    })
    .from(schema.campaigns)
    .leftJoin(schema.leads, eq(schema.leads.campaignId, schema.campaigns.id))
    .where(eq(schema.campaigns.clientId, clientId))
    .groupBy(schema.campaigns.id)
    .orderBy(desc(schema.campaigns.createdAt));
  return (
    <>
      <PageHeader title="Campaigns" actions={<LinkButton href="/app/campaigns/new">New campaign</LinkButton>} />
      <Table head={["Name", "Status", "Leads", "Sent", "Replies", "Created"]}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2">
              <Link href={`/app/campaigns/${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
            </td>
            <td className="px-4 py-2">
              <Badge tone={TONE[c.status]}>{c.status}</Badge>
            </td>
            <td className="px-4 py-2">{c.leads}</td>
            <td className="px-4 py-2">{c.stats.sent}</td>
            <td className="px-4 py-2">{c.stats.replied}</td>
            <td className="px-4 py-2 text-zinc-500">{c.createdAt.toLocaleDateString()}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
              No campaigns yet.
            </td>
          </tr>
        ) : null}
      </Table>
    </>
  );
}
