# TASK-351 — Spec 018 buyer surface, the core extension: the additive changes of §14 C.3 to spec 012's sign-in core (`name` `buyer`, `mailTags` `buyer_sign_in` and `occasion_reminder`, `cookiePath` `/`, `pagesFor(locale)`, `renderEmail` with a locale, the stored and validated return path, `signOutEverywhere`, the `afterSignIn` hook), with the admin and florist suites unmodified

Row: `TASKS.md` → TASK-351. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-351`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: TASK-212, TASK-217.
- Spec 018 §14 A-founder-2026-10-22 C.3 "Core extension" and C.4 (return path), C.10; `docs/advice/2026-10-22-spec-018-accounts-rows-and-design.md` (the split). Owns AC-47's core half; TASK-344 owns the buyer surface half (cookies, expiry, cross-surface checks).
- Additive only: the admin and florist surfaces' configuration, cookies and tests are not edited. The return-path validator admits only the surface's `returnTo` pattern; another origin, `//`, a backslash or an encoded scheme falls back to home (AC-50 is TASK-344's, but its unit cases may land here).
- Spec 012's `Mailer` is not changed here (the `headers` field is TASK-353's).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** spec 012's and 011's suites run unmodified before and after (paste both counts); `cookiePath` `/` with a page under `/en/account`; a return path `https://evil`, `//evil`, `/\evil`, `%2F%2Fevil`, `/en/admin`; `afterSignIn` throwing (the confirm must not half-commit); `signOutEverywhere` on a user with sessions on two surfaces.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/018-tracking-account.md` §14 A-founder-2026-10-22 C.2 to C.4, C.10, AC-47; `specs/012-admin-v0.md` §5.2 (the core)
- `src/lib/auth/`, `docs/tasks/TASK-212.md`, `docs/tasks/TASK-217.md`
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
