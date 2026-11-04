import { asc, desc, isNull } from "drizzle-orm";
import { mapAccountAction, runHealthCheckNowAction } from "@/actions/admin-health";
import { AlertsBanner } from "@/components/alerts-banner";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Button, Card, PageHeader, Select, Table } from "@/components/ui";
import { db, schema } from "@/db";

const TONE = { healthy: "green", warning: "amber", critical: "red", unknown: "zinc" } as const;

export default async function HealthPage() {
  const [accounts, clients, alerts] = await Promise.all([
    db.query.emailAccounts.findMany({ orderBy: asc(schema.emailAccounts.email) }),
    db.query.clients.findMany({ columns: { id: true, name: true }, orderBy: asc(schema.clients.name) }),
    db.query.alerts.findMany({ where: isNull(schema.alerts.acknowledgedAt), orderBy: desc(schema.alerts.createdAt), limit: 30 }),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader
        title="Email health"
        subtitle="Sending accounts in the agency Instantly workspace, checked daily. Alerts stay until dismissed."
        actions={
          <form action={runHealthCheckNowAction}>
            <Button variant="secondary">Run checks now</Button>
          </form>
        }
      />
      <AutoRefresh active={accounts.length === 0} ms={5000} />
      <AlertsBanner alerts={alerts} />
      <Table head={["Account", "Client", "Health", "Warm-up", "Today", "Bounce", "Reply", "Issues", "Checked"]}>
        {accounts.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2 font-medium">{a.email}</td>
            <td className="px-4 py-2">
              <form action={mapAccountAction} className="flex items-center gap-1">
                <input type="hidden" name="email" value={a.email} />
                <Select name="clientId" defaultValue={a.clientId ?? ""} className="h-7 w-40 text-xs">
                  <option value="">— agency —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <Button variant="ghost" className="h-7 px-2 text-xs">Save</Button>
              </form>
            </td>
            <td className="px-4 py-2"><Badge tone={TONE[a.health]}>{a.health}</Badge></td>
            <td className="px-4 py-2">{a.warmupEnabled ? `on · ${a.warmupScore ?? "—"}` : "off"}</td>
            <td className="px-4 py-2">{a.sentToday}/{a.dailyLimit}</td>
            <td className="px-4 py-2">{(a.bounceRate / 100).toFixed(1)}%</td>
            <td className="px-4 py-2">{(a.replyRate / 100).toFixed(1)}%</td>
            <td className="px-4 py-2 text-xs text-zinc-600">{a.issues.join("; ") || "—"}</td>
            <td className="px-4 py-2 text-xs text-zinc-500">{a.lastCheckedAt?.toLocaleString() ?? "—"}</td>
          </tr>
        ))}
        {accounts.length === 0 ? (
          <tr><td colSpan={9} className="px-4 py-6 text-center text-zinc-500">No accounts yet. The daily check runs at 06:15 UTC, or run it now.</td></tr>
        ) : null}
      </Table>
      {alerts.length === 0 ? <Card className="mt-6"><p className="text-sm text-zinc-500">No open alerts. {clientName.size} clients monitored.</p></Card> : null}
    </>
  );
}
