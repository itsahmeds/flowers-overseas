# TASK-327 — Spec 016 routing rules, pure, and the routing migration (task 1a): `eligibleCandidates`, `rankCandidates`, `offerWindow`, `graceEnd`, `expectedFirstOfferAt`, `canServe`; migration `NNNN_routing_notifications` + down (`withdrawn_at`/`withdrawn_reason`, `notification_delivery` with `attached_invoice_id`, `webhook_inbox` accepts `resend`, flags `routing.auto` and `notifications.email`)

Row: `TASKS.md` → TASK-327. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-327`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-337, TASK-245, TASK-019, TASK-020.
- Spec 016 §12 task 1a; §5.1 and §5.2 "Routing functions". AC-2, AC-3, AC-4, AC-27, AC-35.
- **Spec 002 §14 A8 is not in this migration:** TASK-337 (spec 018 task 1) ships it, because its migration lands first and creates the `invoice` table that `notification_delivery.attached_invoice_id` references. If TASK-337 has not merged when the pure functions are done, push them and wait for it before adding the migration.
- `offerWindow`: night rule first (20:00 to 07:30 → offer 07:30, SLA 08:00 same-day, 09:00 otherwise), then 07:30 to 08:00, then same-day 30 min, then 60 min; never past the routing deadline (same-day cutoff + 2 h). `graceEnd`: due today +2 h; else the first 10:00 local at least 2 h after exhaustion; capped at the deadline. Absolute instants, zone helpers of spec 009, never added hours.
- `canServe` accepts a null `cityId` and matches by postcode zone alone (spec 010 §13 Q13); export it from the routing module's `index.ts` and register it through spec 010's `registerCoverageCheck` (A3.2) when that seam exists (TASK-204); if it does not exist yet, say so in `## Result` and leave the registration to TASK-204.
- `notification_delivery` holds no address, name or subject column (AC-20 is TASK-331's, the schema must already allow it).
- **ACs owned:** AC-2, AC-3, AC-4, AC-27, AC-35 (T-02, T-03, T-04, T-27, T-35).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** DST nights 25 Oct 2026 and 28 Mar 2027 in Europe/Warsaw and Europe/London; exact boundaries 07:30:00, 08:00:00, 20:00:00 and one second either side; same-day order secured at 06:00 (07:30 / 08:00); an SLA or grace end that would pass the routing deadline; null rating and fewer than 5 offers; two candidates tied on every key (partner id decides); mode pairing both ways (live→active, test→demo); migration up, down, up on a seeded database. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: `## 0. Index`, §5.1, §5.2 "Routing functions", §9 AC-2 to AC-4, AC-27, AC-35, §10 T-02 to T-04, T-27, T-35
- specs/010 §14 A3.2 (`registerCoverageCheck`, `canServe` contract)
- spec 009's zone helpers (`docs/codebase-map.md`), `db/migrations/0007_orders_payments.sql`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** spec 022a §12: `rankCandidates` reads a null `rating_90d_bp` as 9000 (the encoding is mean × 2000 in basis points, 4.50 = 9000; TASK-372's AC-22 fixture checks it). Spec 010 item 13: routing stays per order; `canServe` is called per basket line at step 1 and at placement.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-01, the rating band (open, not blocking; to the orchestrator in PR 445).** §5.2's key reads "inside the best-rating band before outside it, then rating descending". Read literally the band is redundant (every in-band rating is above every out-of-band one), so AC-3's "including the 95 % rating band" and T-50's band mutation could never go red. Built as `plan/06` §5.2 rule 2c reads: inside the band ratings count as equal (acceptance, then payout, then round-robin decide); outside it, rating descending. One line to change back (`rankByKey` in `src/modules/orders/routing/candidates.ts`) if the literal reading is wanted.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-01: pure rules (`src/modules/orders/routing/`), `instantAt` in spec 009's zone helpers, `src/config/routing.ts`; unit tests T-02, T-03, T-04, T-27, T-35, T-50, T-51 with 40 mutations, each red.
- 2026-11-01: rebased onto PR 408 (`task/TASK-368-reviews-data`, migration 0029) and added `0030_routing_notifications` + down, the Drizzle mirror, `db/rls.ts`, the two flags (registry, admin copy, confirm bodies), `db:check` snapshot; integration T-49 with 10 mutations, each red. PR 445 is stacked on PR 408.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 445 (stacked on PR 408; migration **0030**, renumbered at rebase if the stack order changes). Pure routing rules in `src/modules/orders/routing/` (`eligibleCandidates`, `rankCandidates` with the owner, `ownerOfOrder`, `offerWindow`, `routingDeadline`, `graceEnd`, `expectedFirstOfferAt`, `servability` and `createCanServe`), their numbers in `src/config/routing.ts`, and `instantAt` (wall clock to instant) in `src/modules/geo/delivery/zone.ts`. Migration `0030_routing_notifications` + down: `order_assignment.withdrawn_at`/`withdrawn_reason`, `notification_delivery` (with `purchase_id`, no `attached_invoice_id`, `recipient_ref` checked to `buyer`/`ops`/a user id), `notification_delivery_invoice`, staff-only RLS, `webhook_inbox` accepts `resend`, flags `routing.auto` and `notifications.email` (high-risk, on). Tests: unit 95 in two new files (plus updated registry, shape and migration-list tests), integration 8 in one new file (plus flags and ops counts). AC-2, AC-3, AC-4, AC-27, AC-35, AC-49, AC-50, AC-51.
Handed on: (1) the database reader behind `createCanServe` (`CoverageReader`: the postcode's zone by longest prefix and the partner snapshots with load, members, rating and last offer) is spec 016 task 1b's (TASK-328), which needs the same read for `order.route`; (2) spec 010's `registerCoverageCheck` seam does not exist yet, so registering `canServe` is TASK-204's; (3) "a cancelled order mid-routing" is not reachable in pure rules: `order.route` must re-read the status after its lock (TASK-328), and the withdrawal columns are here for it; (4) the signature differs from §5.2 in two declared ways: `eligibleCandidates(order, partners, { signInStatuses })` takes spec 011's `signInPolicy` answer instead of `now` (TASK-212 has not built the policy), and the window functions take `{ ianaZone, sameDayCutoffLocal }` because the routing deadline needs the cutoff.
