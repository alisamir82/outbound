import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, PageHeader, Table } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

const FILTERS = [
  { key: "attention", label: "Needs attention", statuses: ["awaiting_approval", "escalated"] },
  { key: "open", label: "Open", statuses: ["open"] },
  { key: "replied", label: "Replied", statuses: ["replied"] },
  { key: "all", label: "All", statuses: [] },
] as const;

const TONE = { open: "zinc", awaiting_approval: "amber", escalated: "red", replied: "green", closed: "zinc", unsubscribed: "red" } as const;

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: PageProps<"/app/inbox">) {
  const { clientId } = await requireClientScope();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filter) ?? FILTERS[0];
  const rows = await db.query.threads.findMany({
    where: and(eq(schema.threads.clientId, clientId), filter.statuses.length ? inArray(schema.threads.status, [...filter.statuses]) : undefined),
    with: { lead: true, campaign: { columns: { name: true, autonomousMode: true } } },
    orderBy: desc(schema.threads.lastEventAt),
    limit: 200,
  });
  return (
    <>
      <PageHeader title="Inbox" subtitle="Replies to your campaigns. Claude drafts, you approve. Autonomous campaigns send within guardrails." />
      <AutoRefresh active={filter.key === "attention"} ms={8000} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/app/inbox?filter=${f.key}`} className={`rounded-full px-3 py-1 ${filter.key === f.key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      <Table head={["Lead", "Campaign", "Last reply", "Classification", "Status", "Updated"]}>
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="px-4 py-2">
              <Link href={`/app/inbox/${t.id}`} className="font-medium hover:underline">
                {[t.lead.firstName, t.lead.lastName].filter(Boolean).join(" ") || t.lead.email}
              </Link>
              <div className="text-xs text-zinc-500">{t.lead.company}</div>
            </td>
            <td className="px-4 py-2 text-zinc-600">
              {t.campaign?.name ?? "—"}
              {t.campaign?.autonomousMode ? <span className="ml-1 text-xs text-amber-700">auto</span> : null}
            </td>
            <td className="px-4 py-2 text-zinc-500">{t.lastInboundAt ? t.lastInboundAt.toLocaleString() : "—"}</td>
            <td className="px-4 py-2">{t.lastClassification ? <Badge>{t.lastClassification.replace("_", " ")}</Badge> : "—"}</td>
            <td className="px-4 py-2">
              <Badge tone={TONE[t.status]}>{t.status.replace("_", " ")}</Badge>
            </td>
            <td className="px-4 py-2 text-zinc-500">{t.lastEventAt.toLocaleString()}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
              Nothing here. {filter.key === "attention" ? "No drafts are waiting for you." : ""}
            </td>
          </tr>
        ) : null}
      </Table>
    </>
  );
}
