# AI Outbound Platform

Agency-operated outbound sales platform with Claude at the centre: ICP + lead generation, Instantly.ai campaigns, AI reply handling with one-click approval, meeting booking, and weekly reporting. See `IMPLEMENTATION_PLAN.md` for the full design and phase plan.

## Status

**Phase 0 (foundation) – done.** Auth, roles, tenancy, admin portal (clients, users, integrations), client portal shell, worker skeleton, Docker/VPS deployment.
Next: Phase 1 (ICP builder, lead-gen pipeline, approval, push to Instantly).

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

## Layout

```
src/app/(auth)/        login, forgot/reset password, accept invite
src/app/admin/         Super-admin portal: overview, clients, platform team, integrations
src/app/app/           Client portal: dashboard, team (leads/campaigns/inbox come in later phases)
src/actions/           Server actions (auth, clients/users, settings)
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
