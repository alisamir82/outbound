"use client";

import { Button, Logo } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={48} />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Something went wrong</h1>
      <p className="max-w-md text-sm text-slate-500">
        An unexpected error occurred while loading this page. It has been logged
        {error.digest ? ` (reference ${error.digest})` : ""}. You can try again, or head back to the dashboard.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <a
          href="/"
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition-colors duration-150 hover:bg-slate-50"
        >
          Back to the app
        </a>
      </div>
    </div>
  );
}
