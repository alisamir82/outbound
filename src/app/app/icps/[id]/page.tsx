import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { startLeadRunAction, updateIcpAction } from "@/actions/icps";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

const RUN_TONE = { queued: "zinc", sourcing: "amber", verifying: "amber", qualifying: "amber", review: "green", pushed: "green", failed: "red" } as const;

export const metadata = { title: "ICP" };

export default async function IcpDetailPage({ params }: PageProps<"/app/icps/[id]">) {
  const { clientId } = await requireClientScope();
  const { id } = await params;
  const icp = await db.query.icps.findFirst({ where: and(eq(schema.icps.id, id), eq(schema.icps.clientId, clientId)) });
  if (!icp) notFound();
  const runs = await db.query.leadRuns.findMany({ where: eq(schema.leadRuns.icpId, id), orderBy: desc(schema.leadRuns.createdAt), limit: 10 });
  const s = icp.spec;
  const lines = (a: string[]) => a.join("\n");

  return (
    <>
      <PageHeader title={icp.name} subtitle={`ICP · version ${icp.version}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <ActionForm action={updateIcpAction} submitLabel="Save changes" hidden={{ id: icp.id }}>
              <Field label="Name">
                <Input name="name" defaultValue={icp.name} required />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Industries" help="One per line">
                  <Textarea name="industries" rows={4} defaultValue={lines(s.industries)} />
                </Field>
                <Field label="Job titles" help="One per line, most senior first">
                  <Textarea name="titles" rows={4} defaultValue={lines(s.titles)} />
                </Field>
                <Field label="Company sizes" help="Employee bands, e.g. 51-200">
                  <Textarea name="companySizes" rows={3} defaultValue={lines(s.companySizes)} />
                </Field>
                <Field label="Geographies" help="ISO country codes, e.g. GB, DE">
                  <Textarea name="geographies" rows={3} defaultValue={lines(s.geographies)} />
                </Field>
                <Field label="Pain points">
                  <Textarea name="painPoints" rows={4} defaultValue={lines(s.painPoints)} />
                </Field>
                <Field label="Disqualifiers">
                  <Textarea name="disqualifiers" rows={4} defaultValue={lines(s.disqualifiers)} />
                </Field>
              </div>
              <Field label="Value proposition">
                <Textarea name="valueProposition" rows={2} defaultValue={s.valueProposition} required />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Original brief">
            <p className="whitespace-pre-wrap text-sm text-zinc-600">{icp.prompt}</p>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Source leads">
            <ActionForm action={startLeadRunAction} submitLabel="Start lead run" hidden={{ icpId: icp.id }}>
              <Field label="How many leads?" help="Sourced, verified and scored before you review them.">
                <Input name="count" type="number" min={10} max={500} defaultValue={50} />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Recent runs">
            {runs.length === 0 ? (
              <p className="text-sm text-zinc-500">No runs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <Link href={`/app/leads/runs/${r.id}`} className="hover:underline">
                      {r.createdAt.toLocaleString()}
                    </Link>
                    <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
