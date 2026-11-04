import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-400",
    secondary: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-zinc-700 hover:bg-zinc-100",
  }[variant];
  return <button className={cn("inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition", styles, className)} {...props} />;
}

export function LinkButton({ className, href, children, variant = "primary" }: { className?: string; href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const styles = variant === "primary" ? "bg-zinc-900 text-white hover:bg-zinc-700" : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50";
  return (
    <Link href={href} className={cn("inline-flex h-9 items-center rounded-md px-3 text-sm font-medium", styles, className)}>
      {children}
    </Link>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-100", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn("h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-zinc-900", className)} {...props} />;
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      {children}
      {help ? <span className="block text-xs text-zinc-500">{help}</span> : null}
    </label>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-zinc-200 bg-white", className)}>
      {title ? (
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Alert({ state }: { state?: { error?: string; success?: string } }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p className={cn("rounded-md px-3 py-2 text-sm", state.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")} role="alert">
      {state.error ?? state.success}
    </p>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "green" | "amber" | "red" }) {
  const t = { zinc: "bg-zinc-100 text-zinc-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800" }[tone];
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  );
}
