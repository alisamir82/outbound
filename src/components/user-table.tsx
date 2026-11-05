import { setUserActiveAction } from "@/actions/clients";
import { Badge, Button, Table } from "@/components/ui";
import type { User } from "@/db/schema";

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", client_admin: "Client admin", client_user: "Client user" };

export function UserTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  return (
    <Table head={["Name", "Email", "Role", "Status", "Last login", ""]}>
      {users.map((u) => (
        <tr key={u.id}>
          <td className="px-4 py-2 font-medium">{u.name}</td>
          <td className="px-4 py-2 text-zinc-600">{u.email}</td>
          <td className="px-4 py-2">{ROLE_LABEL[u.role]}</td>
          <td className="px-4 py-2">
            {!u.passwordHash ? <Badge tone="amber">Invited</Badge> : u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
          </td>
          <td className="px-4 py-2 text-zinc-500">{u.lastLoginAt ? u.lastLoginAt.toLocaleString() : "—"}</td>
          <td className="px-4 py-2 text-right">
            {u.id !== currentUserId && u.passwordHash ? (
              <form action={setUserActiveAction.bind(null, u.id, !u.isActive)}>
                <Button variant="ghost" className="h-7 px-2 text-xs">
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </form>
            ) : null}
          </td>
        </tr>
      ))}
      {users.length === 0 ? (
        <tr>
          <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
            No users yet.
          </td>
        </tr>
      ) : null}
    </Table>
  );
}
