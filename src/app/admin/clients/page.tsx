import { asc, count, eq } from "drizzle-orm";
import Link from "next/link";
import { viewAsClientAction } from "@/actions/view-as";
import { db, schema } from "@/db";
import { Badge, LinkButton, PageHeader, Table } from "@/components/ui";

const tone = { active: "green", onboarding: "amber", suspended: "red" } as const;

export default async function ClientsPage() {
  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      slug: schema.clients.slug,
      status: schema.clients.status,
      budget: schema.clients.tokenBudgetMonthlyUsd,
      createdAt: schema.clients.createdAt,
      users: count(schema.users.id),
    })
    .from(schema.clients)
    .leftJoin(schema.users, eq(schema.users.clientId, schema.clients.id))
    .groupBy(schema.clients.id)
    .orderBy(asc(schema.clients.name));

  return (
    <>
      <PageHeader title="Clients" subtitle={`${rows.length} total`} actions={<LinkButton href="/admin/clients/new">New client</LinkButton>} />
      <Table head={["Name", "Status", "Users", "Monthly AI budget", "Created", ""]}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2">
              <Link href={`/admin/clients/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                {c.name}
              </Link>
              <span className="ml-2 text-xs text-zinc-400">{c.slug}</span>
            </td>
            <td className="px-4 py-2">
              <Badge tone={tone[c.status]}>{c.status}</Badge>
            </td>
            <td className="px-4 py-2">{c.users}</td>
            <td className="px-4 py-2">${c.budget}</td>
            <td className="px-4 py-2 text-zinc-500">{c.createdAt.toLocaleDateString()}</td>
            <td className="px-4 py-2 text-right">
              <form action={viewAsClientAction.bind(null, c.id)}>
                <button className="text-xs text-zinc-600 underline">View as client</button>
              </form>
            </td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
              No clients yet.
            </td>
          </tr>
        ) : null}
      </Table>
    </>
  );
}
