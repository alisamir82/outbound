/** Lightweight loading skeleton shown while a section's server data loads. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-200/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-14 rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
