# TASK-344 — Spec 018 customer account (task 4, after launch): the account surface on spec 012's core (`__Host-fo-account.*`, `/{locale}/account`), T14, orders list and detail with refund lines and the recipient recap until the sweep, "Cancel for free" from the detail, the owner-session invoice download, the footer link and confirmation nudge, the cookie register

Row: `TASKS.md` → TASK-344. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-344`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-337, TASK-340, TASK-342, TASK-217.
- Spec 018 §12 task 4; §5.2 account sign-in; §13 Q3, Q10, Q14. AC-10 (account), AC-13 (account half), AC-23 (owner half), AC-24 to AC-26, AC-28 (account half), AC-34 (account half), AC-36.
- No Auth.js configuration, adapter or mailer outside `src/lib/auth/`; `accountSignInPolicy` sends a link only to an address with a live order (test too outside production); identical page otherwise.
- Public ISR pages byte-identical with and without the account cookie, no `Set-Cookie`, no `Vary: Cookie` (AC-36).
- **Design check before building:** if `docs/design/` has no account list, detail and sign-in boards, stop and ask for `/design 018` account screens.
- **ACs owned:** AC-10 (account), AC-13 (account half), AC-23 (owner half), AC-24, AC-25, AC-26, AC-28 (account half), AC-34 (account half), AC-36 (T-10 account half, T-13 account half, T-23 owner half, T-24 to T-27, T-28 account half, T-35).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** a replayed session cookie after sign-out; admin and florist cookies presented to account routes; another customer's order by reference (404 under RLS); the 61st minute of a link; GET twice then POST; detail before and after the 91-day sweep. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.2 account, §5.3, §9 AC-10, AC-13, AC-23 to AC-26, AC-28, AC-34, AC-36, §10 matching T
- specs/012 sign-in core; specs/011 §12 link design
- `docs/compliance/cookie-register.md`
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
