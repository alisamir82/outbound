import { decideProposalAction } from "@/actions/reports";
import { Badge, Button } from "@/components/ui";
import type { OptimizationProposal } from "@/db/schema";

const TONE = { proposed: "amber", approved: "green", applied: "green", rejected: "zinc", failed: "red" } as const;

function describe(p: OptimizationProposal) {
  const c = p.change;
  if (c.kind === "subject_line" || c.kind === "body")
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <div><div className="text-xs uppercase text-zinc-500">Step {c.step + 1} · current</div><pre className="whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{c.from}</pre></div>
        <div><div className="text-xs uppercase text-zinc-500">Proposed</div><pre className="whitespace-pre-wrap rounded bg-emerald-50 p-2 text-xs">{c.to}</pre></div>
      </div>
    );
  if (c.kind === "timing") return <p className="text-sm">Step {c.step + 1} delay: {c.fromDays} days → <strong>{c.toDays} days</strong></p>;
  return (
    <p className="text-sm">
      ICP {c.field}: {c.add.length ? <>add <strong>{c.add.join(", ")}</strong></> : null}
      {c.add.length && c.remove.length ? "; " : ""}
      {c.remove.length ? <>remove <strong>{c.remove.join(", ")}</strong></> : null}
    </p>
  );
}

export function ProposalList({ proposals, canManage, campaignNames }: { proposals: OptimizationProposal[]; canManage: boolean; campaignNames?: Map<string, string> }) {
  if (proposals.length === 0) return <p className="text-sm text-zinc-500">No proposals. Claude only suggests changes when the data supports them.</p>;
  return (
    <ul className="space-y-4">
      {proposals.map((p) => (
        <li key={p.id} className="rounded-md border border-zinc-200 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{p.title}</span>
              {campaignNames && p.campaignId ? <span className="ml-2 text-xs text-zinc-500">{campaignNames.get(p.campaignId)}</span> : null}
            </div>
            <Badge tone={TONE[p.status]}>{p.status}</Badge>
          </div>
          <p className="mb-1 text-sm text-zinc-700">{p.rationale}</p>
          <p className="mb-3 text-xs text-zinc-500">Expected: {p.expectedImpact}</p>
          {describe(p)}
          {p.error ? <p className="mt-2 text-xs text-red-600">{p.error}</p> : null}
          {canManage && p.status === "proposed" ? (
            <div className="mt-3 flex gap-2">
              <form action={decideProposalAction.bind(null, p.id, "approved")}>
                <Button className="h-8 text-xs">Approve and apply</Button>
              </form>
              <form action={decideProposalAction.bind(null, p.id, "rejected")}>
                <Button variant="secondary" className="h-8 text-xs">Reject</Button>
              </form>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
