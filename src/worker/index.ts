import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { processCampaignCopy, processCampaignPush } from "@/lib/pipeline/campaign";
import { syncCampaignAnalytics } from "@/lib/pipeline/analytics";
import { checkBudgets, runRetention } from "@/lib/pipeline/compliance";
import { checkEmailHealth } from "@/lib/pipeline/health";
import { processWebhookEvent } from "@/lib/pipeline/inbox";
import { applyProposal, generateWeeklyReport, weeklyReportTick, weekKey } from "@/lib/pipeline/reports";
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
    "budget-check": () => checkBudgets(),
    retention: () => runRetention(),
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
  [QUEUES.reports]: {
    "analytics-sync": () => syncCampaignAnalytics(),
    "email-health": () => checkEmailHealth(),
    "weekly-tick": () => weeklyReportTick(),
    "weekly-now": (job) => generateWeeklyReport(job.data.clientId, `${weekKey(new Date(), "UTC")}-manual-${Date.now()}`),
    "apply-proposal": (job) => applyProposal(job.data.proposalId),
  },
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
  const system = getQueue(QUEUES.system);
  const reports = getQueue(QUEUES.reports);
  await system.upsertJobScheduler("heartbeat", { every: 5 * 60 * 1000 }, { name: "heartbeat" });
  await system.upsertJobScheduler("budget-check", { every: 60 * 60 * 1000 }, { name: "budget-check" });
  await system.upsertJobScheduler("retention", { pattern: "30 3 * * *" }, { name: "retention" });
  await reports.upsertJobScheduler("analytics-sync", { every: 60 * 60 * 1000 }, { name: "analytics-sync" });
  await reports.upsertJobScheduler("email-health", { pattern: "15 6 * * *" }, { name: "email-health" });
  // Hourly tick; each client is reported at its local Monday 07:00-08:59.
  await reports.upsertJobScheduler("weekly-tick", { pattern: "5 * * * *" }, { name: "weekly-tick" });
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
