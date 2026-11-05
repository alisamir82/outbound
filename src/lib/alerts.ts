import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

/** Raises an alert unless an unacknowledged one with the same key is already open. Returns true when created. */
export async function raiseAlert(input: { clientId: string | null; severity: "info" | "warning" | "critical"; type: string; dedupeKey: string; message: string }) {
  const open = await db.query.alerts.findFirst({ where: and(eq(schema.alerts.dedupeKey, input.dedupeKey), isNull(schema.alerts.acknowledgedAt)) });
  if (open) return false;
  await db.insert(schema.alerts).values(input);
  return true;
}

/** Auto-resolves open alerts for a condition that no longer holds. */
export async function clearAlert(dedupeKey: string) {
  await db.update(schema.alerts).set({ acknowledgedAt: new Date() }).where(and(eq(schema.alerts.dedupeKey, dedupeKey), isNull(schema.alerts.acknowledgedAt)));
}
