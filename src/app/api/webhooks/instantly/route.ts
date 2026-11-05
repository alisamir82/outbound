import { createHash, timingSafeEqual } from "node:crypto";
import { db, schema } from "@/db";
import { enqueue } from "@/lib/queue";
import { getIntegration } from "@/lib/settings";

/**
 * Instantly.ai webhook receiver. Register this URL (with ?secret=…) in Instantly for the
 * events: reply_received, auto_reply_received, lead_unsubscribed, email_bounced, email_sent, email_opened.
 * The raw payload is stored and processing happens in the worker, so this returns fast.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const { secrets } = await getIntegration("instantly");
  const expected = secrets.webhookSecret ?? "";
  const given = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!expected || !safeEqual(expected, given)) return new Response("forbidden", { status: 403 });

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const eventType = String(payload.event_type ?? payload.type ?? payload.event ?? "unknown");
  const id = String(payload.uuid ?? payload.email_id ?? payload.id ?? "");
  const dedupeKey = `instantly:${eventType}:${id || createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;

  const [row] = await db
    .insert(schema.webhookEvents)
    .values({ provider: "instantly", eventType, dedupeKey, payload })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (row) await enqueue("instantly/webhook", { eventId: row.id }, { jobId: `wh-${row.id}` });
  return Response.json({ ok: true, duplicate: !row });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
