import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUES = {
  system: "system",
  leadRuns: "lead-runs",
  agent: "agent",
  instantly: "instantly",
  reports: "reports",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobPayloads = {
  "lead-runs/run": { leadRunId: string };
  "agent/campaign-copy": { campaignId: string };
  "instantly/push-campaign": { campaignId: string };
  "instantly/webhook": { eventId: string };
  "agent/reply": { threadId: string; inboundMessageId: string };
  "agent/send-draft": { draftId: string; chosenSlotIndex: number | null; auto: boolean };
  "agent/kb-document": { documentId: string };
  "reports/analytics-sync": Record<string, never>;
  "reports/email-health": Record<string, never>;
  "reports/weekly-tick": Record<string, never>;
  "reports/weekly-now": { clientId: string };
  "reports/apply-proposal": { proposalId: string };
  "system/budget-check": Record<string, never>;
  "system/retention": Record<string, never>;
  "system/heartbeat": Record<string, never>;
};
export type JobName = keyof JobPayloads;

const globalForQueue = globalThis as unknown as { redis?: IORedis; queues?: Map<string, Queue> };

export function getRedis(): IORedis {
  if (!globalForQueue.redis) {
    globalForQueue.redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  }
  return globalForQueue.redis;
}

export function getQueue(name: QueueName): Queue {
  globalForQueue.queues ??= new Map();
  let q = globalForQueue.queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getRedis(), defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 1000 } });
    globalForQueue.queues.set(name, q);
  }
  return q;
}

/** Enqueue a typed job. Job names are "<queue>/<job>"; the job id makes retries idempotent. */
export async function enqueue<N extends JobName>(name: N, payload: JobPayloads[N], opts?: { jobId?: string; delayMs?: number }) {
  const [queue, job] = name.split("/") as [QueueName, string];
  await getQueue(queue).add(job, payload, { jobId: opts?.jobId, delay: opts?.delayMs });
}
