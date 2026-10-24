# TASK-337 — Spec 018 data and seams (task 1): migration `NNNN_post_purchase` + down (`order.tracking_token_version`, `public_token` default and check with backfill, `fulfillment_partner.display_first_name`, `tax_registration`, `invoice_series`, `invoice_profile`, `invoice` with the immutability trigger, RLS, flags `account` and `invoice.issue`) carrying spec 002 §14 A8 (`sessions.created_at`, the two `no_partner_available` rows), `src/lib/signed-link.ts`, `SIGNED_LINK_SECRET`, robots disallows, `scripts/check-relay-language.ts`, the DSAR runbook check

Row: `TASKS.md` → TASK-337. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-337`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-254, TASK-245, TASK-025.
- Spec 018 §12 task 1; §5.1; §5.2 `signed-link.ts`. AC-1, AC-2, AC-13 (track half), AC-16 (trigger half), AC-27 (schema half), AC-38.
- **Spec 002 §14 A8 ships here** (orchestrator, 2026-10-22): `sessions.created_at timestamptz NOT NULL DEFAULT now()` and the two `order_transition` rows (`authorised` and `paid_unrouted` × `order.no_partner_available` → `no_partner_available`, `allowed_actors = {system}`), with the order-machine fixture at 75 rows. Down file reverses each.
- Reads spec 010's `order_reference(uuid)` and `order_reference_idx`; creates neither. Orders after spec 013's A7 migration (TASK-254).
- Signed links: HMAC-SHA-256, purpose-prefixed input `purpose:v1:`, 16-byte MAC, `timingSafeEqual`, `expiresAt` inside the MAC, one failure value for every cause. `SIGNED_LINK_SECRET` in `src/lib/env.ts`, `.env.example`, `config/railway.json`.
- Seed one active `principal/PL` profile and an inactive `agent/PL` fixture with `issuer_statement_key = NULL`. No address-book column, route or retention row (AC-27).
- Check `docs/runbooks/dsar.md` covers the by-hand path (verify, export by SQL, erase, received and due dates, one calendar month) and the dated log of §13 Q16 in `docs/compliance/`.
- **ACs owned:** AC-1, AC-2, AC-13 (`/*/track/` half), AC-16 (trigger half), AC-27 (schema half), AC-38 (T-01, T-02, T-13 track half, T-16 trigger half, T-36 schema half, T-38).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** migration up, down, up with existing demo orders (backfill of `public_token`); every single-byte flip of payload and MAC; a token signed for another purpose; `expiresAt` one second past; an `INSERT` through `place` naming no `public_token`; rotation: old token fails, new resolves, one `audit_log` row; a relay word added to a value, to a key name, and an emptied locale list each turn the scan red. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: `## 0. Index`, §5.1, §5.2 (signed links, read projections), §9 AC-1, AC-2, AC-13, AC-16, AC-27, AC-38, §12 task 1
- spec 002 §14 A8; `db/migrations/0017_payments_a7.sql`
- `src/config/honesty.ts`, `docs/runbooks/dsar.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** spec 018 §14 A-founder-2026-10-22 narrows AC-27 here: the schema half checks only that `recipient` has no saving column; "no `saved_recipient` retention row" and "no `recipients` route" are withdrawn, because TASK-352 adds both.

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
