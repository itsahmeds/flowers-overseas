# TASK-213 — Spec 011 application form live: the server action, `FloristApplicationInputSchema`, `dbApplicationSink`, the honeypot, rate limit and bounded body, the notice at collection, the alert email template, `applicationForm: "on"`, and `listFloristApplications` and `setFloristApplicationStatus` for spec 012

Row: `TASKS.md` → TASK-213. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-213`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 5. Owns **AC-11, AC-12, AC-13, AC-15, AC-16**; tests **T-11, T-12, T-13, T-15, T-16**.
- **The form (§2, §5.2):** a plain `<form method="post">` with a thin server action under `src/app/`; `FloristApplicationInputSchema` `.strict()`; the honeypot before the schema; `createRateLimiter` per instance; `readBoundedBody` at 64 KB; no IP or user agent read. Zod issues map to `forFlorists.apply.error.*` keys. `useActionState` only as enhancement.
- **The write:** `ApplicationSink` with `dbApplicationSink` under `withDbContext({ role: "public" })`, no `RETURNING`; success redirects to the sent page with no query string; `privacy_notice_version` stored; the notice at collection beside the form.
- **The alert:** `mailerApplicationAlert` through TASK-217's `Mailer` to `FLORIST_APPLICATIONS_NOTIFY_EMAIL`, tag `florist_application_alert`, template under `emails/`; a failed alert is a Sentry warning with no field value and the row stays.
- **Admin queries for spec 012 (the only application queries in the codebase):** `listFloristApplications(adminCtx, { status? })` and `setFloristApplicationStatus(adminCtx, id, status)` (sets `decided_at` for `rejected` and `converted`, runs inside spec 012's `withAdminContext`, writes no audit row itself).
- **The switch:** `applicationForm: "on"` only once the migration is applied to the production database (§12).
- **Logs:** counters only; the redaction list gains the §8 keys.
- **Env keys (DoD §5; `/review 191` item 2):** this task is the first reader of `FLORIST_APPLICATIONS_NOTIFY_EMAIL` (required in production once the form is on, §12), so it declares it in `.env.example` and `src/lib/env.schema.ts` (validated by `lib/env.ts`) in its own PR and reads it only through `lib/env`. TASK-216 adds it to `config/railway.json` and runs `pnpm env:check` and `pnpm railway:check`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): a new personal-data flow, the Art. 13 notice and email. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §2 "The application form"; §5.2 "Application"; §8; §9 AC-11–AC-13, AC-15, AC-16; §12 task 5.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/for-florists-apply-desktop.dc.html`, `docs/design/wireframes/for-florists-apply-mobile.dc.html` (the honeypot state included; the "optional" tag and the sent page's link are founder copy slots).
- `docs/codebase-map.md`; `src/lib/reminders.ts` (the `ReminderSink` precedent), `src/lib/csp-report.ts`; `docs/tasks/TASK-217.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the founder names the alert address (§13 Q8, prerequisite 5) before the form flips on; TASK-216 adds the key to `config/railway.json`.

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
