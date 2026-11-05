"use client";

import { useActionState, useState } from "react";
import { approveDraftAction } from "@/actions/inbox";
import { Alert, Button } from "@/components/ui";
import type { ReplyDraft } from "@/db/schema";

export function DraftReview({ draft }: { draft: ReplyDraft }) {
  const [state, formAction, pending] = useActionState(approveDraftAction, undefined);
  const [text, setText] = useState(draft.draftText);
  const edited = text.trim() !== draft.draftText.trim();
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="draftId" value={draft.id} />
      <textarea name="text" value={text} onChange={(e) => setText(e.target.value)} rows={10} className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-900" />
      {draft.proposedSlots.length ? (
        <label className="block text-sm">
          <span className="font-medium">Book a meeting when sending</span>
          <select name="slot" className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm" defaultValue={draft.wantsMeeting ? "0" : ""}>
            <option value="">Do not book (lead has not chosen a time)</option>
            {draft.proposedSlots.map((s, i) => (
              <option key={s.startAt} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Alert state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : edited ? "Send edited reply" : "Approve and send"}
        </Button>
      </div>
    </form>
  );
}
