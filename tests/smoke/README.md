# Browser smoke tests

Playwright scripts that drive the real UI against a seeded local stack (`pnpm db:seed`, `pnpm start` or `pnpm dev`, `pnpm worker`) with the Anthropic and Instantly integrations in mock mode.

```bash
node tests/smoke/phase0.js   # auth, admin client management, integrations, team
node tests/smoke/phase1.js   # ICP → lead run → review → campaign copy → approve → push
node tests/smoke/phase2.js   # reply settings, KB upload, simulated replies → draft → approve + book, autonomous send / escalate / unsubscribe
```

`phase2.js` expects the campaign created by `phase1.js` ("Q4 sales leaders") with pushed leads. Reset between runs:

```sql
delete from meetings; delete from reply_drafts; delete from messages; delete from threads;
delete from kb_documents; delete from calendar_connections; delete from suppressions;
update leads set status='pushed' where campaign_id is not null and status in ('replied','meeting','unsubscribed');
update campaigns set autonomous_mode=false;
```

Each prints `PASS`/`FAIL` per step and writes screenshots to `SHOTS_DIR` (default `/tmp/outbound-smoke-shots`). They are not idempotent: reset the demo client between runs (delete campaigns and the ICP they create).
