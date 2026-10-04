# TASK-216 — Spec 011 close-out: the staging end-to-end path, axe and keyboard runs, visual baselines, RoPA rows, the cookie register, `R2_PRIVATE_BUCKET` and `FLORIST_APPLICATIONS_NOTIFY_EMAIL` in env and Railway, `docs/runbooks/florists.md`, codebase map, README

Row: `TASKS.md` → TASK-216. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-216`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 8, the one gates task of spec 011. Owns **AC-34, AC-36, AC-37**; tests **T-34, T-36, T-37**.
- **Gates:** axe on the templates AC-34 lists at 390 and 1440 px; keyboard-only runs of the application and of accept → delivered with photo; visual baselines for those templates; on staging, AC-37's full path with the event types equal to the fixture sequence exactly.
- **Records:** the four RoPA rows of §8; the florist uses on spec 012's Resend processor row (ruling R10: TASK-223 owns the row; whichever of the two merges second extends the other's); the three florist cookies in `src/config/cookies.ts` (`pnpm cookies:check`); `R2_PRIVATE_BUCKET` and `FLORIST_APPLICATIONS_NOTIFY_EMAIL` in `.env.example`, `src/lib/env.schema.ts` and `config/railway.json` (`pnpm env:check`, `pnpm railway:check`); `docs/runbooks/florists.md` in the runbook index (demo members, a demo call including telling the florist that photos are deleted with the demo order after 30 days, applications, retention, the Cloudflare edge rate-limit rule as a founder action, moving the mount point in spec 026); `pnpm codebase:map --check`; README scripts.
- **Class:** not review-only (`CLAUDE.md` DoD §4): env and Railway declarations, compliance records and CI gates. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §8; §11; §12 (environments, keys, founder prerequisites); §9 AC-34, AC-36, AC-37; Appendix B.
- `specs/012-admin-v0.md` §8 item 2 (the Resend row).

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
