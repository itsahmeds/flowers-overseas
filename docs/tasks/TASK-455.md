# TASK-455 — Spec 046 admin feeds pages and the e2e parity test: `/admin/feeds` and `/admin/feeds/[feedKey]` (URLs, gates, served and preview counts, exclusions, last runs), `feeds.view`, `admin.feeds.*` keys, runbook `google-merchant-center.md`

Row: `TASKS.md` → TASK-455. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-455`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 046 approved by the founder 2026-10-24 ("specs ok", every open-question default: destination-country targeting only, native-currency locales only, real photographs only, default size only, public feed URL).
- **Blocked on design.** Spec 046 §5.3 asks for `admin-feeds` and `admin-feed-detail` artboards (1440 and 390, v2 admin system, `[internal]` block) and none are in `docs/design/` yet. Run `/design 046`, merge it, then set this row `todo`.
- **Owns** AC-18, AC-22, AC-23.
- **Pages** `/admin/feeds` and `/admin/feeds/[feedKey]` (§5.3), `requirePermission('feeds.view')` first (admin, content, ops; finance 403), read-only, server components, the preview label on every view, the feed URL with a copy control, gate states, served and preview counts, exclusions in plain words, the last 14 runs. Keys only under `admin.feeds` in `messages/admin/en.json`.
- **E2e parity (AC-18):** visits every item `link` of the e2e preview feed and asserts canonical and visible price; fails when the preview is empty.
- **Runbook** `docs/runbooks/google-merchant-center.md`: the founder's account steps (§12 1 to 9), gates G1 to G5, the weekly disapproval check, rollback. Founder only signs in to Merchant Center; no Google key is created.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/046-google-merchant-feed.md`: `## 0. Index` first, then §2, §5, §5.3, §12 (founder steps, gates)
- `src/app/admin/(signed-in)/`, `src/modules/admin/permissions.ts`
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
