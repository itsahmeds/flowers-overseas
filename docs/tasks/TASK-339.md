# TASK-339 — Spec 018 tracking lookup, refund lines and cancelled states (task 2, part b): `buyerRefundLines` over spec 013's `succeededRefunds`, the refund line and pending sentence, "You cancelled" / "We could not deliver" by actor class, `/{locale}/track` lookup with T16 and identical responses, GA4 and Sentry token scrubbers, the "Track an order" footer link

Row: `TASKS.md` → TASK-339. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-339`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-338, TASK-261.
- Spec 018 §12 task 2; §5.2 refund lines, cancelled, lookup; §11. AC-8, AC-10 (tracking page), AC-14, AC-42.
- One "Refunded {amount} on {date}" per succeeded refund, oldest first, dated by `refund.succeeded_at`, never an event time; a `refunded_full` order reads `closed`, never `cancelled`; partial refund keeps the fulfilment headline.
- Cancelled by `buyer` reads "You cancelled this order."; any other actor reads "We could not deliver this order." with no reason. Pending full refund: "We are refunding {amount} to your original payment method." until it succeeds.
- Lookup: byte-identical HTML for match, wrong email, unknown reference and over-limit (3 per hour on the hashed address); only a match within limit sends T16. No IP read or stored.
- **ACs owned:** AC-8, AC-10 (tracking page), AC-14, AC-42 (T-08, T-10 tracking half, T-14, T-42).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** refund rows in each of `requested`, `pending`, `succeeded`, `failed`, `cancelled`; a refund that settles after the order left the allowed set (no order event, line still shows); 1 minor unit and a large amount in PLN and GBP in `pl` and `en-gb`; a fourth lookup in an hour; `payment_failed` and `abandoned` show no refund text; a token in `?t=` and in the path scrubbed from GA4 `page_location` and Sentry breadcrumbs. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.2, §9 AC-8, AC-10, AC-14, AC-42, §10 matching T
- specs/013 §5.2 `succeededRefunds`; `docs/tasks/TASK-261.md`
- `src/modules/analytics/ga4.ts`, `src/lib/csp.ts`
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
