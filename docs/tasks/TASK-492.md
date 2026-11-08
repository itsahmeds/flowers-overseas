# TASK-492 — GA4 client: the bootstrap without `js`/`config`, the deferred loader after a grant, withdrawal, page view and the ecommerce events built from the page view models (incl. step 4 Pay, `checkout_channel`, `select_payment_method`, `login`), `web-vitals`, the consent-active CSP, the budget step

Row: `TASKS.md` → TASK-492. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-492`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 023 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-17, AC-18, AC-31, AC-33.
- **No request to any Google origin and no Google `<script>` before an analytics grant**, on every build. `CONSENT_BOOTSTRAP_SCRIPT` keeps the default-denied state but no `js` or `config`; after a grant the deferred loader injects `gtag.js` after `load` when idle, with §5.2's config options; withdrawal sets `ga-disable-*`, pushes `analytics_storage: denied` and deletes `_ga` and `_ga_*`.
- **Budget:** first load at most 256 B Brotli more than main's on the 16 Lighthouse URLs, the deferred chunk at most 4 096 B and in no initial chunk set; `gtag.js` never loads in a Lighthouse run. Cached HTML byte-identical with and without consent cookies (AC-33).
- **Events** built on the server from the page's view model (value = the price on screen) through TASK-491's builders; `page_location` sanitised (token paths, dropped query keys). **§14 A-orchestrator-2026-10-25:** `add_payment_info` on Pay at step 4; step 3 sends nothing; `begin_checkout` with `checkout_channel`; `select_payment_method` from both express panels; `payment_type` gains `link`; `login` with `method`.
- **`web-vitals`** in the deferred chunk (§13 Q9; one pinned dependency, `pnpm audit` clean). CSP origins only in the consent-active build.
- **Requirements on spec 004** (§12): `data-fo-ga4` instead of a tag element in clause 8's fixture; AC-19(b) starts the loader.

## Read

- `specs/023-analytics-ga4.md`: `## 0. Index` first, then §2 A, B; §5.0 to §5.3; §9 AC-1 to AC-14, AC-17, AC-18, AC-31, AC-33; §12; §14
- `docs/codebase-map.md`: where everything lives
- `src/modules/analytics/`, `src/lib/consent-bootstrap.ts`, `src/lib/consent.ts`, `src/app/[locale]/layout.tsx`
- spec 004 AC-18 to AC-24 and its `budget:client-js` step

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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
