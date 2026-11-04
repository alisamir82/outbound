import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { generateReportNowAction } from "@/actions/reports";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm } from "@/components/forms";
import { ProposalList } from "@/components/proposals";
import { Card, PageHeader, Table } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export default async function ReportsPage() {
  const { clientId, canManage } = await requireClientScope();
  const [reports, proposals, campaigns] = await Promise.all([
    db.query.reports.findMany({ where: eq(schema.reports.clientId, clientId), orderBy: desc(schema.reports.createdAt), limit: 26 }),
    db.query.optimizationProposals.findMany({ where: eq(schema.optimizationProposals.clientId, clientId), orderBy: desc(schema.optimizationProposals.createdAt), limit: 20 }),
    db.query.campaigns.findMany({ where: eq(schema.campaigns.clientId, clientId), columns: { id: true, name: true } }),
  ]);
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const pending = proposals.filter((p) => p.status === "proposed");
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Every Monday morning: last week's numbers, a short narrative, and optimisation proposals for you to approve."
        actions={canManage ? <ActionForm action={generateReportNowAction} submitLabel="Generate report now" className="flex items-center gap-3"><span /></ActionForm> : undefined}
      />
      <AutoRefresh active={false} />
      <div className="space-y-6">
        <Card title={`Optimisation proposals${pending.length ? ` · ${pending.length} awaiting decision` : ""}`}>
          <ProposalList proposals={proposals.filter((p) => p.status === "proposed" || p.status === "failed")} canManage={canManage} campaignNames={names} />
        </Card>
        <Table head={["Week", "Period", "Sent", "Replies", "Meetings", "Emailed"]}>
          {reports.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">
                <Link href={`/app/reports/${r.id}`} className="font-medium hover:underline">
                  {r.weekKey.split("-manual")[0]}
                </Link>
              </td>
              <td className="px-4 py-2 text-zinc-500">
                {r.periodStart.toLocaleDateString()} – {r.periodEnd.toLocaleDateString()}
              </td>
              <td className="px-4 py-2">{r.content.totals.sent}</td>
              <td className="px-4 py-2">{r.content.totals.replied}</td>
              <td className="px-4 py-2">{r.content.totals.meetings}</td>
              <td className="px-4 py-2 text-zinc-500">{r.emailedAt ? r.emailedAt.toLocaleString() : "—"}</td>
            </tr>
          ))}
          {reports.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                No reports yet. The first one arrives next Monday, or generate one now.
              </td>
            </tr>
          ) : null}
        </Table>
        {proposals.some((p) => p.status !== "proposed" && p.status !== "failed") ? (
          <Card title="Decided proposals">
            <ProposalList proposals={proposals.filter((p) => p.status !== "proposed" && p.status !== "failed")} canManage={false} campaignNames={names} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
