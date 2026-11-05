import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { Button } from "./ui";

export function Shell({
  nav,
  area,
  user,
  children,
  banner,
}: {
  nav: { href: string; label: string }[];
  area: string;
  user: { name: string; email: string; role: string };
  children: ReactNode;
  banner?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <p className="text-base font-semibold text-zinc-900">AI Outbound</p>
          <p className="text-xs text-zinc-500">{area}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="truncate text-sm font-medium text-zinc-900">{user.name}</p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
          <form action={logoutAction} className="mt-2">
            <Button variant="ghost" className="h-8 px-2">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 md:hidden">
          <span className="font-semibold">AI Outbound</span>
          <nav className="flex gap-3 overflow-x-auto text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
