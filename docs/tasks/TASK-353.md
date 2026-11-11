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

- 2026-11-11 (TASK-353, PR 541, left open by the implementer):
  - **Sender.** T18 goes from `EMAIL_FROM` (the transactional stream), as `email-account-*` draws it. Spec 034's
    `marketing` stream (`MARKETING_MAIL_FROM`, its own subdomain) may be the better home for consent-based mail;
    switching is one `stream: "marketing"` in `src/jobs/occasion-reminders.ts` once the founder decides.
  - **Suppression.** T18 does not read spec 034's `email_suppression`; a bounce or complaint stops nothing but
    the one-click stop does. A later task can add the check to `dueReminders`.
  - **Missed day.** If `reminders.daily` fails every retry on a day (alert `reminders.daily_failed`), that day's
    reminders are not caught up the next day: each run looks only at its own UTC date.
  - **Copy.** 39 new `en` texts (`account.nav.reminders`, `account.reminders.*`, `emails.account.reminder.*`) ship
    `reviewed: false`; `.claude/state/record-approval-353.py --check` passes. de and pl are echoes. Two choices
    against C.15's table, both from the boards: the body's second sentence is its own key `time` (T18 draws two
    lines), and the occasion inside the sentence is lower case (`emails.account.reminder.occasion`, the designer's
    escalation) with `occasionTitle` for the subject. The one-click `POST` answers the done sentence in English (the
    request carries no locale).
  - **Browser half.** No Playwright, axe or visual baseline for the two pages: T-58's e2e half and AC-33's axe and
    keyboard are TASK-346's. A `GET` of the stop page writes nothing by construction (it renders one form; the
    write is the server action on `POST`); the API's `GET` answers 405 (unit test).
  - **RoPA and cookies** for reminders: TASK-346 (C.16).
  - **Refused add.** A refused add (no consent, no such date, 50 reached) redirects with an error code only, so
    the posted values are not kept (no date or name in a URL).
  - **Main is red elsewhere** (not this task): `tests/unit/i18n-review-scope.test.ts` (registry drift) and
    `tests/unit/i18n-messages.test.ts` (namespaces `account`, `auth`) fail on `origin/main` too.
  - `DECLARED_JOBS` still lists `occasion.reminders` (`plan/01` §8's placeholder); `reminders.daily` is the job.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11: worktree `../fo-wt-353`, branch `task/TASK-353-occasion-reminders`; row in progress. The `Mailer` `headers` field already shipped with spec 034 (TASK-450), so this task reuses it. No migration needed (0045 has the table and columns).
- 2026-11-11: built and pushed: customers `reminders.ts` (consent, create, remove, stop, daily send), T18, the job and
  the tick, `POST /api/reminders/unsubscribe`, the reminders page and the stop page; unit 19 and integration 14 green;
  rebased on `origin/main`; clean-env build exit 0. Ready for the orchestrator.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 541. `src/modules/customers/reminders.ts`: `createReminder` (consent needed the first time, then one
`consent_log` row `{"occasion_reminders": true}`, a fresh 22-character unsubscribe token, in one `system`
transaction with the reminder; a foreign saved recipient refused), `removeReminder` (RLS), `setReminderConsent`
(off deletes every reminder), `unsubscribeReminders` (signed `t`, purpose `unsubscribe`), `reminderTargets` (29
February for 28 February in a common year), `runOccasionReminders` (claim through `last_sent_for` in the send's
transaction). T18 in `src/modules/notifications/emails/occasion-reminder.ts`; the job `reminders.daily` (tick: once
per UTC day, `startAfter` 07:00 UTC; alert on failure); `POST /api/reminders/unsubscribe` (RFC 8058, same 200 body
for any token, 400 other bodies, 405 `GET`); `/{locale}/account/reminders` and `/{locale}/account/reminders/
unsubscribe`; the side list's Reminders item; the i18n `monthName` date style. Tests: unit 19
(`occasion-reminders.test.ts`) plus the job registry, runtime and tick lists; integration 14
(`occasion-reminders.test.ts`, PG16). The clean-env `next build` ran in the build slot because the work order requires
it before ready (exit 0). Carry-forwards above.
