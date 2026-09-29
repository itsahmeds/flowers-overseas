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
- scripts/gates-cheap.ts (`url-pii` joins the always-run list; AC-52, per A20 round 3)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** AC-55(c) must identify a `URLSearchParams` receiver through the type checker (or by the definition A20 gives), never by method name alone. `src/` has 13 string-keyed `.get`/`.has`/`.set` calls today, none on a `URLSearchParams` (e.g. `consent.ts` L196, `address-formats.ts` L108). This landed in A20, round 3.
- **From A20 round 3 (2026-09-28):** `url-pii` joins `gates:cheap`'s always-run list here, not in TASK-159. You wait for TASK-159, and TASK-154 before it, because all three write `scripts/gates-cheap.ts`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: AC-54 done (value/msg/stack scan in `logger.ts`, `request.url` in `sentry.ts`; T-58 cases in `logger.test.ts`, `sentry-before-send.test.ts`; boundary, Polish-gap, msg and stack mutations each go red). Next: AC-55.
- 2026-09-29: AC-55 done (`src/config/url-keys.ts`, listing schema reads it, `tests/unit/url-pii.test.ts` with the checker-based receiver). Next: AC-56/57 lint locks.
- 2026-09-29: AC-56/57 done (`eslint/sdk-adapters.js` `restrictedRules()`, one object per disjoint file group, real config and fixture mirror; `src/lib/step-summary.ts`; T-60/T-61 fixtures; AC-52 rows and the options check in `lint-coverage.test.ts`). `url-pii` on the always-run list; plan/12 PII and Adapters rows. `gates:cheap` PASS. Next: ready + CI.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR #117. AC-54: `redact()` scans every string value, `msg` and error stacks (`EMAIL_PATTERN`, `PHONE_PATTERN`, `scrubText` in `src/lib/logger.ts`); `beforeSend` scans `request.url` too. AC-55: `src/config/url-keys.ts` (`QUERY_KEYS`), the listing schema reads it, `tests/unit/url-pii.test.ts` with `EXTERNAL_QUERY_KEYS = [src/modules/analytics/ga4.ts#id]` and a type-checker receiver test (name-only mode goes red on the real tree, 8 `Headers`/`Set` calls). AC-56/57: `eslint/sdk-adapters.js`, `src/lib/step-summary.ts`; the two stdout writers moved. Tests added (all unit): logger +31 (T-58), sentry +6 (T-58), url-pii 15 (T-59), lint-fixtures +9 (T-60, T-61), lint-coverage +7 (AC-52 rows, T-56 red cases), gates-cheap updated (always 3). Mutations run and red: each phone boundary, the Polish gap, the `msg` and stack scans, a dropped side-door entry, a broken SDK regex, the dropped `import()` selectors. One existing expectation changed: TASK-158's AC-50 case in `lint-fixtures.test.ts` now also sees `no-restricted-globals` on `console.log` in `src/` (the new lock, not a loosening). TASK-156 (`../fo-wt-156` at 644e83e): `src/lib/release.ts`, `scripts/release.ts`, `src/lib/railway.ts` raise no `no-restricted-*` or `no-console` error under the new rules. No expensive gate run locally.

```
gates:cheap · e7c6909532771a46aa258b375b16d578fe8272af · tree clean · base origin/main  (the last code commit; later commits touch only this brief and TASKS.md)
typecheck             exit 0 · 1.9 s
lint                  exit 0 · 9.9 s
format:check          exit 0 · 7.7 s
i18n:check            exit 0 · 0.3 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 91.4 s · changed 80 + map 0 + always 1 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
