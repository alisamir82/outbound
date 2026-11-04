import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { ProposalList } from "@/components/proposals";
import { notFound } from "next/navigation";
import { approveCopyAction, pushCampaignAction, regenerateCopyAction, setAutonomousModeAction, updateSequenceAction } from "@/actions/campaigns";
import { simulateReplyAction } from "@/actions/inbox";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { getInstantly } from "@/lib/instantly/client";
import { requireClientScope } from "@/lib/session";

const TONE = { draft: "zinc", generating: "amber", review: "amber", approved: "green", pushing: "amber", pushed: "green", active: "green", paused: "zinc", failed: "red" } as const;

export default async function CampaignPage({ params }: PageProps<"/app/campaigns/[id]">) {
  const { clientId, canManage } = await requireClientScope();
  const { id } = await params;
  const c = await db.query.campaigns.findFirst({ where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.clientId, clientId)), with: { icp: true } });
  if (!c) notFound();
  const [[assigned], [pushed], [available]] = await Promise.all([
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.campaignId, id)),
    db.select({ n: count() }).from(schema.leads).where(and(eq(schema.leads.campaignId, id), eq(schema.leads.status, "pushed"))),
    c.icpId
      ? db.select({ n: count() }).from(schema.leads).where(and(eq(schema.leads.clientId, clientId), eq(schema.leads.icpId, c.icpId), eq(schema.leads.status, "approved"), isNull(schema.leads.campaignId)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  const instantly = await getInstantly();
  const [daily, proposals] = await Promise.all([
    db.query.campaignStatsDaily.findMany({
      where: and(eq(schema.campaignStatsDaily.campaignId, id), gte(schema.campaignStatsDaily.day, sql`to_char(now() - interval '14 days', 'YYYY-MM-DD')`)),
      orderBy: desc(schema.campaignStatsDaily.day),
    }),
    db.query.optimizationProposals.findMany({ where: eq(schema.optimizationProposals.campaignId, id), orderBy: desc(schema.optimizationProposals.createdAt), limit: 6 }),
  ]);
  const pushedLeads = instantly.mode === "mock" ? await db.query.leads.findMany({ where: and(eq(schema.leads.campaignId, id), eq(schema.leads.status, "pushed")), limit: 50 }) : [];
  const busy = c.status === "generating" || c.status === "pushing";
  const editable = c.status === "review" || c.status === "approved";

  return (
    <>
      <PageHeader title={c.name} subtitle={`ICP: ${c.icp?.name ?? "deleted"}`} actions={<Badge tone={TONE[c.status]}>{c.status}</Badge>} />
      <AutoRefresh active={busy} />
      {c.error ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{c.error}</p> : null}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Approved leads available" value={available.n} />
        <Stat label="Assigned to campaign" value={assigned.n} />
        <Stat label="Pushed to Instantly" value={pushed.n} />
        <Stat label="Replies" value={c.stats.replied} />
      </div>
      {["pushed", "active", "paused"].includes(c.status) ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Sent" value={c.stats.sent} />
          <Stat label="Open rate" value={c.stats.sent ? `${((c.stats.opened / c.stats.sent) * 100).toFixed(0)}%` : "—"} />
          <Stat label="Reply rate" value={c.stats.sent ? `${((c.stats.replied / c.stats.sent) * 100).toFixed(1)}%` : "—"} />
          <Stat label="Bounce rate" value={c.stats.sent ? `${((c.stats.bounced / c.stats.sent) * 100).toFixed(1)}%` : "—"} />
          <Stat label="Meetings" value={c.stats.meetings} />
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Email sequence"
            actions={
              c.status === "review" || c.status === "failed" ? (
                <form action={regenerateCopyAction.bind(null, c.id)}>
                  <Button variant="ghost" className="h-7 text-xs">
                    Regenerate
                  </Button>
                </form>
              ) : null
            }
          >
            {c.status === "generating" ? (
              <p className="text-sm text-zinc-500">Claude is writing the sequence…</p>
            ) : c.sequence.length === 0 ? (
              <p className="text-sm text-zinc-500">No copy yet.</p>
            ) : (
              <ActionForm action={updateSequenceAction} submitLabel="Save edits" hidden={{ campaignId: c.id }}>
                {c.sequence.map((s, i) => (
                  <fieldset key={i} className="space-y-3 rounded-md border border-zinc-200 p-4" disabled={!editable}>
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Step {i + 1} {i > 0 ? `· ${s.delayDays} days later` : ""}
                    </legend>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="md:col-span-3">
                        <Field label="Subject">
                          <Input name={`subject_${i}`} defaultValue={s.subject} />
                        </Field>
                      </div>
                      <Field label="Delay (days)">
                        <Input name={`delay_${i}`} type="number" min={0} max={30} defaultValue={s.delayDays} />
                      </Field>
                    </div>
                    <Field label="Body">
                      <Textarea name={`body_${i}`} rows={7} defaultValue={s.body} className="font-mono text-xs" />
                    </Field>
                  </fieldset>
                ))}
              </ActionForm>
            )}
          </Card>
          {proposals.length ? (
            <Card title="Optimisation proposals">
              <ProposalList proposals={proposals} canManage={canManage} />
            </Card>
          ) : null}
          {daily.length ? (
            <Card title="Last 14 days">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="py-1">Day</th><th>Sent</th><th>Opened</th><th>Replied</th><th>Bounced</th></tr></thead>
                <tbody>
                  {daily.map((d) => (
                    <tr key={d.day} className="border-t border-zinc-100"><td className="py-1">{d.day}</td><td>{d.sent}</td><td>{d.opened}</td><td>{d.replied}</td><td>{d.bounced}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
          {c.brief ? (
            <Card title="Brief">
              <p className="whitespace-pre-wrap text-sm text-zinc-600">{c.brief}</p>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card title="Launch checklist">
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className={c.sequence.length ? "text-emerald-600" : "text-zinc-300"}>●</span>
                <span>Copy generated</span>
              </li>
              <li className="flex items-start gap-2">
                <span className={["approved", "pushing", "pushed", "active"].includes(c.status) ? "text-emerald-600" : "text-zinc-300"}>●</span>
                <div>
                  <div>Copy approved</div>
                  {c.status === "review" ? (
                    <form action={approveCopyAction.bind(null, c.id)} className="mt-1">
                      <Button className="h-8">Approve copy</Button>
                    </form>
                  ) : null}
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className={available.n > 0 || assigned.n > 0 ? "text-emerald-600" : "text-zinc-300"}>●</span>
                <span>Approved leads ready ({available.n} unassigned)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className={["pushed", "active"].includes(c.status) ? "text-emerald-600" : "text-zinc-300"}>●</span>
                <div>
                  <div>Pushed to Instantly {instantly.mode === "mock" ? <span className="text-xs text-amber-700">(mock mode: no real API calls)</span> : null}</div>
                  {c.status === "approved" || (c.status === "failed" && c.sequence.length > 0) ? (
                    <ActionForm
                      action={pushCampaignAction}
                      submitLabel={c.status === "failed" ? `Retry push (${available.n + assigned.n} leads)` : `Push ${available.n} leads and launch`}
                      hidden={{ campaignId: c.id }}
                      className="mt-1 space-y-2"
                    >
                      <span />
                    </ActionForm>
                  ) : null}
                  {c.instantlyCampaignId ? <div className="text-xs text-zinc-500">Instantly ID: {c.instantlyCampaignId}</div> : null}
                </div>
              </li>
            </ol>
          </Card>
          {["pushed", "active", "paused"].includes(c.status) ? (
            <Card title="Reply handling">
              <p className="mb-3 text-sm text-zinc-600">
                {c.autonomousMode ? "Autonomous: Claude sends replies that pass the guardrails and escalates the rest." : "Approval mode: every reply waits for one click in the inbox."}
              </p>
              {canManage ? (
                <form action={setAutonomousModeAction.bind(null, c.id, !c.autonomousMode)}>
                  <Button variant={c.autonomousMode ? "secondary" : "primary"} className="h-8 text-xs">
                    {c.autonomousMode ? "Switch to approval mode" : "Enable autonomous mode"}
                  </Button>
                </form>
              ) : null}
            </Card>
          ) : null}
          {pushedLeads.length ? (
            <Card title="Simulate a reply (mock mode)">
              <ActionForm action={simulateReplyAction} submitLabel="Inject reply">
                <Field label="From lead">
                  <Select name="leadId" defaultValue={pushedLeads[0].id}>
                    {pushedLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {[l.firstName, l.lastName].filter(Boolean).join(" ")} · {l.company}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reply text">
                  <Textarea name="text" rows={3} defaultValue="Interesting, tell me more. Could you do a call next week?" />
                </Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
