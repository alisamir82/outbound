"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./ui";

/* Lucide outline paths, keyed by nav label. Unknown labels get a dot. */
const ICONS: Record<string, ReactNode> = {
  Dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  Overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  ICPs: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  Leads: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  Campaigns: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  Inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  Reports: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  "Knowledge base": (
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  "Reply settings": (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </>
  ),
  "AI skills": (
    <>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </>
  ),
  Team: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "Platform team": (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  Clients: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  "Email health": (
    <>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </>
  ),
  "AI spend": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 18V6" />
    </>
  ),
  Integrations: (
    <>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </>
  ),
};

function NavIcon({ label }: { label: string }) {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[label] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

export function SideNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // Active = the longest href that is the current path or one of its ancestors.
  const active = items.reduce<string | null>((best, n) => {
    const match = pathname === n.href || pathname.startsWith(n.href + "/");
    return match && (!best || n.href.length > best.length) ? n.href : best;
  }, null);
  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {items.map((n) => {
        const isActive = n.href === active;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
              isActive ? "bg-brand-600 font-medium text-white shadow-sm" : "text-stone-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <NavIcon label={n.label} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = items.reduce<string | null>((best, n) => {
    const match = pathname === n.href || pathname.startsWith(n.href + "/");
    return match && (!best || n.href.length > best.length) ? n.href : best;
  }, null);
  return (
    <nav className="flex gap-1 overflow-x-auto py-1 text-sm">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={cn(
            "flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 transition-colors duration-150",
            n.href === active ? "bg-brand-600 font-medium text-white" : "text-stone-300 hover:bg-white/10 hover:text-white",
          )}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
