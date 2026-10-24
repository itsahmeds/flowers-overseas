# TASK-354 — Spec 026a the move to `/vendor` and the live policy: `FLORIST_BASE_PATH` `/vendor` and the route tree, `/demo/vendor-inbox` answering 404 with no redirect, `signInPolicy` production `["active", "paused"]`, the production 404 removed, the request-time status filter in `requireFloristContext`, `canAcceptFor` with the paused notice, the cookie register

Row: `TASKS.md` → TASK-354. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-354`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-212, TASK-214, TASK-215, PR 337 (design).
- Spec 026a §2 (mount point, who may sign in), §5.2, §5.4, §6, §12 task 1. Owns AC-1 to AC-6 and AC-12.
- `floristSurfaceOpen()` is removed with its callers. Status is read on every request; a refused accept raises `ASSIGNMENT_PARTNER_NOT_ACCEPTING`, writes nothing and renders spec 011's changed-state message; Decline is not gated. Every `/vendor` response, redirects and 404s included, carries `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; `robots.txt` keeps `Disallow: /vendor/`.
- **Same agent and feature PR as TASK-355 and TASK-356** (branch `task/TASK-354-vendor-live`, the PR names all three IDs).
- Copy: `floristInbox.paused.notice` in en, pl, de `reviewed: false` (florist scope).
- **Built from the merged artboards** of PR 337 (`florist-inbox-*`, `florist-sign-in-*`, `flows/florist-journey`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** five environments by five partner statuses by member or not, plus `"bogus"` (fails closed to production); a member of a demo and an active partner under production; a partner offboarded between two requests of one session; a forged accept from a paused shop under the row lock; the old path with every suffix (404, no `Location`); the locale proxy on `/vendor`, `/vendor/`, `/en/vendor`; public pages with and without the florist cookie (byte-equal).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/026a-florist-signin-live.md` (whole spec, 255 lines)
- `specs/011-for-florists-vendor-inbox.md` §5.2, §5.4; `docs/tasks/TASK-212.md`, `TASK-214.md`, `TASK-215.md`
- `src/config/florists.ts`, `src/lib/auth/florist.ts`, `config/cloudflare/edge.json`
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
