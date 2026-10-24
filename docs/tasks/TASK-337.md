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
- **From the implementer's self-review (2026-10-24), handed on:**
  - **TASK-338:** the rest of AC-13's track half needs the page: a `GET /en-gb/track` answering with `X-Robots-Tag: noindex, nofollow` and the robots meta, and no §5.3 path in any sitemap child. This task ships the two disallow lines and the Google-rules matcher cases only. `robots.ts` carries `/checkout/` but not spec 010's locale-prefixed `/*/checkout`, which AC-13 says sits beside the new lines: that line is spec 010's to add.
  - **TASK-338 / spec 020:** `pnpm orders:rotate-tracking --order <id>` is not built. `rotateTrackingToken(orderId, actor, { channel })` is exported from `@/modules/orders`; a script under `scripts/` cannot import it (Node's type stripping resolves neither `@/` nor the extensionless relative imports of `src/lib/env.*`), so the CLI needs a small runner or the admin button of spec 020.
  - **Task 3 (invoices):** the two series rows are `fo-pl-2026` and `fok-pl-2026` and the seeded profiles point at them; the year boundary (a 2027 series, the profile repointed) is the invoices runbook's. The profiles are seeded by `pnpm db:seed` (`seed/plan.ts`, `active` insert-only), not by the migration, because they reference the seeded `currency` table. `invoice.issue` is registered `standard` risk; spec 012/020 may want it `high` (typed confirmation).
  - **Task 5 (privacy):** the by-hand erasure in `docs/runbooks/dsar.md` uses spec 018 §5.2's placeholder `redacted+{id}@invalid`; `retention.sweep` writes `redacted-{id}@redacted.invalid`. Task 5 picks one. `docs/compliance/dsar-templates.md`, which the runbook has always named, does not exist yet.
  - **Task 6 pass A:** the RoPA row for invoices (spec 018 §12 task 6) is not written here.
  - **Spec 002 §14 A9** (`with_florist` → `confirmed`, and row 34 from three more states, 78 rows) is not in this migration: the brief named A8 only. A9.3 puts it in the next of spec 016's and 018's first migrations, so it falls to TASK-327 or to an amendment task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-24, declared deviations, decided by the implementer, not blocking (orchestrator may overrule):**
  1. The flag spec 018 §5.1 and §12 call `account` is `account.open`: `0009`'s `feature_flag_key_check` (and the registry's pattern) requires a dotted key; `checkout.open` is the precedent.
  2. `public_token`'s default is the first 16 bytes of `sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()))`, base64url, not pgcrypto's `gen_random_bytes(16)`: spec 002 AC-7 forbids every extension. Both draw on `pg_strong_random()`; 244 random input bits, 128 kept; same 22-character shape.
  3. The down file restores `"order".public_token` to `0007`'s shape (`NOT NULL`, the `{22,}` check, no default): `0007` already had both, so §5.1's "without default, `NOT NULL` or check" is read as "as before this migration". It also gives every rotated order (version above 1) a fresh `public_token`, so a token revoked by a rotation never verifies again after a down-then-up.
  4. The tracking link's end (§13 Q7), which §5.2 leaves to the implementer: local midnight starting the 91st day after the delivery date in the destination country's `iana_zone`, or 90 calendar days (in that zone) after the first `order_event` into a status whose `buyer_projection` is `cancelled`, whichever is earlier.
  5. Checks beyond §5.1's list, each tightening only: `tracking_token_version >= 1`, a non-blank `display_first_name`, an invoice answers no refund and a credit note corrects an invoice, the render columns all-or-none, `pdf_sha256` lower-case hex, an invoice in its order's currency (key `(order_id, currency_code)` to `"order" (id, buyer_currency_code)`, as `payment`), and `TRUNCATE` refused beside `UPDATE` and `DELETE`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24 implementer: worktree `../fo-wt-337`, draft PR #384. Migration `0019_post_purchase` + down, `src/lib/signed-link.ts`, `SIGNED_LINK_SECRET`, `tracking.linkFor` / `tracking.resolve` / `rotateTrackingToken`, robots lines, `scripts/check-relay-language.ts` (also `i18n:check` check 14), flags, seed profiles, DSAR runbook and log. Integration on a throwaway PG16 green; mutations all red. Next: rebase, ready, `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#384](https://github.com/itsahmeds/flowers-overseas/pull/384), migration **0019_post_purchase** (renumber at rebase if PR 320's `0019_review_attestation` lands first; the tests find the file by name). Ships spec 018 task 1 and spec 002 §14 A8: the migration and its guarded rollback (`POST_PURCHASE_ROLLBACK_INVOICES_EXIST`, `A8_ROLLBACK_ROWS_IN_USE`), `order_transition` at 75 rows with the fixture, `src/lib/signed-link.ts` with `SIGNED_LINK_SECRET` (env schema, `.env.example`, Railway runbook, contract 34 keys / 30 required), `tracking.linkFor`, `tracking.resolve` and `rotateTrackingToken` in `@/modules/orders`, `place` leaving `public_token` to the column default, `/*/track/` and `/*/account/` in `robots.txt`, `scripts/check-relay-language.ts` (`pnpm check:relay-language`, and check 14 of `i18n:check`), the `account.open` and `invoice.issue` flags (DB rows, registry, admin copy `reviewed: false`), the two seeded invoice profiles, the regenerated `db:check` snapshot, and the by-hand DSAR runbook with its dated log `docs/compliance/dsar-log.md`. Tests: unit `signed-link.test.ts` (T-01, 32 cases), `check-relay-language.test.ts` (T-38, 14), `seo-robots.test.ts` (+5, T-13 track half), `feature-flags.test.ts` (+1); integration `post-purchase.test.ts` (26: T-02, T-16 trigger half, T-36 schema half, RLS, A8 AC-14/44/45/46/47, rollback round trip); 17 existing suites adjusted for 75 rows, two flags, 22-character tokens and the new function. 31 named mutations, every one red (listed in the PR). No local build, Playwright or Lighthouse was run: nothing here renders a page. Handed on: see Carry-forwards.
