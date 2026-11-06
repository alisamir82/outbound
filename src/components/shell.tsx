import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { TopNav } from "./top-nav";
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
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 bg-brand-900">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 pt-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={32} />
            <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-white">AI Outbound</span>
              <span className="truncate border-l border-white/20 pl-2.5 text-xs text-brand-300">{area}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden items-center gap-2 sm:flex" title={user.email}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white" aria-hidden>
                {initials}
              </span>
              <span className="max-w-40 truncate text-sm text-brand-100">{user.name}</span>
            </span>
            <form action={logoutAction}>
              <button
                aria-label="Sign out"
                title="Sign out"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-200 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl px-3 pb-2.5 pt-2 md:px-5">
          <TopNav items={nav} />
        </div>
      </header>
      {banner}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 p-4 md:px-8 md:py-10">
        {children}
      </main>
    </div>
  );
}
