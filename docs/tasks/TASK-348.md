# TASK-348 — Spec 010 basket, draft lines and actions: migration `NNNN_checkout_draft_lines` + down (reshapes `0015_checkout_draft`; the two retention rows), the start route's append with `then` and its refusals through `pending_notice`, `removeLine`, `updateLine`, `useNextDate`, the line position on every step action with a per-line compare-and-set, `fo_checkout` at 30 days and `fo_basket`, `BASKET_MAX_LINES`

Row: `TASKS.md` → TASK-348. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-348`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-203, TASK-347.
- Spec 010 §14 A-founder-2026-10-22 items 1 (D3 to D8, D12), 2 B and C, 4, 7 and 14 ("New, backend: basket data and actions"). Owns the rewritten AC-6 (TASK-203 owned the original) and AC-54, AC-55, AC-56, AC-59 (server half), AC-60 (server half), AC-61, AC-62, AC-66 (draft half), AC-76, AC-78.
- `CheckoutStartSchema.then`, `LinePositionSchema` (`z.coerce.number().int().min(1).max(BASKET_MAX_LINES)`), a test pinning the migration's `position BETWEEN 1 AND 5` equal to `BASKET_MAX_LINES`. Refusals (cap, mode, unpriceable currency, closed destination) write nothing and 303 to `/{locale}/basket`; the notice travels in `checkout_draft.pending_notice`, never a query string. Only `no-store` responses set `fo_checkout` or `fo_basket`; `fo_basket` is digits only, not `HttpOnly`, deleted at zero.
- **Carry-forward from TASK-203:** its hole 17 (compare-and-set) extends to every line action. `last_seen_total_minor` sits beside its own currency FK so `db:check`'s money-pair gate passes; record how in the PR.
- **Same agent and feature PR as TASK-347.**
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** two parallel appends (positions 1 and 2, no gap); an append with a placed draft's cookie (new token, old draft byte-equal); the sixth add and a raw insert at position 6; a `pl` PDP total in PLN added to a GBP basket; stale FX; a `closed` destination; a line's date crossing its cutoff on the Warsaw DST night (2026-10-25); a price change on line 2 only; `line=0`, `line=6`, `line=x`; the down file with a three-line draft and a one-line draft (counts printed); `Accept-Language`, residence and IP fixtures giving identical integers.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/010-checkout.md`: `## 0. Index`, then §14 A-founder-2026-10-22 items 1, 2, 4, 7, 8, 14 and the ACs above
- `docs/tasks/TASK-203.md` (the draft service, its hole 17), `db/migrations/0015_checkout_draft.sql`, `src/config/cookies.ts`
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
