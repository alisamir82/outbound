# AI Outbound Platform

Agency-operated outbound sales platform with Claude at the centre: ICP + lead generation, Instantly.ai campaigns, AI reply handling with one-click approval, meeting booking, and weekly reporting. See `IMPLEMENTATION_PLAN.md` for the full design and phase plan.

## Status

**Phase 0 (foundation) – done.** Auth, roles, tenancy, admin portal (clients, users, integrations), client portal shell, worker skeleton, Docker/VPS deployment.
**Phase 1 (lead generation) – done.** ICP builder, lead-run pipeline (source → dedupe → verify → qualify → review), campaign copywriter with approval, push to Instantly, per-client skill overrides, AI metering and budgets.
**Phase 2 (replies) – done.** Instantly webhook receiver, threads and inbox, reply agent with classification and knowledge-base grounding, one-click approval, autonomous mode with guardrails, meeting booking via Google / Microsoft / booking link, knowledge base (PDF, DOCX, PPTX, TXT, MD, URL) with full-text retrieval.
**Phase 3 (reporting and operations) – done.** Hourly analytics sync and daily email-account health from Instantly with alerts, weekly report (in-app and emailed) with Claude narrative, optimisation proposals with approve-and-apply, per-client AI spend dashboard and budget alerts, region blocking and data-retention jobs, reply-classification eval suite and GitHub Actions CI.

MVP scope from the implementation plan is complete. Remaining work is live-credential verification (see "Before going live") and the post-MVP backlog (Connected adapter, Slack notifications, A/B testing, Instantly sub-workspaces).

### Reporting and operations

- **Scheduled jobs** (BullMQ job schedulers, registered by the worker): analytics sync hourly, email health daily 06:15 UTC, weekly report tick hourly (each client gets its report on its local Monday between 07:00 and 09:00), budget check hourly, retention daily 03:30 UTC.
- **Alerts** are raised once per condition and stay until dismissed: bounce rate over 5% on a campaign, sending-account warm-up or bounce problems, budget threshold and exhaustion, analytics sync failures. Client alerts show on the client dashboard; platform alerts on the admin overview and Email health pages.
- **Optimisation proposals** are generated with each weekly report for live campaigns; each changes one subject line, body, delay or ICP targeting field. Approving applies it to the campaign (and to Instantly in live mode).
- **Compliance**: Admin → Integrations → Compliance defaults holds platform-wide blocked countries, retention windows and the budget alert threshold; each client can add blocked countries and a shorter retention window.
- **Eval suite**: `pnpm test` runs guardrail unit tests and the reply-classification eval against the keyword mock; with `ANTHROPIC_API_KEY` set it also runs against the real model (`EVAL_MODEL` overrides the default Haiku). CI runs on every pull request.

### Before going live

1. Set the Anthropic key (Mode = Live) and the Instantly key + webhook secret under Admin → Integrations.
2. Register Instantly webhooks for reply, unsubscribe, bounce, sent and opened events.
3. Confirm Instantly field names on one real campaign push, one reply send, one analytics pull and one accounts listing (all isolated in `src/lib/instantly/client.ts`).
4. Create Google and Microsoft OAuth apps and add their credentials; connect the pilot client's calendar.
5. Rotate the seeded passwords.

### Replies and the inbox

1. In Instantly, create webhooks for `reply_received`, `auto_reply_received`, `lead_unsubscribed`, `email_bounced`, `email_sent`, `email_opened` pointing at `https://<APP_URL>/api/webhooks/instantly?secret=<webhookSecret>` (the secret is set under Admin → Integrations → Instantly).
2. Each reply becomes a thread. The reply agent classifies it, searches the client's knowledge base, proposes meeting slots from the connected calendar, and writes a draft.
3. **Approval mode** (default): the draft waits in the inbox for one click. **Autonomous mode** (per campaign): the draft is sent if it passes the guardrails (confidence threshold, no pricing/legal/security topics, not hostile, per-thread reply cap, business hours), otherwise it is escalated.
4. Unsubscribes are honoured immediately and never replied to. Out-of-office replies are recorded without a draft.
5. In mock mode, every campaign page has a "Simulate a reply" box that injects an inbound message exactly as the webhook would.

Calendar: clients connect Google or Outlook from Reply settings once the agency has configured the OAuth apps under Admin → Integrations. Without a calendar, replies fall back to the client's booking link. A demo calendar is available for testing.

Uploads are stored under `UPLOAD_DIR` (default `./data/uploads`, a Docker volume in production); extracted text and chunks live in Postgres.

### AI and Instantly modes

Both run in **mock mode** until configured under Admin → Integrations, so the whole flow works in a demo without keys:

- **Anthropic**: set Mode = Live and an API key. Default models are `claude-opus-5-5` (ICPs, copy) and `claude-haiku-5-5` (lead scoring). Every call is metered per client in `agent_runs`; a client whose monthly budget is exhausted gets a clear error instead of a silent failure.
- **Instantly**: set the API key and tick Enabled. The adapter in `src/lib/instantly/client.ts` creates the campaign, adds leads with a `qualification` custom variable, and activates it. Confirm field names against a test workspace before the first real push.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · Drizzle + PostgreSQL 16 (pgvector) · BullMQ + Redis · Auth.js · Resend · Claude Agent SDK (from Phase 1) · Docker + Caddy on a single VPS.

## Local development

```bash
cp .env.example .env            # defaults work locally; emails are logged to the console
docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis
pnpm install
pnpm db:migrate
pnpm db:seed                    # super admin + "Acme Demo" client with users, ICP, 50 mock leads
pnpm dev                        # http://localhost:3000
pnpm worker:dev                 # background jobs, separate terminal
```

Seeded logins (change in production):

| Role | Email | Password |
|---|---|---|
| Super admin | admin@example.com | Admin12345! |
| Client admin | owner@acme-demo.example.com | Demo12345! |
| Client user | sdr@acme-demo.example.com | Demo12345! |

## Scripts

| Command | Purpose |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Checks |
| `pnpm db:generate` | Create a migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Browse the database |
| `pnpm db:seed` | Idempotent seed |
| `pnpm test` | Guardrail tests + reply-classification eval (live model when `ANTHROPIC_API_KEY` is set) |

## Layout

```
src/app/(auth)/        login, forgot/reset password, accept invite
src/app/admin/         Super-admin portal: overview, clients, platform team, integrations
src/app/app/           Client portal: dashboard, ICPs, leads + lead runs, campaigns, AI skills, team
src/actions/           Server actions (auth, clients/users, settings)
src/lib/ai/            Anthropic client, skills (prompts + overrides), metering, ICP / qualifier / copywriter
src/lib/pipeline/      Lead-run and campaign processors (run by the worker)
src/lib/instantly/     Instantly v2 adapter (live + mock)
src/lib/replies/       Reply agent orchestration, guardrails, send/book/unsubscribe
src/lib/pipeline/      Lead runs, campaigns, inbox, KB, analytics, health, reports, compliance (worker processors)
src/lib/alerts.ts      Deduplicated alert raising/clearing
tests/eval/            Guardrail unit tests and the reply-classification eval set
src/lib/kb/            Knowledge base: extraction (pdf/docx/pptx/url), chunking, full-text search
src/lib/calendar/      Google / Microsoft / mock calendar providers, OAuth, slot proposals
src/lib/queue.ts       Typed BullMQ job names shared by app and worker
src/lib/               crypto (AES-GCM secrets), email (Resend), settings (integration registry), leads adapters
src/db/                Drizzle schema + client
src/worker/            BullMQ worker and queue definitions
scripts/seed.ts        Seed data
deploy/                Caddyfile, deploy.sh, VPS_SETUP.md
```

## Deployment

See `deploy/VPS_SETUP.md`. In short: `docker compose up -d`, migrate, seed, point DNS at the VPS, Caddy handles TLS.

## Security notes

- Integration secrets are encrypted at rest with `APP_ENCRYPTION_KEY` (AES-256-GCM). Rotate by re-saving each integration.
- Invite and reset links are single-use hashed tokens (7 days / 1 hour).
- Every admin action writes to `audit_log`.
