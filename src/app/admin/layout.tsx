import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/session";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/team", label: "Platform team" },
  { href: "/admin/settings/integrations", label: "Integrations" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("super_admin");
  return (
    <Shell nav={NAV} area="Platform admin" user={user}>
      {children}
    </Shell>
  );
}
