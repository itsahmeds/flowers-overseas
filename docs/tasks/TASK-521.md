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

1. **`src/modules/ops/pushover.ts:135`, key `message` (TASK-488).** The Pushover client builds its
   POST form body with `new URLSearchParams({ ..., message })`; T-59 counts every `URLSearchParams`
   key as a URL key, and `message` is a PII key name (`isRedactedKey`), so rule (b) refuses to pin
   it. It is not PII in a URL (a server-to-Pushover POST body, the alert text), so it is not a
   privacy bug, but no pin can make it green. Decision needed: (a) give T-59 a separate,
   file-scoped list of POST-body keys exempt from rule (b), or (b) have the Pushover adapter send
   JSON (a TASK-488 follow-up in app code). `url-pii.test.ts` stays red on exactly that one line
   until then.
2. **`pnpm i18n:check` still exits 1 with 16 findings that are not the API-route or type-only
   kind**: 6 unused keys (`nav.send`, `search.suggest.kind.{product,occasion,category,destination,page}`);
   5 key reads from outside their entry's `paths` (`src/modules/ui/checkout/payment/PaymentPanel.tsx`
   `checkout.error.unable` and `payments.error.generic`, `controller.ts` `payments.error.unavailable`,
   `PayButton.tsx` `checkout.legal.payButton`, `PreContractBlock.tsx` `checkout.legal.cancellation`);
   5 import-rule findings for `src/modules/notifications/emails/{basket-reminder,copy,html,layout,theme}.ts`
   (entry `tracking`) through a real value chain: `src/app/[locale]/-search/limited/page.tsx` ->
   `modules/search` -> `modules/ops` (`raiseLegacyAlert`) -> `modules/ops/dispatch.ts` ->
   `modules/notifications/index.ts`, which re-exports the TASK-449 basket-reminder email. Each needs
   its own task (catalogue cleanup, scope paths, and the notifications barrel).

## Progress

- 2026-11-11: `src/app/api/` is a non-indexable app directory; type-only imports are not import-rule
  edges (the 33 GA4 findings were `import type { StepScreen }` from `@/modules/checkout`).
- 2026-11-11: T-59 pins 44 new query keys and 6 new segment names; one key (`message`) escalated.

## Result

- Part 1: `scripts/i18n-check-scope.ts` adds `src/app/api/` to `NON_INDEXABLE_APP_DIRECTORIES` and
  drops type-only imports (`import type`, `export type ... from`, all-`type` named imports) from the
  import graph. `pnpm i18n:check`: 49 -> 16 findings, none of the fixed kinds (Escalation 2).
  Tests: `tests/unit/i18n-scope-admin-roots.test.ts` (6, green).
- Part 2: `tests/unit/url-pii.test.ts` pins the new keys and segments; 11 of 15 green, the 4 red
  ones fail only on `pushover.ts:135 message` (Escalation 1). No personal field found in any URL.
- No build: tooling and tests only.
