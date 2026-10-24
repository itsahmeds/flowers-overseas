# TASK-353 — Spec 018 occasion reminders (row B): `createReminder`, `removeReminder`, `setReminderConsent` with `consent_log`, the `reminders.daily` job and T18, `POST /api/reminders/unsubscribe` (RFC 8058) and its page, the `Mailer` `headers` field (`List-Unsubscribe` and `List-Unsubscribe-Post` only), the `unsubscribe` signed-link purpose, the reminders page

Row: `TASKS.md` → TASK-353. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-353`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-352, TASK-337, TASK-332, PR 336 (design).
- Spec 018 §14 A-founder-2026-10-22 C.7.4, C.11 (`unsubscribe` purpose), C.12, C.13 (reminders rows), C.18 (spec 012 `Mailer` headers) and advisor memo "New row B". Owns AC-56, AC-57, AC-58.
- Separate explicit consent, independent of `marketing_consent` both ways; withdrawal deletes the customer's reminders; T18 shows no price and carries the two RFC 8058 headers; 29 February fires for 28 February in a common year; idempotent through `last_sent_for`.
- T18 uses spec 016's email layout (TASK-332).
- **Built from the merged artboards** of PR 336 (`account-reminders-*`, `email-account-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the lead-day boundary (lead minus 1, lead, lead plus 1); a same-day rerun; 29 February with 7 days' lead in 2027; consent off and redacted customers; a forged unsubscribe token (identical 200 body); a `GET` of the unsubscribe page (no write); `(2, 30)` refused and `(2, 29)` accepted.
- **Founder rulings bind every buyer line** (specs 013, 016, 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/018-tracking-account.md` §14 A-founder-2026-10-22 C.7.4, C.11, C.12, C.15, C.16, AC-56 to AC-58
- `src/lib/signed-link.ts` (TASK-337), `src/modules/notifications/mailer.ts`, `docs/tasks/TASK-332.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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
