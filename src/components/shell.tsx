import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { MobileNav, SideNav } from "./side-nav";
import { Logo } from "./ui";

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
  const initials =
    user.name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col bg-stone-900 p-4 md:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <Logo size={36} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-tight text-white">AI Outbound</p>
            <p className="truncate text-xs text-stone-400">{area}</p>
          </div>
        </div>
        <SideNav items={nav} />
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white" aria-hidden>
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-stone-400">{user.email}</p>
            </div>
          </div>
          <form action={logoutAction} className="mt-3">
            <button className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-stone-400 transition-colors duration-150 hover:bg-white/5 hover:text-white">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-1 bg-stone-900 px-4 py-2 md:hidden">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="font-semibold text-white">AI Outbound</span>
            <span className="truncate text-xs text-stone-400">{area}</span>
          </div>
          <MobileNav items={nav} />
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
