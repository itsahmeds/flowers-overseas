# TASK-223 — Spec 012 records and close: `docs/runbooks/admin.md`, the four RoPA flows of §8, the cookie register's admin rows, `docs/architecture.md` (the sign-in core and its surfaces), `.env.example`, env schema and `config/railway.json` for the four keys, codebase map

Row: `TASKS.md` → TASK-223. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-223`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 14. Owns **AC-20**; test **T-23**.
- **Records (§2.7):** `docs/runbooks/admin.md` in the runbook index (sign in, grant a role, deactivate a user, onboard and activate a partner, answer applications, toggle the checkout flags, read the audit log, what to do when a toggle did not show); `docs/compliance/ropa.md` with the four flows of §8, including the Resend processor row (ruling R10: TASK-216 adds the florist uses; whichever merges second extends the other's); `docs/compliance/cookie-register.md` with the three admin cookies, path `/admin`; `docs/architecture.md` (the sign-in core and its surfaces, ownership of the write commands); `.env.example`, `src/lib/env.schema.ts` and `config/railway.json` with `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `MAILER` (`pnpm env:check`, `pnpm railway:check`); `pnpm codebase:map --check`.
- Spec 012 §15 (012b) is neither planned nor built. The two roadmap items of §12 go into `plan/09` only on the founder's approval; say so in the PR.
- **Class:** not review-only (`CLAUDE.md` DoD §4): env and Railway declarations and compliance records. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.7; §8; §12 (founder actions, roadmap items); §9 AC-20.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

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
