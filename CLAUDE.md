# AI Outbound Platform – working notes for Claude Code

Read `IMPLEMENTATION_PLAN.md` first: it holds the agreed scope, roles, data model and phase plan. `README.md` has setup commands.

## Conventions
- Next.js 16 App Router. Route protection lives in `src/proxy.ts` (not middleware.ts). Route-type helpers `PageProps`/`LayoutProps` come from `next typegen`; run `pnpm exec next typegen` before `pnpm typecheck` on a fresh clone.
- Mutations are server actions in `src/actions/*`, each starting with `requireUser()`/`requireRole()` from `src/lib/session.ts` and ending with an `audit()` call.
- Every tenant-scoped table has `client_id`. Client pages resolve scope with `requireClientScope()` (own client, or the super-admin "view as client" cookie).
- Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate`, commit the SQL in `drizzle/`.
- External providers (lead sources, verification, Instantly, Anthropic) are configured in Admin → Settings → Integrations via the registry in `src/lib/settings.ts`. New provider = add fields there + an adapter under `src/lib/leads/` (or a sibling folder), registered in `src/lib/leads/registry.ts`. Never read provider keys from env in app code.
- Background work goes through BullMQ queues defined in `src/worker/index.ts`; add a processor per job name.
- Emails go through `src/lib/email.ts`; without `RESEND_API_KEY` they print to the console.
- AI calls: wrap every unit of work in `runAgent()` from `src/lib/ai/run.ts` (budget check + token metering) and resolve prompts with `resolveSkill()`. Use `client.messages.parse` with `zodOutputFormat` for structured output. Every AI function has a mock branch so the app works without a key; keep that when adding new ones.
- Jobs: add the job name to `JobPayloads` in `src/lib/queue.ts`, the processor in `src/worker/index.ts`, and the logic in `src/lib/pipeline/`. Enqueue with `enqueue()` and a deterministic `jobId`.
- Super-admin "view as client" is a cookie (`view_as_client`) read by `requireClientScope()`; client pages never take a client id from the URL.
- Browser smoke tests are in `tests/smoke/` (Playwright, run against a seeded local stack with `node tests/smoke/phase1.js`); run `pnpm typecheck && pnpm lint && pnpm build` and exercise the flow ICP → lead run → approve → campaign → push in mock mode before opening a PR.

## Phase plan (from IMPLEMENTATION_PLAN.md §8)
- Phase 0 foundation: done.
- Phase 1 lead generation: done. ICP builder, lead runs, review, campaigns + copywriter, push to Instantly, skill overrides.
- Phase 2: Instantly webhooks, inbox + reply drafts + approval, knowledge base (pgvector), calendar MCP, autonomous-mode guardrails.
- Phase 3: analytics sync, email health, weekly reports, optimisation proposals, budgets, eval suite, compliance jobs.

## Checks before finishing a task
`pnpm typecheck && pnpm lint && pnpm build`, and run the seed against a fresh DB if the schema changed.
