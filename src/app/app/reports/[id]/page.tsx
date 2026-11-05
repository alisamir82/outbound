import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalList } from "@/components/proposals";
import { Card, PageHeader, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const delta = (a: number, b: number) => (b === 0 ? "" : ` (${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(0)}%)`);

export const metadata = { title: "Report" };

export default async function ReportPage({ params }: PageProps<"/app/reports/[id]">) {
  const { clientId, canManage } = await requireClientScope();
  const { id } = await params;
  const r = await db.query.reports.findFirst({ where: and(eq(schema.reports.id, id), eq(schema.reports.clientId, clientId)) });
  if (!r) notFound();
  const proposals = await db.query.optimizationProposals.findMany({ where: eq(schema.optimizationProposals.reportId, id) });
  const names = new Map(r.content.campaigns.map((c) => [c.id, c.name]));
  const c = r.content;
  return (
    <>
      <PageHeader
        title={`Weekly report · ${r.weekKey.split("-manual")[0]}`}
        subtitle={
          <>
            {r.periodStart.toLocaleDateString()} – {r.periodEnd.toLocaleDateString()} ·{" "}
            <Link href="/app/reports" className="underline">
              all reports
            </Link>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Sent" value={`${c.totals.sent}${delta(c.totals.sent, c.previous.sent)}`} />
        <Stat label="Open rate" value={pct(c.totals.opened, c.totals.sent)} />
        <Stat label="Replies" value={`${c.totals.replied}${delta(c.totals.replied, c.previous.replied)}`} />
        <Stat label="Reply rate" value={pct(c.totals.replied, c.totals.sent)} />
        <Stat label="Meetings" value={`${c.totals.meetings}${delta(c.totals.meetings, c.previous.meetings)}`} />
        <Stat label="AI spend" value={`$${c.totals.aiSpendUsd.toFixed(2)}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Summary">
            <ul className="mb-3 list-disc pl-5 text-sm">
              {c.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <p className="whitespace-pre-wrap text-sm text-zinc-700">{c.narrative}</p>
            <h3 className="mt-4 text-sm font-semibold">Next steps</h3>
            <ol className="list-decimal pl-5 text-sm">
              {c.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Card>
          <Card title="Campaigns">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr><th className="py-1">Campaign</th><th>Sent</th><th>Replies</th><th>Reply rate</th><th>Meetings</th></tr>
              </thead>
              <tbody>
                {c.campaigns.map((x) => (
                  <tr key={x.id} className="border-t border-zinc-100">
                    <td className="py-1"><Link href={`/app/campaigns/${x.id}`} className="hover:underline">{x.name}</Link></td>
                    <td>{x.sent}</td><td>{x.replied}</td><td>{x.replyRate.toFixed(1)}%</td><td>{x.meetings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Optimisation proposals">
            <ProposalList proposals={proposals} canManage={canManage} campaignNames={names} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Reply classifications">
            {Object.keys(c.classifications).length === 0 ? (
              <p className="text-sm text-zinc-500">No replies this week.</p>
            ) : (
              <ul className="text-sm">
                {Object.entries(c.classifications).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b border-zinc-100 py-1"><span>{k.replace("_", " ")}</span><span>{v}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Sending health">
            <p className="text-sm">{c.health.accounts} accounts · {c.health.warning} warning · {c.health.critical} critical</p>
          </Card>
          <Card title="Leads">
            <p className="text-sm">{c.totals.leadsAdded} new leads added this week · bounces {pct(c.totals.bounced, c.totals.sent)}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
