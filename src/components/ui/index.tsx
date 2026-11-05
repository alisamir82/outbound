import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Brand mark: forest-green tile with a two-tone folded paper plane and motion trail. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span style={{ width: size, height: size }} className={cn("inline-flex shrink-0 overflow-hidden rounded-xl shadow-sm", className)} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <rect width="64" height="64" fill="#2a5a3c" />
        {/* subtle corner light for depth */}
        <path d="M64 0v64H0Z" fill="#ffffff" opacity="0.05" />
        {/* motion trail */}
        <path d="M9 56c8-6 14-11 20-17" stroke="#6aa87e" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="0.5 7.5" />
        {/* plane: wing facet (light) + body facet (white) */}
        <path d="M56 8 8 29l18.5 7.5Z" fill="#b7d6c1" />
        <path d="M56 8 26.5 36.5 31 54l8.5-10.5Z" fill="#ffffff" />
      </svg>
    </span>
  );
}

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-500 disabled:bg-stone-300 disabled:shadow-none",
    secondary: "border border-stone-300 bg-white text-stone-800 shadow-sm hover:border-stone-400 hover:bg-stone-50",
    danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-500",
    ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({ className, href, children, variant = "primary" }: { className?: string; href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-brand-600 text-white shadow-sm hover:bg-brand-500"
      : "border border-stone-300 bg-white text-stone-800 shadow-sm hover:border-stone-400 hover:bg-stone-50";
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        styles,
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 shadow-sm outline-none transition-colors duration-150 placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-100",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full cursor-pointer rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-900 shadow-sm outline-none transition-colors duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
      {help ? <span className="block text-xs text-stone-500">{help}</span> : null}
    </label>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-stone-200 bg-white shadow-sm", className)}>
      {title ? (
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Alert({ state }: { state?: { error?: string; success?: string } }) {
  if (!state?.error && !state?.success) return null;
  const error = Boolean(state.error);
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
      role="alert"
    >
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {error ? (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </>
        ) : (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="m9 11 3 3L22 4" />
          </>
        )}
      </svg>
      {state.error ?? state.success}
    </p>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "green" | "amber" | "red" }) {
  const t = {
    zinc: "bg-stone-100 text-stone-700 ring-stone-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
  }[tone];
  const dot = { zinc: "bg-stone-400", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500" }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", t)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      {children}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-brand-600" aria-hidden />
      <p className="pl-2 text-xs font-medium uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-1 pl-2 text-2xl font-bold tracking-tight text-stone-900 tabular-nums">{value}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50/80 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 [&>tr]:transition-colors [&>tr:hover]:bg-stone-50/60">{children}</tbody>
      </table>
    </div>
  );
}
