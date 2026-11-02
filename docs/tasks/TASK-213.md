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
- **From the implementer's self-review (2026-11-02), left for later tasks:**
  1. **AC-13's 429 is a state, not a status code.** A server action has no way to set the HTTP status, and the artboard draws "too many at once" as a state of the form (answers kept, phone and WhatsApp offered), which is what ships. A real `429` would need the form to post to a route handler, which then cannot re-render the form JavaScript-off. Recorded, not escalated: the visitor sees exactly the designed state.
  2. **The 64 KB bound reads the declared `Content-Length` in the proxy, not `readBoundedBody`.** Next's action runtime parses the body before the action runs; reading a clone in the proxy would make the proxy asynchronous for every request of the site (and rewrite four proxy test files). A chunked body with no declared length falls to Next's own server-action limit (1 MB, a 413 from Next) and then to the schema's field bounds, which write no row. `src/lib/application-gate.ts` says so.
  3. **TASK-216:** `FLORIST_APPLICATIONS_NOTIFY_EMAIL` into `config/railway.json` and the live Railway variables of staging and production (the contract now has 39 keys; `pnpm railway:check` reports it missing until then), the RoPA rows of §8, the runbook, axe and visual baselines of the apply page's error, failed and too-many states.
  4. **Template location:** the alert is `src/modules/partners/application/alert.ts`, beside the two sign-in emails, not under a top-level `emails/` (their precedent: no new code root, no React Email dependency for one message).
  5. **`language_code` is the applicant's chosen language** (`en`, `pl`, `de`, prefilled from the page), so an `en-gb` page stores `en`; for `en`, `de` and `pl` pages with the default answer it equals the page locale, as AC-11 reads.
  6. **Pre-existing on main, not this task's:** `pnpm i18n:check` reports `nav.category.ourSelection` and `nav.send` unused (7 failures in `tests/unit/i18n-check.test.ts`, identical on `cef7c35e6`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-02 backend-implementer: built on `origin/main` `cef7c35e6` (TASK-210, TASK-211, TASK-217 merged). Schema, submit, form post, sink, alert, notice version, admin queries, proxy body bound, the form island and its states, `applicationForm: "on"`, env key, redaction keys, review-scope entries, copy (21 new keys, `reviewed: false`). Unit, render and integration tests green; PR 453.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 453](https://github.com/itsahmeds/flowers-overseas/pull/453): the application form is live in
config (`applicationForm: "on"`). A JavaScript-off post goes through `submitFloristApplicationAction`
(`src/app/[locale]/for-florists/apply/actions.ts`, shared by the three spellings) into
`applicationPost` (limit 10 per minute per instance), the honeypot, `FloristApplicationInputSchema`
(`.strict()`), `dbApplicationSink` (public role, no `RETURNING`) and the founder alert (tag
`florist_application_alert`, `FLORIST_APPLICATIONS_NOTIFY_EMAIL`), then a 303 to the sent page. The
form is one client island (`ApplyForm.tsx`) for `useActionState`; error summary, field errors,
send-failed and too-many states as the artboard draws them. The proxy answers 413 to a post
declaring more than 64 KB. `listFloristApplications` and `setFloristApplicationStatus` are exported
from `@/modules/partners` for spec 012. No migration (TASK-211's `0022` carries every column).
Tests: unit `florist-application.test.ts` (35), render `florist-apply-form.test.tsx` (6),
integration `florist-applications.test.ts` (5); updated pins in `env.test.ts`,
`railway-check.test.ts`, `auth-surface-schema.test.ts`, `florists-config.test.ts`,
`i18n-review-scope.test.ts`. No build, e2e or browser run locally (founder 2026-11-02: no CI wait).
**For the founder:** name the alert address and set `FLORIST_APPLICATIONS_NOTIFY_EMAIL` on Railway
(production and staging); confirm `0022` is applied to the production database before this
deploys (the form writes to its columns); 21 new copy keys await the delegated copy record
(listed in the PR).
