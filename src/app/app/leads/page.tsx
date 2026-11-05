import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { LeadReviewTable } from "@/components/lead-review-table";
import { LinkButton, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

const STATUSES = ["all", "new", "approved", "pushed", "replied", "meeting", "rejected", "bounced", "unsubscribed"] as const;

export default async function LeadsPage({ searchParams }: PageProps<"/app/leads">) {
  const { clientId } = await requireClientScope();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status : "all";
  const leads = await db.query.leads.findMany({
    where: and(eq(schema.leads.clientId, clientId), status === "all" ? undefined : eq(schema.leads.status, status as schema.Lead["status"])),
    orderBy: [desc(schema.leads.score), desc(schema.leads.createdAt)],
    limit: 500,
  });
  return (
    <>
      <PageHeader title="Leads" subtitle={`${leads.length} shown`} actions={<LinkButton href="/app/icps" variant="secondary">Start a lead run</LinkButton>} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={s === "all" ? "/app/leads" : `/app/leads?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {s}
          </Link>
        ))}
      </nav>
      <LeadReviewTable leads={leads} reviewable={status === "all" || status === "new" || status === "approved" || status === "rejected"} />
    </>
  );
}
