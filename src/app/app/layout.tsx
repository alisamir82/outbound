import { eq } from "drizzle-orm";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const nav = [
    { href: "/app", label: "Dashboard" },
    { href: "/app/team", label: "Team" },
  ];
  let banner = null;
  if (user.role === "super_admin") {
    // "View as client" mode: the `as` param is carried by each page, the layout only shows the banner.
    banner = (
      <div className="bg-amber-100 px-4 py-2 text-sm text-amber-900">
        Viewing as a client (super admin).{" "}
        <Link href="/admin/clients" className="underline">
          Back to admin
        </Link>
      </div>
    );
  } else if (user.clientId) {
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, user.clientId), columns: { name: true } });
    nav.unshift({ href: "/app", label: client?.name ?? "Workspace" });
    nav.splice(1, 1);
  }
  return (
    <Shell nav={nav} area="Client workspace" user={user} banner={banner}>
      {children}
    </Shell>
  );
}
