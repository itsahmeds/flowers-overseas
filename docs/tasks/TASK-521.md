# TASK-521 — i18n scope check: API route handlers are not indexable roots

Row: `TASKS.md` → TASK-521. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-521`; keep it current by editing this file, not the row.

## Binding

Spec 003's scope rule: keys named only inside a surface's `paths` must not render on an indexable
page. Route handlers under `src/app/api/` return JSON, redirects or plain responses and render no
indexable HTML, so they are not roots of the import graph. Since PR 523 (TASK-449) the unsubscribe
route and the internal mail-capture route make `pnpm i18n:check` report 49 false findings on main.
Fix: add `src/app/api/` to `NON_INDEXABLE_APP_DIRECTORIES` in `scripts/i18n-check-scope.ts`, extend
its doc comment with the reason, and add one unit case proving an `api` route is not a root while a
`[locale]` page still is. No page, key or catalogue change.

Part 2 was added by the orchestrator on 2026-11-11: make `tests/unit/url-pii.test.ts` (spec 001
T-59, AC-55, no PII in URLs) green again. Pin each new dynamic segment and query key that is a
random token, opaque id, code or fixed word, with a one-line reason; a personal field in a URL is
a real bug, fixed if small and in scope, otherwise reported with file:line. The mutation cases must
still go red on `#email`.

## Read

- `scripts/i18n-check-scope.ts` (lines 55 to 75)
- its unit test under `tests/unit/` (grep `NON_INDEXABLE_APP_DIRECTORIES`)
- `docs/codebase-map.md`

## Carry-forwards

_None recorded._

## Escalations

1. Resolved by the orchestrator's ruling (founder delegated), 2026-11-11: `src/modules/ops/pushover.ts`
   sent its POST as form fields, so T-59 read `message` as a URL key it may not pin. The adapter
   now sends a JSON body; the test gained no exemption.
2. Resolved by the same ruling: the 17 remaining `i18n:check` findings are fixed in this PR (see
   Result).

## Progress

- 2026-11-11: `src/app/api/` is a non-indexable app directory; type-only imports are not import-rule
  edges (the 33 GA4 findings were `import type { StepScreen }` from `@/modules/checkout`).
- 2026-11-11: T-59 pins 37 new query keys and 6 new segment names; one key (`message`) escalated.
- 2026-11-11: rulings applied: Pushover sends JSON; the 17 remaining i18n findings are fixed.

## Result

- Part 1: `scripts/i18n-check-scope.ts` adds `src/app/api/` to `NON_INDEXABLE_APP_DIRECTORIES` and
  drops type-only imports from the import graph (33 GA4 findings were `import type`). The other
  17, fixed by ruling: `nav.send` deleted unread from en/de/pl and their meta; the header names
  `search.suggest.kind.*` in full; the shared payment panel takes its fallback keys from the pay
  step (`messageKeys`, `unavailableKey`); `src/modules/risk/**` joins `PAYMENTS_PATHS`; the basket
  reminder renderer leaves the notifications barrel for `@/modules/notifications/emails` (the
  rule in that file's header), injected into `sendBasketReminder` by `src/jobs/basket-reminders.ts`.
  `pnpm i18n:check` exits 0.
- Part 2: `tests/unit/url-pii.test.ts` pins 37 keys and 6 segment names, all opaque ids, codes,
  tokens, fixed words or third-party API parameters; no personal field in a URL. Pushover sends a
  JSON body (`tests/contract/ops-pushover.test.ts` asserts it). 15/15 green.
- Not mine, still red on main: `tests/unit/payments-copy.test.ts` (8 cases, the `payments.step.*`
  keys added since its pinned list); `i18n-check.test.ts`'s pl-hidden case times out at 5 s under
  load. Integration suites touched (`basket-reminder-send`, support) were not run: no local Postgres.
- Clean-env build in the slot: app code changed.
