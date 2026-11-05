import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={48} />
          <div className="text-center">
            <p className="text-xl font-bold tracking-tight text-stone-900">AI Outbound</p>
            <p className="text-sm text-stone-500">Agentic outbound, from lead to meeting</p>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg shadow-stone-900/5">{children}</div>
      </div>
    </div>
  );
}
