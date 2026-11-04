import { acknowledgeAlertAction } from "@/actions/reports";
import { Button } from "@/components/ui";
import type { Alert } from "@/db/schema";

export function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="mb-6 space-y-2">
      {alerts.map((a) => (
        <li key={a.id} className={`flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${a.severity === "critical" ? "bg-red-50 text-red-800" : a.severity === "warning" ? "bg-amber-50 text-amber-900" : "bg-zinc-100 text-zinc-800"}`}>
          <span>
            <span className="mr-2 text-xs uppercase tracking-wide opacity-70">{a.type.replace("_", " ")}</span>
            {a.message}
          </span>
          <form action={acknowledgeAlertAction.bind(null, a.id)}>
            <Button variant="ghost" className="h-7 px-2 text-xs">Dismiss</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
