# TASK-160 — PII scrubbed in values, messages, stacks and Sentry URLs; the URL/query-key test with `EXTERNAL_QUERY_KEYS`; the logger's side doors closed; SDKs only in adapters

Row: `TASKS.md` → TASK-160. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-160`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-54, AC-55, AC-56, AC-57 (T-58–T-61).
- **PII:** the logger scrubs email and phone patterns in values, the message and error stacks; Sentry does the same for `request.url`. The phone pattern has a boundary on both sides; the Q21 shapes are international, UK numbers of 10–11 digits starting `0`, and PL 3-3-3.
- **URLs:** `EXTERNAL_QUERY_KEYS` starts with `src/modules/analytics/ga4.ts#id`, so AC-55 is green on its first run.
- **Side doors:** `globalThis.console`, `process.stdout.write` and console aliases are locked; the stdout calls move to `src/lib/step-summary.ts`.
- **SDKs:** `no-restricted-imports` + `no-restricted-syntax` (not `import/no-restricted-paths`); `drizzle-orm/postgres-js` now (Q22). Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- src/lib/logger.ts
- src/lib/sentry.ts
- sentry.server.config.ts, sentry.edge.config.ts, instrumentation.ts, instrumentation-client.ts, next.config.ts (only as AC-57 names)
- src/config/url-keys.ts
- tests/unit/url-pii.test.ts (new), and the logger and sentry tests
- src/lib/step-summary.ts (new; the `process.stdout.write` calls move here)
- src/modules/catalog/listing.ts (L1891) and src/modules/catalog/product.ts (L368): the stdout calls only
- eslint/modules.js, eslint/sdk-adapters.js (new), eslint.config.mjs
- src/lib/db.ts and scripts/db-migrate.ts (the `drizzle-orm/postgres-js` adapter, Q22)
- plan/12-dev-workflow.md (its own §2 rows)
- src/modules/catalog/schemas.ts (the listing schema's hard-coded keys, L993; AC-55 (d))
- tests/unit/lint-fixtures.test.ts and tests/fixtures/lint/** (T-60, T-61)
- tests/unit/lint-coverage.test.ts (add your rows to AC-52's table)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** AC-55(c) must identify a `URLSearchParams` receiver through the type checker (or by the definition A20 gives), never by method name alone. `src/` has 13 string-keyed `.get`/`.has`/`.set` calls today, none on a `URLSearchParams` (e.g. `consent.ts` L196, `address-formats.ts` L108). Spec text follows.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
