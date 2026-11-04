import "dotenv/config";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Background worker. Phase 0 ships the skeleton: queue wiring, a repeatable
 * heartbeat job and graceful shutdown. Later phases add processors here:
 *   lead-runs      → source / dedupe / verify / qualify
 *   instantly      → webhook processing, analytics sync
 *   agent          → Claude Agent SDK runs
 *   reports        → weekly reports, optimisation proposals
 */
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

export const QUEUES = {
  system: "system",
  leadRuns: "lead-runs",
  agent: "agent",
  instantly: "instantly",
  reports: "reports",
} as const;

export const queues = Object.fromEntries(Object.values(QUEUES).map((name) => [name, new Queue(name, { connection })])) as Record<
  (typeof QUEUES)[keyof typeof QUEUES],
  Queue
>;

type Processor = (job: Job) => Promise<unknown>;

const processors: Record<string, Record<string, Processor>> = {
  [QUEUES.system]: {
    async heartbeat() {
      await db.execute(sql`select 1`);
      return { ok: true, at: new Date().toISOString() };
    },
  },
  [QUEUES.leadRuns]: {},
  [QUEUES.agent]: {},
  [QUEUES.instantly]: {},
  [QUEUES.reports]: {},
};

const workers = Object.entries(processors).map(
  ([queueName, handlers]) =>
    new Worker(
      queueName,
      async (job) => {
        const handler = handlers[job.name];
        if (!handler) throw new Error(`No processor for ${queueName}/${job.name}`);
        return handler(job);
      },
      { connection, concurrency: queueName === QUEUES.agent ? 2 : 5 },
    ),
);

for (const w of workers) {
  w.on("completed", (job) => console.log(`[worker] ${w.name}/${job.name} completed`));
  w.on("failed", (job, err) => console.error(`[worker] ${w.name}/${job?.name} failed:`, err.message));
}

async function scheduleRepeatables() {
  await queues.system.upsertJobScheduler("heartbeat", { every: 5 * 60 * 1000 }, { name: "heartbeat" });
  // Later: analytics-sync hourly, email-health daily, weekly-report Mondays 07:00 client-local.
}

async function shutdown() {
  console.log("[worker] shutting down");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

scheduleRepeatables()
  .then(() => console.log(`[worker] up. queues: ${Object.values(QUEUES).join(", ")}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
