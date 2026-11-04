import { eq } from "drizzle-orm";
import { exitViewAsAction } from "@/actions/view-as";
import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { user, clientId, viewingAs } = await requireClientScope();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId), columns: { name: true } });
  const nav = [
    { href: "/app", label: "Dashboard" },
    { href: "/app/icps", label: "ICPs" },
    { href: "/app/leads", label: "Leads" },
    { href: "/app/campaigns", label: "Campaigns" },
    { href: "/app/inbox", label: "Inbox" },
    { href: "/app/reports", label: "Reports" },
    { href: "/app/knowledge", label: "Knowledge base" },
    { href: "/app/settings/replies", label: "Reply settings" },
    { href: "/app/settings/skills", label: "AI skills" },
    { href: "/app/team", label: "Team" },
  ];
  const banner = viewingAs ? (
    <form action={exitViewAsAction} className="flex items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>Viewing <strong>{client?.name}</strong> as super admin.</span>
      <button className="underline">Back to admin</button>
    </form>
  ) : null;
  return (
    <Shell nav={nav} area={client?.name ?? "Client workspace"} user={user} banner={banner}>
      {children}
    </Shell>
  );
}
