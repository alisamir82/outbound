import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { costMicros } from "./client";

export class BudgetExceededError extends Error {
  constructor(public clientId: string) {
    super("Monthly AI budget exceeded for this client");
  }
}

/** Current calendar-month spend for a client, in micro-dollars. */
export async function monthlySpendMicros(clientId: string): Promise<number> {
  const [row] = await db
    .select({ micros: sql<number>`coalesce(sum(${schema.agentRuns.costUsdMicros}), 0)` })
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.clientId, clientId), gte(schema.agentRuns.startedAt, sql`date_trunc('month', now())`)));
  return Number(row?.micros ?? 0);
}

export type Usage = { model: string; inputTokens: number; outputTokens: number };

/**
 * Wraps one unit of AI work: budget check → run → record tokens/cost → audit.
 * The callback reports usage via `report` (can be called several times for multi-call skills).
 */
export async function runAgent<T>(
  opts: { clientId: string; skillKey: string; trigger: string; entityType?: string; entityId?: string },
  fn: (report: (u: Usage) => void) => Promise<T>,
): Promise<T> {
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, opts.clientId), columns: { tokenBudgetMonthlyUsd: true } });
  const budgetMicros = (client?.tokenBudgetMonthlyUsd ?? 0) * 1_000_000;
  if (budgetMicros > 0 && (await monthlySpendMicros(opts.clientId)) >= budgetMicros) {
    await db.insert(schema.agentRuns).values({ ...opts, status: "budget_exceeded", finishedAt: new Date() });
    throw new BudgetExceededError(opts.clientId);
  }

  const [run] = await db.insert(schema.agentRuns).values({ ...opts, status: "running" }).returning({ id: schema.agentRuns.id });
  let inputTokens = 0;
  let outputTokens = 0;
  let micros = 0;
  let model: string | undefined;
  const report = (u: Usage) => {
    model = u.model;
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    micros += costMicros(u.model, u.inputTokens, u.outputTokens);
  };
  try {
    const result = await fn(report);
    await db
      .update(schema.agentRuns)
      .set({ status: "succeeded", model, inputTokens, outputTokens, costUsdMicros: micros, finishedAt: new Date() })
      .where(eq(schema.agentRuns.id, run.id));
    return result;
  } catch (e) {
    await db
      .update(schema.agentRuns)
      .set({ status: "failed", model, inputTokens, outputTokens, costUsdMicros: micros, error: (e as Error).message, finishedAt: new Date() })
      .where(eq(schema.agentRuns.id, run.id));
    throw e;
  }
}
