import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Soft brand glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(ellipse at center, #6366f1 0%, #8b5cf6 45%, transparent 70%)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={48} />
          <div className="text-center">
            <p className="text-xl font-bold tracking-tight text-slate-900">AI Outbound</p>
            <p className="text-sm text-slate-500">Agentic outbound, from lead to meeting</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">{children}</div>
      </div>
    </div>
  );
}
