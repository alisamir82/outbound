import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { processCampaignCopy, processCampaignPush } from "@/lib/pipeline/campaign";
import { processWebhookEvent } from "@/lib/pipeline/inbox";
import { processKbDocument } from "@/lib/pipeline/kb";
import { processLeadRun } from "@/lib/pipeline/lead-run";
import { processReplyAgent, sendDraft } from "@/lib/replies/service";
import { getQueue, getRedis, QUEUES } from "@/lib/queue";

/**
 * Background worker. Processors are keyed by queue then job name; job names
 * match `JobPayloads` in src/lib/queue.ts.
 */
type Processor = (job: Job) => Promise<unknown>;

const processors: Record<string, Record<string, Processor>> = {
  [QUEUES.system]: {
    async heartbeat() {
      await db.execute(sql`select 1`);
      return { ok: true, at: new Date().toISOString() };
    },
  },
  [QUEUES.leadRuns]: {
    run: (job) => processLeadRun(job.data.leadRunId),
  },
  [QUEUES.agent]: {
    "campaign-copy": (job) => processCampaignCopy(job.data.campaignId),
    reply: (job) => processReplyAgent(job.data.threadId, job.data.inboundMessageId),
    "send-draft": (job) => sendDraft({ draftId: job.data.draftId, chosenSlotIndex: job.data.chosenSlotIndex, auto: job.data.auto }),
    "kb-document": (job) => processKbDocument(job.data.documentId),
  },
  [QUEUES.instantly]: {
    "push-campaign": (job) => processCampaignPush(job.data.campaignId),
    webhook: (job) => processWebhookEvent(job.data.eventId),
  },
  [QUEUES.reports]: {},
};

const connection = getRedis();
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
  await getQueue(QUEUES.system).upsertJobScheduler("heartbeat", { every: 5 * 60 * 1000 }, { name: "heartbeat" });
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
