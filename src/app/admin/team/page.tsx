import { asc, eq } from "drizzle-orm";
import { InviteForm } from "@/components/invite-form";
import { Card, PageHeader } from "@/components/ui";
import { UserTable } from "@/components/user-table";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Platform team" };

export default async function PlatformTeamPage() {
  const admin = await requireRole("super_admin");
  const users = await db.query.users.findMany({ where: eq(schema.users.role, "super_admin"), orderBy: asc(schema.users.createdAt) });
  return (
    <>
      <PageHeader title="Platform team" subtitle="Super admins can manage every client." />
      <Card>
        <div className="space-y-4">
          <UserTable users={users} currentUserId={admin.id} />
          <InviteForm clientId={null} roles={[{ value: "super_admin", label: "Super admin" }]} />
        </div>
      </Card>
    </>
  );
}
