import { and, count, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { approveCopyAction, pushCampaignAction, regenerateCopyAction, updateSequenceAction } from "@/actions/campaigns";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Badge, Button, Card, Field, Input, PageHeader, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { getInstantly } from "@/lib/instantly/client";
import { requireClientScope } from "@/lib/session";

const TONE = { draft: "zinc", generating: "amber", review: "amber", approved: "green", pushing: "amber", pushed: "green", active: "green", paused: "zinc", failed: "red" } as const;

export default async function CampaignPage({ params }: PageProps<"/app/campaigns/[id]">) {
  const { clientId } = await requireClientScope();
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
        </div>
      </div>
    </>
  );
}
