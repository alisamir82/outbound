import { db, schema } from "@/db";

export async function audit(entry: {
  actorUserId?: string | null;
  clientId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  diff?: Record<string, unknown>;
}) {
  await db.insert(schema.auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    clientId: entry.clientId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    diff: entry.diff,
  });
}
