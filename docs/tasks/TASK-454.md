# TASK-454 — Spec 046 parity check: migration `NNNN_merchant_feed_check` + down, the daily `merchant.feed.verify` job (price, canonical, JSON-LD, availability, image against the live pages), its retention row and Sentry alerts

Row: `TASKS.md` → TASK-454. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-454`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 046 approved by the founder 2026-10-24 ("specs ok", every open-question default: destination-country targeting only, native-currency locales only, real photographs only, default size only, public feed URL).
- **Owns** AC-21, AC-24.
- **Migration** `NNNN_merchant_feed_check` + `.down.sql` as §5.1 (no audit trigger, RLS admin read, job writes through `withSystemContext('merchant.feed.verify')`), retention row deleting rows older than 90 days through `retention.sweep`.
- **Job** `merchant.feed.verify` daily at 04:00 Europe/Amsterdam for each flagged feed with at least one item: up to 50 items (rotating deterministic sample beyond), GET `link` and `image_link` through the edge, compare HTTP 200, canonical, JSON-LD price, currency and availability, and the visible default price against `formatMoney` in the feed's locale; one row per run, idempotent by feed key and local date; Sentry on `failed` or `error`; a warning after two consecutive zero-item runs of a flagged feed. Rows and events hold public values only, no query string.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/046-google-merchant-feed.md`: `## 0. Index` first, then §2, §5, §5.1, §5.2 (jobs row), §11
- `src/jobs/`, `src/jobs/retention.ts`
- `docs/codebase-map.md`

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
