import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={48} />
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">404</p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="max-w-md text-sm text-slate-500">The page you are looking for does not exist or may have been moved.</p>
      <Link
        href="/"
        className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-brand-500"
      >
        Back to the app
      </Link>
    </div>
  );
}
