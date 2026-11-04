import { asc, eq } from "drizzle-orm";
import { InviteForm } from "@/components/invite-form";
import { Card, PageHeader } from "@/components/ui";
import { UserTable } from "@/components/user-table";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export default async function TeamPage() {
  const { user, clientId, canManage } = await requireClientScope();
  const users = await db.query.users.findMany({ where: eq(schema.users.clientId, clientId), orderBy: asc(schema.users.createdAt) });
  return (
    <>
      <PageHeader title="Team" subtitle={canManage ? "Invite colleagues and manage access." : "Your workspace members."} />
      <Card>
        <div className="space-y-4">
          <UserTable users={canManage ? users : users.map((u) => ({ ...u, passwordHash: u.passwordHash ? "x" : null }))} currentUserId={user.id} />
          {canManage ? (
            <InviteForm
              clientId={clientId}
              roles={[
                { value: "client_user", label: "Client user" },
                { value: "client_admin", label: "Client admin" },
              ]}
            />
          ) : null}
        </div>
      </Card>
    </>
  );
}
