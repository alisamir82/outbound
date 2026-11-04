# AI Outbound Platform – Implementation Plan

Version 1.1 · 4 Nov 2026 · Prepared from the pitch document and the answers to the requirements questionnaire.

---

## 1. Summary

A multi-client outbound sales platform operated by the agency. Claude sits at the centre and runs the outbound workflow end to end: build an Ideal Customer Profile (ICP), source and qualify leads, push approved lists into Instantly.ai, draft or send replies, book meetings, and report weekly. The agency onboards and manages clients from an admin portal; each client manages its own leads, campaigns and inbox from a client portal.

**Decisions already made**

| Area | Decision |
|---|---|
| Operator | Agency. Agency staff onboard clients. |
| Instantly.ai | One agency account. Clients separated inside it by workspace / campaign tagging. |
| Claude usage | Platform pays. Per-client token metering and budget caps shown to admin. |
| Scale, year one | 10–20 clients. Lead volume unknown, so design for 50k leads/client without re-architecting. |
| Lead sources | Apollo API + CSV upload at launch. Connected as a third source once API access is confirmed. |
| Email verification | Yes, before any push to Instantly. |
| ICPs | Multiple per client. |
| Lead approval | Client approves lists before push. Super-admin can override. |
| Replies | Via Instantly reply webhooks (no direct mailbox access). |
| Calendar | Google Calendar and Outlook via OAuth, plus a Calendly-style link fallback. |
| Reply approval | One-click approval in the platform UI, by the client. |
| Knowledge base | PDF, DOCX, PPTX, plain text, URL crawl. |
| Skills | Global templates, overridable per client. |
| Roles | Platform Super Admin, Client Admin, Client User. |
| Auth | Email + password. Magic link for password reset. |
| Branding | Single brand. |
| Reporting | In-app dashboard plus weekly emailed summary. |
| Optimisation | Claude proposes changes; a human approves. |
| Hosting | Single VPS running docker-compose (Caddy for TLS). Greenfield. |
| Lead data | Mock adapter with dummy data at launch. Apollo, verification and other integrations are Platform Admin settings, switchable without a deploy. |
| Transactional email | Resend. |
| Pilot client | Seeded dummy client with sample users, ICP and leads. |
| Team | Solo developer working with Claude Code. |
| Delivery | MVP for one pilot client first. |

---

## 2. Roles and permissions

| Capability | Super Admin | Client Admin | Client User |
|---|:-:|:-:|:-:|
| Create / suspend clients, set budgets, map Instantly workspace | ✔ | | |
| Edit global skills, see all clients' data, override approvals | ✔ | | |
| Manage client users, client settings, calendar connections | ✔ | ✔ | |
| Edit per-client skill overrides, upload knowledge base | ✔ | ✔ | |
| Create ICPs, run lead gen, approve lead lists | ✔ | ✔ | ✔ |
| Approve / edit / send reply drafts, book meetings | ✔ | ✔ | ✔ |
| Toggle autonomous reply mode for a campaign | ✔ | ✔ | |
| View dashboards and reports | ✔ | ✔ | ✔ |

Super Admin uses a separate `/admin` area. Client roles use `/app`. A Super Admin can "view as client" for support.

---

## 3. Architecture

### 3.1 Stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui | One codebase for admin and client portals, server actions for mutations, good DX. |
| API | Next.js route handlers for the UI; a separate small Node service (`worker`) for jobs and webhooks | Keeps long-running AI work off the web tier. |
| Database | PostgreSQL 16 with `pgvector` | Relational data plus vector search for the knowledge base in one engine. |
| ORM | Drizzle | Type-safe, migrations in git. |
| Queue | BullMQ on Redis | Lead-gen runs, enrichment, verification, reply handling, scheduled reports. Retries and rate limiting built in. |
| AI runtime | Claude Agent SDK (TypeScript) with Claude Fable 5.1 for agentic work and Claude Haiku 5.5 for cheap classification | Agent SDK gives tool use, MCP client support and skills out of the box. |
| MCP servers | Instantly (official hosted server at `mcp.instantly.ai`), plus in-house servers: `leads-mcp`, `calendar-mcp`, `kb-mcp`, `platform-mcp` | Each external system is a tool surface the agent can call. |
| File storage | S3-compatible bucket (AWS S3, GCS, or MinIO) | Knowledge-base uploads, CSV imports, report PDFs. |
| Auth | Auth.js with credentials provider + email magic-link provider | Email/password, magic link for reset, session cookies, no vendor lock-in. |
| Email (transactional) | Resend or SES | Magic links, approval notifications, weekly reports. |
| Observability | OpenTelemetry → Grafana/Loki or the cloud's native stack; Sentry for errors | Needed from day one because the agent runs unattended. |
| Deploy | Docker images; docker-compose for MVP on one VM, then ECS/Cloud Run/Kubernetes when load requires | Cloud-agnostic. |

Everything is cloud-neutral. Confirm which provider (AWS, GCP, Azure, Hetzner) before Phase 0 so the Terraform is written once.

### 3.2 Component diagram

```
┌──────────────────────────┐        ┌───────────────────────────┐
│  Next.js web (admin+app) │──────▶ │  PostgreSQL + pgvector     │
└───────────┬──────────────┘        └───────────────────────────┘
            │ enqueue                        ▲
            ▼                                │
┌──────────────────────────┐        ┌────────┴──────────────────┐
│  Redis / BullMQ          │──────▶ │  Worker service            │
└──────────────────────────┘        │  • Agent runs (Agent SDK)  │
            ▲                       │  • Webhook processors      │
            │ webhooks              │  • Schedulers (cron)       │
┌───────────┴──────────────┐        └────────┬──────────────────┘
│  Instantly.ai            │                 │ MCP
│  Google / Outlook        │        ┌────────▼──────────────────┐
│  Apollo / Connected      │◀───────│  MCP servers               │
└──────────────────────────┘        │  instantly · leads · kb    │
                                    │  calendar · platform       │
                                    └───────────────────────────┘
```

### 3.3 Multi-tenancy

- Every table carries `client_id`. Postgres Row Level Security is enabled with a `current_client_id` session setting so a bug in application code cannot leak across clients.
- Instantly: one agency account. Each client maps to an Instantly **workspace** if the agency plan allows sub-workspaces, otherwise to a **campaign tag prefix** (`[ClientSlug]`). The mapping lives in `clients.instantly_workspace_id`. All Instantly calls go through one adapter that injects the mapping, so switching strategy later is a one-file change.
- Secrets (Instantly API key, Apollo key, calendar OAuth tokens) are stored encrypted with a KMS-managed key, never in plain columns.

---

## 4. Functional modules

### 4.1 Client onboarding (admin)

1. Super Admin creates a client: name, slug, Instantly workspace mapping, monthly token budget, sending limits.
2. Invites the first Client Admin by email.
3. Client Admin completes a guided setup: company profile, upload knowledge base, connect calendar, review default skills.
4. Onboarding checklist shows progress; the client can't launch a campaign until KB, calendar and at least one ICP exist.

### 4.2 Lead generation

Pipeline per run, each step a BullMQ job with its own retry policy:

1. **ICP generation.** Prompt → Claude produces a structured ICP (industries, company size, geos, titles, pain points, disqualifiers). Stored as JSON, editable in the UI, versioned.
2. **Sourcing.** The `leads-mcp` server exposes one `search_leads(icp, source, limit)` tool with pluggable adapters: `apollo`, `csv`, `connected` (stub until access). Results are normalised into a common `Lead` shape.
3. **Deduplication.** Against the client's existing leads and the global suppression list (unsubscribes, bounces, do-not-contact).
4. **Verification.** MillionVerifier or Instantly's verification endpoint. Only `valid` and, optionally, `catch-all` statuses proceed.
5. **Qualification.** Claude scores each lead 1–5 against the ICP and writes a one-sentence qualification statement (used later as personalisation). Haiku for scoring, Fable for the statement on leads ≥ 3.
6. **Review.** Client sees the list, can remove rows, edit statements, and approve. Super Admin can approve on the client's behalf.
7. **Push.** Approved leads are added to the chosen Instantly campaign with custom variables (`qualification`, `pain_point`, `icp_version`). Push status is tracked per lead.

### 4.3 Campaigns

- Campaigns are created in Instantly by Claude via MCP, using copy produced by the copywriting skill. Copy drafts go through the same approve step as leads.
- A sync job pulls campaign analytics (sent, opens, replies, bounces, meetings) hourly and email-account health daily.

### 4.4 Reply handling

- Instantly webhooks (`reply_received`, `auto_reply_received`, `lead_unsubscribed`, `email_bounced`) hit `/webhooks/instantly`. Payload is verified, stored raw, then queued.
- The reply agent loads: thread history, lead record, client KB (via `kb-mcp` vector search), the client's reply-handling skill, and the calendar tool.
- It classifies the reply (interested, objection, not-now, wrong-person, OOO, unsubscribe, hostile, other), then drafts a response.
- **Approval mode (default).** Draft appears in the client inbox view with the classification and the sources used. Client edits/approves in one click; the platform sends via Instantly.
- **Autonomous mode (per campaign toggle).** The agent sends directly only when all guardrails pass; otherwise it falls back to approval.

**Guardrails for autonomous mode (recommended):**

| Rule | Behaviour |
|---|---|
| Classification confidence < 0.8 | Escalate to human |
| Reply mentions price, discount, contract, legal, refund, security questionnaire | Escalate |
| Unsubscribe / stop / remove language | Mark unsubscribed in Instantly, add to suppression, no reply |
| Hostile or complaint tone | Escalate, flag to Super Admin |
| More than 3 agent replies in one thread | Escalate |
| Reply arrives outside client's business hours | Queue, send next business morning (configurable) |
| Meeting booking | Allowed: propose slots and confirm. Not allowed: change meeting length, add attendees not on the allow-list |
| Any tool error during the run | Escalate, never send a partial reply |

### 4.5 Meeting booking

- `calendar-mcp` wraps Google Calendar and Microsoft Graph with OAuth per client. Tools: `get_availability`, `create_event`, `reschedule`, `cancel`.
- Fallback: if no calendar is connected, the agent inserts the client's booking link (Calendly, Cal.com, etc.).
- Booked meetings are written to `meetings` and count as the primary success metric in reports.

### 4.6 Knowledge base

- Upload PDF / DOCX / PPTX / TXT, or submit a URL to crawl (same-domain, depth 2, cap 200 pages).
- Worker extracts text, chunks (≈750 tokens, overlap), stores in `kb_chunks` with `client_id` and source metadata. Retrieval is Postgres full-text search at launch (no external embedding dependency); pgvector + an embedding provider is a drop-in change in one file when relevance needs it.
- `kb-mcp` exposes `search_kb(query, k)` and `get_document(id)`. Every reply draft records which chunks it used so the client can see "why did it say this".

### 4.7 Skills

- A skill is a versioned markdown package: system instructions, few-shot examples, constraints, and a list of tools it may use. Stored in `skills` (global) and `client_skill_overrides`.
- Launch set: `icp-builder`, `lead-qualifier`, `copywriter` (spam-trigger avoidance, length and link rules), `reply-handler` (objection playbook), `campaign-optimiser`, `weekly-reporter`.
- Resolution order at run time: client override → global default. Admin UI shows a diff between the two.

### 4.8 Scheduled tasks

| Job | Schedule | Output |
|---|---|---|
| Analytics sync | Hourly | Updates campaign and lead stats |
| Email-account health | Daily | Warm-up status, bounce rate, spam-folder rate; alerts when thresholds breached |
| Weekly report | Monday 07:00 client-local | In-app report page + emailed summary |
| Optimisation proposals | Weekly, after the report | Claude proposes subject-line / copy / sequence changes with expected impact; client approves in UI, then Claude applies them in Instantly |
| Token budget check | Hourly | Pauses AI jobs for a client that exceeds its monthly budget, alerts Super Admin |

### 4.9 Compliance (recommended defaults)

- Every outbound email carries an unsubscribe line (CAN-SPAM) and the sender's physical address.
- Global and per-client suppression lists; unsubscribes sync both ways with Instantly.
- GDPR: lead records store `source`, `lawful_basis` (legitimate interest for B2B), and support deletion on request from the admin UI. Data retention default: delete unengaged leads after 12 months.
- Region rules: a per-client flag blocks sending to countries the client cannot lawfully cold-email (Canada's CASL, Germany's UWG). Super Admin maintains the list.
- Audit log of every AI-sent email and every human approval.

---

## 5. Data model (core tables)

```
clients               id, name, slug, status, instantly_workspace_id, token_budget_monthly,
                      business_hours, timezone, sending_regions_blocked, created_at
users                 id, email, password_hash, role (super_admin|client_admin|client_user),
                      client_id (null for super_admin), last_login_at
icps                  id, client_id, name, version, spec_json, created_by
lead_runs             id, client_id, icp_id, source, status, counts_json, started_at, finished_at
leads                 id, client_id, email, first_name, last_name, title, company, domain,
                      source, source_ref, verification_status, score, qualification,
                      status (new|approved|pushed|replied|meeting|unsubscribed|bounced),
                      instantly_lead_id, campaign_id
campaigns             id, client_id, instantly_campaign_id, name, status, autonomous_mode,
                      copy_json, stats_json
threads               id, client_id, lead_id, campaign_id, instantly_thread_ref, last_event_at
messages              id, thread_id, direction, body_text, body_html, classification,
                      confidence, sent_by (agent|human), approved_by, kb_chunk_ids[]
reply_drafts          id, thread_id, draft_text, classification, status (pending|approved|
                      edited|rejected|auto_sent), created_at, decided_at
meetings              id, client_id, lead_id, calendar_provider, external_event_id, start_at
kb_documents          id, client_id, type, name, storage_key, status
kb_chunks             id, document_id, client_id, chunk_text, embedding vector(1536), metadata
skills                id, key, version, content_md, tools_allowed[]
client_skill_overrides id, client_id, skill_key, content_md, version
agent_runs            id, client_id, skill_key, trigger, input_tokens, output_tokens, cost_usd,
                      status, trace_ref, started_at
suppressions          id, client_id (null = global), email_or_domain, reason
webhook_events        id, provider, event_type, raw_json, processed_at, error
reports               id, client_id, period_start, period_end, content_json, pdf_key
audit_log             id, client_id, actor_user_id, action, entity, entity_id, diff_json
```

---

## 6. AI layer

### 6.1 Agent runs

Each unit of AI work is an **agent run** executed in the worker via the Claude Agent SDK:

```
input → resolve skill (override or global) → attach MCP servers the skill allows
      → run with a hard tool-call cap and timeout → persist result + token usage
      → emit audit event
```

Runs are idempotent (keyed by `trigger` + entity id) so a retried job never sends twice.

### 6.2 MCP servers

| Server | Tools | Notes |
|---|---|---|
| `instantly` (official hosted) | campaigns, leads, analytics, accounts, send reply | Used as-is; wrapped by our adapter for client scoping and rate limiting. If a needed call is missing, call the v2 REST API directly. |
| `leads-mcp` (in-house) | `search_leads`, `enrich_lead`, `verify_emails`, `import_csv` | Adapter pattern: `apollo`, `csv`, `connected`. |
| `kb-mcp` | `search_kb`, `get_document` | Scoped to `client_id`. |
| `calendar-mcp` | `get_availability`, `create_event`, `reschedule`, `cancel` | Google + Microsoft. |
| `platform-mcp` | `get_lead`, `update_lead_status`, `create_draft`, `escalate`, `log_decision` | Lets the agent write back to our DB in a controlled way. |

### 6.3 Model routing and cost control

- Claude Opus 5.5 by default for ICP building, copywriting, reply drafting and optimisation proposals; switchable to Claude Fable 5.1 per platform in Admin → Integrations when maximum quality is worth the higher price.
- Claude Haiku 5.5 for classification, lead scoring, and dedup matching.
- Prompt caching on the skill + KB context per client, which cuts cost on high-volume reply handling.
- Per-client monthly budget enforced in the worker before each run. Admin dashboard shows spend by client and by skill.

### 6.4 Evaluation

- A fixed test set of 50 replies per category with expected classification and "acceptable draft" rubric. Run on every skill change in CI. Blocks deploy if classification accuracy drops below 90 %.

---

## 7. Connected integration

Access is not available yet, so Connected is designed as a **lead-source adapter** behind `leads-mcp`, same as Apollo and CSV. Nothing else in the system depends on it.

Steps when access arrives:

1. Confirm what Connected offers, in order of preference: MCP server, REST API, webhook/export, or manual CSV.
2. Map their lead fields to our `Lead` shape.
3. Implement `connected` adapter (half a day to three days depending on API shape).
4. Add a Connected toggle in the client's lead-source settings.

If Connected offers only manual exports, the CSV adapter already covers it on day one.

---

## 8. Delivery phases

Estimates assume one senior full-stack engineer plus one engineer for AI/integrations, with you reviewing. Add 20 % if one person does everything.

### Phase 0 — Foundation (weeks 1–2) — done
- Repo, CI, Docker, Terraform for the chosen cloud, Postgres + Redis + bucket.
- Auth (email/password, magic link), roles, RLS, audit log.
- Admin: create client, invite users, set budget. Client: onboarding checklist shell.
- **Exit:** Super Admin can create a client and the client can log in.

### Phase 1 — Lead generation to Instantly (weeks 3–5) — done
- ICP builder skill and UI.
- `leads-mcp` with Apollo and CSV adapters, verification, dedup, qualification.
- Lead review and approval UI. Push to Instantly with custom variables.
- Campaign creation with copywriter skill and copy approval.
- **Exit:** Pilot client runs a real campaign end to end from the platform.

### Phase 2 — Replies and meetings (weeks 6–8) — done
- Instantly webhook ingestion, thread model, inbox UI.
- Reply-handler skill, classification, drafts, one-click approval, send via Instantly.
- Knowledge base upload, chunking, `kb-mcp`.
- `calendar-mcp` with Google and Outlook OAuth, booking-link fallback.
- Guardrails and autonomous toggle (shipped off by default).
- **Exit:** Pilot client handles all replies inside the platform; first meeting booked by the agent.

### Phase 3 — Reporting, optimisation, hardening (weeks 9–10)
- Analytics sync, email-health monitoring and alerts.
- Weekly report (in-app + email) and optimisation proposals with approval.
- Token budgets, spend dashboard, eval suite in CI.
- Compliance: suppression sync, region blocks, retention job.
- **Exit:** MVP complete. Agency onboards clients two and three without engineering help.

### Phase 4 — Post-MVP backlog
- Connected adapter (when access arrives).
- Per-client skill override editor with diff view (basic version ships in Phase 1; rich editor here).
- Slack notifications for approvals.
- A/B testing of copy variants managed by Claude.
- Sub-workspace migration in Instantly if the agency upgrades plans.

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Single Instantly account for all clients | A deliverability hit on one client's domains is visible across the account; API rate limits are shared | Separate sending domains and email accounts per client; central rate limiter; plan a workspace-per-client migration path |
| Instantly webhook payloads not fully documented | Reply parsing breaks on unexpected shapes | Store raw payloads, build parser from real test deliveries in Phase 2 week 1, alert on parse failures |
| Agent sends a bad email in autonomous mode | Client reputation damage | Guardrails above, autonomous off by default, per-thread cap, full audit trail, kill switch per client |
| Apollo data quality and cost | Low-quality lists, surprise bills | Verification step, per-run credit cap, client sees cost estimate before sourcing |
| Claude cost at scale | Margin erosion | Model routing, prompt caching, per-client budgets, cost shown per run |
| Connected access never materialises | Feature promised in pitch missing | Already isolated as an adapter; CSV covers manual exports |
| Unknown lead volumes | Over- or under-provisioning | Queue-based design scales horizontally; monitor from the pilot and size Phase 3 infra on real numbers |
| Cold-email regulations by region | Legal exposure for agency and clients | Region block list, suppression lists, unsubscribe handling, retention policy |

---

## 10. Decisions taken after review

1. **Hosting**: one VPS, docker-compose, Caddy reverse proxy with automatic TLS. Terraform dropped; a `deploy.sh` and compose file are enough at this scale. Move to a managed Postgres when the first real client's data makes backups a liability.
2. **Lead sources**: ship a `mock` adapter producing realistic dummy leads. Apollo and any later source are configured under Admin → Settings → Integrations (API key, enabled flag, daily credit cap). No code change needed to switch.
3. **Email verification**: pluggable provider behind the same settings page, with a `mock` provider at launch. Note that Resend and Supabase do not verify third-party addresses; the real options remain MillionVerifier, ZeroBounce or Instantly's built-in check. Pick one when the first real list is sourced.
4. **Pilot client**: a seeded dummy client (`Acme Demo`) with a Client Admin, a Client User, one ICP and 50 dummy leads, so every screen has data from day one.
5. **Transactional email**: Resend for magic links, invites, approval notifications and weekly reports.
6. **Team**: solo. Phase estimates in section 8 are multiplied by roughly 1.5. Realistic MVP: 14–16 weeks of part-time work, less if full-time. Each phase is broken into Claude Code sessions of one to two days of work.

---

## Appendix: sources checked

- Instantly v2 webhook reference: https://developer.instantly.ai/api-reference/groups/webhook.md
- Instantly webhook events guide: https://developer.instantly.ai/guides/webhook-events.md
- Instantly official MCP server: https://help.instantly.ai/en/articles/12980002-instantly-mcp-model-context-protocol
