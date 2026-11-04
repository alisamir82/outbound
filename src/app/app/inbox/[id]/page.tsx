import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { closeThreadAction, rejectDraftAction, unsubscribeThreadAction } from "@/actions/inbox";
import { AutoRefresh } from "@/components/auto-refresh";
import { DraftReview } from "@/components/draft-review";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export default async function ThreadPage({ params }: PageProps<"/app/inbox/[id]">) {
  const { clientId } = await requireClientScope();
  const { id } = await params;
  const thread = await db.query.threads.findFirst({
    where: and(eq(schema.threads.id, id), eq(schema.threads.clientId, clientId)),
    with: { lead: true, campaign: true, messages: { orderBy: schema.messages.sentAt }, drafts: { orderBy: desc(schema.replyDrafts.createdAt), limit: 5 } },
  });
  if (!thread) notFound();
  const draft = thread.drafts.find((d) => d.status === "pending" || d.status === "escalated") ?? null;
  const meetings = await db.query.meetings.findMany({ where: eq(schema.meetings.threadId, id), orderBy: desc(schema.meetings.startAt) });
  const chunkIds = [...new Set([...(draft?.kbChunkIds ?? []), ...thread.messages.flatMap((m) => m.kbChunkIds)])];
  const sources = chunkIds.length
    ? await db
        .select({ id: schema.kbChunks.id, heading: schema.kbChunks.heading, text: schema.kbChunks.chunkText, doc: schema.kbDocuments.name })
        .from(schema.kbChunks)
        .innerJoin(schema.kbDocuments, eq(schema.kbDocuments.id, schema.kbChunks.documentId))
        .where(inArray(schema.kbChunks.id, chunkIds))
    : [];
  const waitingForAgent = thread.status === "open" && thread.messages.at(-1)?.direction === "inbound" && !draft;
  const lead = thread.lead;

  return (
    <>
      <PageHeader
        title={[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email}
        subtitle={
          <>
            {lead.title} at {lead.company} · {lead.email} ·{" "}
            <Link href="/app/inbox" className="underline">
              back to inbox
            </Link>
          </>
        }
        actions={<Badge tone={thread.status === "escalated" ? "red" : thread.status === "awaiting_approval" ? "amber" : "zinc"}>{thread.status.replace("_", " ")}</Badge>}
      />
      <AutoRefresh active={waitingForAgent} ms={3000} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={thread.subject ?? "Conversation"}>
            <ol className="space-y-4">
              {thread.messages.map((m) => (
                <li key={m.id} className={`rounded-md p-3 text-sm ${m.direction === "inbound" ? "bg-zinc-50" : "bg-emerald-50"}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-800">{m.direction === "inbound" ? lead.firstName ?? "Lead" : m.sender === "agent" ? "Claude (auto)" : m.sender === "human" ? "You" : "Sequence"}</span>
                    <time>{m.sentAt.toLocaleString()}</time>
                    {m.classification ? <Badge>{m.classification.replace("_", " ")}{m.confidence != null ? ` · ${m.confidence}%` : ""}</Badge> : null}
                  </div>
                  <p className="whitespace-pre-wrap">{m.bodyText}</p>
                </li>
              ))}
            </ol>
            {waitingForAgent ? <p className="mt-3 text-sm text-zinc-500">Claude is drafting a reply…</p> : null}
          </Card>

          {draft ? (
            <Card
              title={draft.status === "escalated" ? "Escalated: needs a human" : "Suggested reply"}
              actions={
                <Badge tone={draft.status === "escalated" ? "red" : "amber"}>
                  {draft.classification.replace("_", " ")} · {draft.confidence}%
                </Badge>
              }
            >
              {draft.escalationReasons.length ? (
                <ul className="mb-3 list-disc pl-5 text-xs text-zinc-600">
                  {draft.escalationReasons
                    .filter((r) => r !== "Campaign is in approval mode")
                    .map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                </ul>
              ) : null}
              <DraftReview draft={draft} />
              <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                <form action={rejectDraftAction.bind(null, draft.id)}>
                  <Button variant="secondary" className="h-8 text-xs">
                    Discard draft
                  </Button>
                </form>
                <form action={unsubscribeThreadAction.bind(null, thread.id)}>
                  <Button variant="secondary" className="h-8 text-xs">
                    Mark unsubscribed
                  </Button>
                </form>
                <form action={closeThreadAction.bind(null, thread.id)}>
                  <Button variant="ghost" className="h-8 text-xs">
                    Close thread
                  </Button>
                </form>
              </div>
              {draft.reasoning ? <p className="mt-3 text-xs text-zinc-400">{draft.reasoning}</p> : null}
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card title="Lead">
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-zinc-500">Campaign: </dt><dd className="inline">{thread.campaign?.name ?? "—"}{thread.campaign?.autonomousMode ? " (autonomous)" : ""}</dd></div>
              <div><dt className="inline text-zinc-500">Country: </dt><dd className="inline">{lead.country ?? "—"}</dd></div>
              <div><dt className="inline text-zinc-500">Score: </dt><dd className="inline">{lead.score ? "★".repeat(lead.score) : "—"}</dd></div>
              <div><dt className="inline text-zinc-500">Agent replies: </dt><dd className="inline">{thread.agentReplyCount}</dd></div>
            </dl>
            {lead.qualification ? <p className="mt-2 text-xs text-zinc-500">{lead.qualification}</p> : null}
          </Card>
          {meetings.length ? (
            <Card title="Meetings">
              <ul className="space-y-1 text-sm">
                {meetings.map((m) => (
                  <li key={m.id}>
                    {m.startAt.toLocaleString()} <span className="text-xs text-zinc-500">· {m.provider} · by {m.bookedBy}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {sources.length ? (
            <Card title="Knowledge base sources used">
              <ul className="space-y-3 text-xs">
                {sources.map((s) => (
                  <li key={s.id}>
                    <div className="font-medium text-zinc-800">{s.doc}{s.heading ? ` › ${s.heading}` : ""}</div>
                    <p className="line-clamp-4 text-zinc-600">{s.text}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {thread.drafts.filter((d) => d.id !== draft?.id).length ? (
            <Card title="Draft history">
              <ul className="space-y-1 text-xs text-zinc-600">
                {thread.drafts
                  .filter((d) => d.id !== draft?.id)
                  .map((d) => (
                    <li key={d.id}>
                      {d.createdAt.toLocaleString()} · {d.classification} · {d.status.replace("_", " ")}
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
