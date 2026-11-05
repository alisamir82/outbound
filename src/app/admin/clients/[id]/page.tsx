import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateClientAction } from "@/actions/clients";
import { ClientFields } from "@/components/client-form";
import { ActionForm } from "@/components/forms";
import { InviteForm } from "@/components/invite-form";
import { viewAsClientAction } from "@/actions/view-as";
import { Button, Card, PageHeader } from "@/components/ui";
import { UserTable } from "@/components/user-table";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Client" };

export default async function ClientDetailPage({ params }: PageProps<"/admin/clients/[id]">) {
  const admin = await requireRole("super_admin");
  const { id } = await params;
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, id) });
  if (!client) notFound();
  const users = await db.query.users.findMany({ where: eq(schema.users.clientId, id), orderBy: asc(schema.users.createdAt) });
  const steps = client.onboarding;

  return (
    <>
      <PageHeader title={client.name} subtitle={`Client · ${client.status}`} actions={
          <form action={viewAsClientAction.bind(null, client.id)}>
            <Button variant="secondary">View as client</Button>
          </form>
        } />
      <div className="space-y-6">
        <Card title="Onboarding progress">
          <ul className="grid gap-2 text-sm md:grid-cols-4">
            {[
              ["Company profile", steps.profile],
              ["Knowledge base", steps.knowledgeBase],
              ["Calendar connected", steps.calendar],
              ["First ICP", steps.icp],
            ].map(([label, done]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <span className={done ? "text-emerald-600" : "text-zinc-300"}>●</span> {label}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Users">
          <div className="space-y-4">
            <UserTable users={users} currentUserId={admin.id} />
            <InviteForm
              clientId={client.id}
              roles={[
                { value: "client_admin", label: "Client admin" },
                { value: "client_user", label: "Client user" },
              ]}
            />
          </div>
        </Card>
        <Card title="Settings">
          <ActionForm action={updateClientAction} submitLabel="Save" hidden={{ id: client.id }}>
            <ClientFields client={client} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
