import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-4">
          <Logo size={64} />
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight">
              <span className="text-brand-700">AI</span> <span className="text-stone-900">Outbound</span>
            </p>
            <p className="mt-1 text-sm text-stone-500">Agentic outbound, from lead to meeting</p>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg shadow-stone-900/5">{children}</div>
      </div>
    </div>
  );
}
