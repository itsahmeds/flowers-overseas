# TASK-211 — Spec 011 schema delta: migration `NNNN_florists_v0` + rollback, the `partner_application` columns, constraints and public insert-only policy, `partner_member.locale_code`, the missing partner read policies, the four retention rows and their sweep handlers

Row: `TASKS.md` → TASK-211. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-211`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 2. Owns **AC-14, AC-17**; tests **T-14, T-17**.
- **Migration `NNNN_florists_v0` with `.down.sql` (§5.1):** the `partner_application` columns and constraints (including `CHECK (cardinality(media_asset_ids) = 0)`), the public insert-only policy and the `app_web` grant if TASK-023 did not give it, `partner_member.locale_code`, and the partner read policies TASK-023 lacks (diff against migration `0011`, add only what is missing). Numbered after the chain's last; the round-trip test covers the pair.
- **Retention rows and sweep handlers (§5.1; the only copies, ruling R2):** `partner_application` deleted 365 days after `updated_at` unless converted; `auth_session` and `auth_verification_token` after `expires` (both sign-in surfaces); `demo_order` (orders with `order.mode IN ('demo','test')` older than 30 days, with their assets) in non-production databases only. Spec 012 keeps none of these.
- **Stop and escalate, do not work around:** no change to `order`, `order_event`, `order_assignment`, `delivery_proof` or `order_transition`. If an arrow the demo needs is missing from the seed, or if TASK-020's append-only guard on `order_event` refuses the `demo_order` deletion, escalate rather than add an arrow or disable a trigger.
- **Class:** not review-only (`CLAUDE.md` DoD §4): a migration, RLS and retention. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §5.1; §8 (data flows); §9 AC-14, AC-17; §12 task 2 and "Migration order".
- `docs/tasks/TASK-020.md`, `TASK-023.md`, `TASK-025.md`; `db/migrations/` (migration `0011`); `src/lib/db.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the TASK-019…023 feature PR (PR 210).** `0008` makes `order_event` refuse `UPDATE`, `DELETE` and `TRUNCATE`. Every child of `"order"` references it `ON DELETE RESTRICT`. A demo order with events therefore cannot be deleted. This is the escalation this brief already anticipates.
- **From breaker round 1 on PR 210.** A partner moved between `demo` and `active` keeps its existing assignments: `ASSIGNMENT_MODE_MISMATCH` fires on assignment writes only, not on a change of `fulfillment_partner.status`. Decide whether the status flip refuses or cancels open offers.
- **From review round 1 on PR 210.** The inbox reads orders through `partner_order` and `partner_order_line`. These views have no buyer, no token and no retail price. Each partner sees only orders whose offer is open or accepted: after a decline or timeout the order, its photo and its substitution notes disappear for that florist, while its own `order_assignment` row stays readable. An "expired offer" page can show the assignment, not the order.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-22, the `demo_order` retention row (§5.1's fourth row), to the orchestrator / founder: `open`.** `0008` makes `order_event` refuse `DELETE` and `TRUNCATE`, and every child of `"order"` references it `ON DELETE RESTRICT`, so no sweep handler can delete a demo or test order that has events without disabling a trigger, which this brief forbids. `0020_florists_v0` therefore ships the other three rows and **no** `demo_order` row (a row with no working handler would put a promise into the generated retention table that nothing keeps). Options for the ruling: (a) a migration that lets `order_event_append_only()` allow a `DELETE` of rows whose order has `mode IN ('demo','test')` when `app.role = 'system'`, plus `ON DELETE CASCADE` from `"order"` for demo rows only (a change to `order_event`, which this spec says it does not make); (b) pseudonymise demo orders' personal data instead of deleting them (spec 010's `demo_order_personal` already clears it at 24 h / 7 d), and drop the 30-day row from spec 011; (c) leave demo orders on staging and reset staging from a dump when it grows. The demo photos are the one real-world risk (a florist may photograph a real door): until the ruling, `delivery_photo`'s 2-year rule is what deletes them.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-22: migration `0020_florists_v0` + `.down.sql` (numbered after PR 320's `0019`), Drizzle mirror, `db/rls.ts` classes `PUBLIC_INSERT_ONLY_TABLES` and `PARTNER_FILTERED_TABLES`, three retention handlers, T-14 (`tests/integration/florists-schema.test.ts`, incl. rollback on a seeded database) and T-17 (`retention-sweep.test.ts`); existing suites updated for the new `NOT NULL` columns. `scripts/db-check.snapshot.json` is regenerated only after PR 320 lands (its `0019` is in the same snapshot). Next: TASK-212.
- 2026-10-24 finisher (renumber): PR head `42fde07d` rebased onto PR 384's head `a4688a7b` (main + 383's `0019`/`0020` + 384's `0021`), migration renumbered to `0022_florists_v0`, `scripts/db-check.snapshot.json` regenerated from a migrated PG16 (its 11 objects only), `schema-partners-customers.test.ts` merged with 384's generic later-migration reader. A stale paused rebase in `fo-wt-211` was aborted; the old local branch tip is kept as `backup/211-local-1022`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

**Renumber and rebase (finisher, 2026-10-24).** PR 326 now carries migration
**`0022_florists_v0`** (orchestrator's order: PR 383 `0019`/`0020`, PR 384 `0021`, this `0022`,
PR 320 `0023`). The branch is **stacked on PR 384's head `1df51dec`** (which carries PR 383's
commits replayed onto `main` `692a24b5`): a version gap fails `db:check` and the runner, so it merges only after 384, then
`git rebase --onto origin/main 1df51dec` and re-fire `ci:full`. `scripts/db-check.snapshot.json`
regenerated from a migrated throwaway PG16 (only this migration's 11 objects were missing). Tests
adjusted for sitting on 0019 to 0021: `schema-partners-customers.test.ts` (unit) merged with PR
384's generic later-migration reader, plus `SET NOT NULL` columns and `\s+CHECK` names;
`auth-adapter.test.ts` seeds locale `en` before a `partner_member` (0022's locale key, a failure
the old gap had hidden); `schema-notifications-ops.test.ts` lists twelve retention rows (383's
`checkout_draft_personal`, this PR's three); `post-purchase.test.ts`'s guard case rolls back to
`0021` before it compares catalogues (0022 now rolls back first). `db-migrate.test.ts` pins
`0022_florists_v0.sql`.

**Self-review of the renumber.** Full integration project on a throwaway PG16: 43 files, 491 of
492 green, the one red the guard case fixed above and then green alone (26 of 26). A first run
went red on the round trip because a migrated database of mine (`fin_snap`, for the snapshot)
sat in the same cluster; dropped, and the rerun's round trip is green. Live `db:check` against
the migrated database: 22 migrations, RLS 79 of 79, no drift after the snapshot.
After TASK-115 merged, the stack was replayed onto `main` `692a24b5` (only `docs/codebase-map.md`
conflicted, regenerated); this branch moved from `a4688a7b` to `1df51dec` with its own commits unchanged.
