# TASK-018 — Schema `partners` + `customers` (migrations `0005`, `0006`): `fulfillment_partner`, `partner_translation`, `partner_member`, `partner_coverage`, `partner_blackout`, `partner_catalog_mapping`, `partner_application`, `payout`, `payout_line`; `customer`, `address`, `recipient`, `recipient_address`, `consent_log`; the recipient-email `db:check` gate

Row: `TASKS.md` → TASK-018. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-018-schema-partners-customers`. §8 minimisation is structural: `recipient` has no email column and `db:check` fails on any `/e[-_]?mail/i` column added to `recipient`/`recipient_address`, citing `plan/07` §1.3 (AC-27); `consent_log.source_ip_truncated` only, never a full IP; case-insensitive buyer email is a `lower(email_normalised)` unique index, no `citext`. `partner_member` is the org-scoping mechanism the AC-16 policies key on. `partner_application.media_asset_ids` references TASK-017's assets. Tests: T-27.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/07`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Progress

- 2026-10-05: migrations `0005_partners` and `0006_customers` with rollbacks, mirrors
  `db/schema/partners.ts` and `customers.ts`, snapshots `meta/0004` and `meta/0005` (drafts folded
  in and deleted). Pushed `bc4369ed`, draft PR 200. The laptop shut down mid-run; the worktree
  survived intact and work resumed from it.
- 2026-10-05: AC-27 gate in `scripts/db-check.ts` and T-27 unit tests; 10 gate mutations red.
  Pushed `d05af24e`.
- 2026-10-05: unit and integration tests; local PostgreSQL 16.14 (fresh data directory, PID 53795,
  stopped by PID): round trip and 14 live mutations; 13 SQL-text mutations. Pushed `90323003`.
- 2026-10-05: carry-forwards written into the briefs of TASK-019, 022, 023, 026 and 027.

## Result

**PR 200.** Spec 002 §5.1 `partners` and `customers` and AC-27, with T-27.

**What shipped**
- `db/migrations/0005_partners.sql` and its rollback. Nine tables. `fulfillment_partner.status`
  is §5.1's list, `demo` included (spec 010 §5.1 A), with no default. `partner_member` is keyed
  `(user_id, partner_id)`. A payout line references its payout by `(payout_id, currency_code)`,
  and `payout_line_order_once_idx` pays an order once. Two `SECURITY DEFINER` triggers make
  `partner_application.media_asset_ids` a reference to private `kind = 'partner'` assets in both
  directions.
- `db/migrations/0006_customers.sql` and its rollback. Five tables. `recipient` has no email
  column, and its phone is required until `contact_redacted`. `customer_email_normalised_idx` is
  unique on `lower(email_normalised)` where `redacted = false`, with no `citext`.
  `consent_log.source_ip_truncated` is a `cidr` of /24 or /48 at most. `postcode_zone` gains
  `UNIQUE (id, country_id)`, so a recipient address cannot use another country's zone; the
  rollback drops it.
- **AC-27** in `scripts/db-check.ts`. `checkRecipientEmail` replays every forward migration in
  order through a small table model, then reads each rollback and the Drizzle mirror. Each
  problem line names the file, table and column and cites `plan/07` §1.3.
  `recipientEmailViolations` is the same rule over a live catalogue, for TASK-027.

**Deviations (declared in each migration header)**
- Not-null choices where §5.1 is silent.
- No foreign key yet on `partner_member.user_id`, `customer.user_id` or `payout_line.order_id`;
  carried forward to TASK-022 and TASK-019.
- Primary keys on the unique tuples.
- `NULLS NOT DISTINCT` on the coverage and mapping keys.
- The `postcode_zone` supporting key.
- Not enforced: a partner's coverage against its country, and payout or mapping currency against
  `payout_currency_code`.
- Spec 011's later `partner_application` columns and checks are not added here.

**Tests**

| Layer | File | Cases |
|---|---|---|
| unit | `tests/unit/db-check-recipient-email.test.ts` | 49: T-27 end to end (fixture fails with the citation; `recipient_contact_note` passes), 14 names × 2 tables, 22 arrival routes, rollback, mirror, 7 near misses, the live-catalogue rule, the lexer |
| unit | `tests/unit/schema-partners-customers.test.ts` | 42: tables, columns and nullability against the mirror, CHECK lists, money pairs, minimisation, media guards, `updated_at`, rollbacks |
| unit | `tests/unit/db-migrate.test.ts` | updated: pins six migrations |
| integration | `tests/integration/schema-partners-customers.test.ts` | 7: catalogue (owners, AC-27 live, cidr only, email index, guards' definer and path, no extension), then one rolled-back transaction with 64 refusals, each named by its constraint, 21 acceptances, and `updated_at` advancing |
| integration | `tests/integration/schema-i18n-geo.test.ts` | updated: expects `0006`'s `postcode_zone` key |

**Integration evidence, local.** PostgreSQL 16.14 (`embedded-postgres` binaries, a fresh ICU data
directory in the scratchpad, 127.0.0.1 reached as `127.1`, PID 53795, stopped by PID with
`kill -INT`, no `postmaster.pid` left). Neon was not touched.
- `db:migrate` 0001-0006.
- Rollbacks, checked after each step: `--to 0005` left 39 tables and no `postcode_zone` key;
  `--to 0004` left 30 tables, no functions of `0005` and no guard trigger on `media_asset`;
  `--to 0000` left 0 tables and no function.
- `db:migrate` again restored the same state. All steps exited 0.
- Suites: partners-customers 7/7, media 8/8, i18n-geo 10/10. Catalog-pricing was 8/9: the failing
  case is the pre-existing `= ANY(db.array)` first-query issue that TASK-017 recorded, not this
  change.

**Mutations, each red, each reverted**
- **Gate, 10** (unit T-27):
  - G1: `ok` ignores AC-27;
  - G2: pattern `/email/i`, 8 red;
  - G3: a table renamed into `recipient` keeps no columns;
  - G4: no nested SQL, 3 red;
  - G5: no inheritance propagation;
  - G6: no mirror scan;
  - G7: no rollback scan;
  - G8: no citation, 38 red;
  - G9: `LIKE` ignored;
  - G10: `CREATE TABLE AS` ignored.
- **Live, 14** (integration):
  - L1: `recipient_phone_check` dropped;
  - L2: email index without `lower()`;
  - L3: IP check dropped;
  - L4: media delete guard dropped;
  - L5: media check ignores visibility;
  - L6: payout line FK on `payout_id` only;
  - L7: order-once index dropped;
  - L8: zone FK dropped;
  - L9: status default `demo`;
  - L10: mapping index without `NULLS NOT DISTINCT`;
  - L11: `recipient.email` added (the AC-27 catalogue case and the refusal list);
  - L12: guard `SECURITY INVOKER`;
  - L13: consent subject rule dropped;
  - L14: redaction date check dropped.
  - After restoring, 7/7 again.
- **SQL text, 13** (unit):
  - U1: mapping `NULLS NOT DISTINCT` dropped;
  - U2: `demo` dropped from the status list;
  - U3: status given a default;
  - U4: one `updated_at` trigger missing;
  - U5: rollback forgets a table;
  - U6: `total_minor numeric`;
  - U7: IP column `inet`;
  - U8: email index without `lower`;
  - U9: rollback `CASCADE`;
  - U10: SQL nullability off the mirror;
  - U11: check not `SECURITY DEFINER`;
  - U12: rollback keeps the `postcode_zone` key;
  - U13: order-once index dropped.

**Carry-forwards written:**
- TASK-019: the `payout_line → "order"` FK.
- TASK-022: the two `→ users` FKs.
- TASK-023: the partner and customer scope notes, and the definer functions under RLS.
- TASK-026: no status default, the natural keys.
- TASK-027: the connected AC-27 rule, and drift on `NULLS NOT DISTINCT`, the triggers and the snapshots.

**Work order note.** The work order named a carry-forward for spec 010 §5.1 A and an event-name pin.
This brief has neither; both sit in TASK-019's brief. Of §5.1 A, only the partner status values
touch this task, and they are in place.
