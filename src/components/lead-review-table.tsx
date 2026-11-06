"use client";

import { useActionState } from "react";
import { decideLeadsAction } from "@/actions/leads";
import { Alert, Badge, Button } from "@/components/ui";
import type { Lead } from "@/db/schema";

const STATUS_TONE: Record<Lead["status"], "zinc" | "green" | "amber" | "red"> = {
  new: "amber",
  approved: "green",
  pushed: "green",
  replied: "green",
  meeting: "green",
  unsubscribed: "red",
  bounced: "red",
  rejected: "red",
};

export function LeadReviewTable({ leads, reviewable }: { leads: Lead[]; reviewable: boolean }) {
  const [state, formAction, pending] = useActionState(decideLeadsAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      {reviewable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="decision" value="approve" disabled={pending}>
            Approve selected
          </Button>
          <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
            Reject selected
          </Button>
          <Alert state={state} />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              {reviewable ? <th className="px-3 py-2"><input type="checkbox" className="checkbox" aria-label="select all" onChange={(e) => document.querySelectorAll<HTMLInputElement>("input[name=leadId]").forEach((c) => (c.checked = e.target.checked))} /></th> : null}
              <th className="px-3 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Qualification</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {leads.map((l) => (
              <tr key={l.id} className={l.status === "rejected" ? "opacity-50" : ""}>
                {reviewable ? (
                  <td className="px-3 py-2">
                    <input type="checkbox" className="checkbox" name="leadId" value={l.id} aria-label={`Select ${l.firstName ?? ""} ${l.lastName ?? ""} (${l.email})`} />
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {l.firstName} {l.lastName}
                  </div>
                  <div className="text-xs text-zinc-500">{l.title}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{l.company}</div>
                  <div className="text-xs text-zinc-500">{l.country}</div>
                </td>
                <td className="px-3 py-2">
                  {l.score ? <span className={l.score >= 4 ? "font-semibold text-emerald-700" : l.score >= 3 ? "text-zinc-800" : "text-zinc-400"}>{"★".repeat(l.score)}</span> : "—"}
                </td>
                <td className="max-w-md px-3 py-2 text-zinc-700">{l.qualification}</td>
                <td className="px-3 py-2">
                  <div className="text-xs">{l.email}</div>
                  <div className="text-xs text-zinc-400">{l.verification}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[l.status]}>{l.status}</Badge>
                  {l.pushError ? <div className="text-xs text-red-600">{l.pushError}</div> : null}
                </td>
              </tr>
            ))}
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                  No leads.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </form>
  );
}
