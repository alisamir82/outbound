import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { approveRunByScoreAction, deleteRejectedAction } from "@/actions/leads";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm } from "@/components/forms";
import { LeadReviewTable } from "@/components/lead-review-table";
import { Badge, Button, Card, Field, Input, PageHeader, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

const STAGES = ["queued", "sourcing", "verifying", "qualifying", "review"] as const;

export default async function LeadRunPage({ params }: PageProps<"/app/leads/runs/[id]">) {
  const { clientId } = await requireClientScope();
  const { id } = await params;
  const run = await db.query.leadRuns.findFirst({ where: and(eq(schema.leadRuns.id, id), eq(schema.leadRuns.clientId, clientId)), with: { icp: true } });
  if (!run) notFound();
  const leads = await db.query.leads.findMany({ where: eq(schema.leads.leadRunId, id), orderBy: [desc(schema.leads.score), schema.leads.company] });
  const inProgress = !["review", "pushed", "failed"].includes(run.status);
  const stageIdx = STAGES.indexOf(run.status as (typeof STAGES)[number]);
  const pending = leads.filter((l) => l.status === "new").length;
  const approved = leads.filter((l) => l.status === "approved" || l.status === "pushed").length;

  return (
    <>
      <PageHeader
        title="Lead run"
        subtitle={
          <>
            ICP:{" "}
            {run.icp ? (
              <Link href={`/app/icps/${run.icp.id}`} className="underline">
                {run.icp.name}
              </Link>
            ) : (
              "deleted"
            )}{" "}
            · requested {run.requestedCount} · started {run.createdAt.toLocaleString()}
          </>
        }
        actions={<Badge tone={run.status === "failed" ? "red" : inProgress ? "amber" : "green"}>{run.status}</Badge>}
      />
      <AutoRefresh active={inProgress} />
      {run.status === "failed" ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Run failed: {run.error}</p> : null}
      {inProgress ? (
        <ol className="mb-6 flex flex-wrap gap-2 text-sm">
          {STAGES.map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${i < stageIdx ? "bg-emerald-100 text-emerald-800" : i === stageIdx ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-500"}`}>
              {s}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sourced" value={run.counts.sourced} />
        <Stat label="New (after dedupe)" value={run.counts.deduped} />
        <Stat label="Verified" value={run.counts.verified} />
        <Stat label="Awaiting review" value={pending} />
        <Stat label="Approved" value={approved} />
      </div>
      {run.status === "review" && pending > 0 ? (
        <Card title="Bulk approve" className="mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <ActionForm action={approveRunByScoreAction} submitLabel="Approve by score" hidden={{ leadRunId: run.id }} className="flex items-end gap-3">
              <Field label="Minimum score">
                <Input name="minScore" type="number" min={1} max={5} defaultValue={3} className="w-24" />
              </Field>
            </ActionForm>
            <form action={deleteRejectedAction.bind(null, run.id)}>
              <Button variant="secondary">Delete rejected leads</Button>
            </form>
          </div>
        </Card>
      ) : null}
      <LeadReviewTable leads={leads} reviewable={run.status === "review"} />
    </>
  );
}
