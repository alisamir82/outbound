import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-brand-100/70 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
      <div className="animate-fade-up relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-4">
          <Logo size={64} className="transition-transform duration-300 ease-out hover:rotate-3 hover:scale-105" />
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight">
              <span className="text-brand-700">AI</span> <span className="text-stone-900">Outbound</span>
            </p>
            <p className="mt-1 text-sm text-stone-500">Agentic outbound, from lead to meeting</p>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg shadow-stone-900/5 transition-shadow duration-300 hover:shadow-xl hover:shadow-brand-900/10">{children}</div>
      </div>
    </div>
  );
}
