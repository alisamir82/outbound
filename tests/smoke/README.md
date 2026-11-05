# Browser smoke tests

Playwright scripts that drive the real UI against a seeded local stack (`pnpm db:seed`, `pnpm start` or `pnpm dev`, `pnpm worker`) with the Anthropic and Instantly integrations in mock mode.

```bash
node tests/smoke/phase0.js   # auth, admin client management, integrations, team
node tests/smoke/phase1.js   # ICP → lead run → review → campaign copy → approve → push
```

Each prints `PASS`/`FAIL` per step and writes screenshots to `SHOTS_DIR` (default `/tmp/outbound-smoke-shots`). They are not idempotent: reset the demo client between runs (delete campaigns and the ICP they create).
