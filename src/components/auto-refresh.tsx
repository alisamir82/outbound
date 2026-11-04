"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server component tree every `ms` while `active` is true. */
export function AutoRefresh({ active, ms = 3000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return active ? <p className="text-xs text-zinc-500">Updating automatically…</p> : null;
}
