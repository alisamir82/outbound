import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { LinkButton, PageHeader, Table } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export const metadata = { title: "ICPs" };

export default async function IcpsPage() {
  const { clientId } = await requireClientScope();
  const rows = await db
    .select({ id: schema.icps.id, name: schema.icps.name, version: schema.icps.version, createdAt: schema.icps.createdAt, leads: count(schema.leads.id) })
    .from(schema.icps)
    .leftJoin(schema.leads, eq(schema.leads.icpId, schema.icps.id))
    .where(eq(schema.icps.clientId, clientId))
    .groupBy(schema.icps.id)
    .orderBy(desc(schema.icps.createdAt));
  return (
    <>
      <PageHeader title="Ideal Customer Profiles" subtitle="Each ICP drives its own lead runs and campaigns." actions={<LinkButton href="/app/icps/new">New ICP</LinkButton>} />
      <Table head={["Name", "Version", "Leads", "Created"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-2">
              <Link href={`/app/icps/${r.id}`} className="font-medium hover:underline">
                {r.name}
              </Link>
            </td>
            <td className="px-4 py-2">v{r.version}</td>
            <td className="px-4 py-2">{r.leads}</td>
            <td className="px-4 py-2 text-zinc-500">{r.createdAt.toLocaleDateString()}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
              No ICPs yet. Describe what you sell and Claude will draft one.
            </td>
          </tr>
        ) : null}
      </Table>
    </>
  );
}
