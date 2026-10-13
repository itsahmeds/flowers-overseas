# TASK-023 — RLS and roles (migration `0011`): enable RLS on every table, deny-by-default, the public reference set, partner-scoped and customer-scoped policies keyed on `current_setting('app.*', true)`, `app_web` grants

Row: `TASKS.md` → TASK-023. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-023-rls-policies`. §13 Q4 resolved: session-variable RLS, admin is `app.role = 'admin'` and not a second connection string, so there is no service-role key to leak. Positive *and* negative case per partner-scoped table is mandatory (`plan/12` §4): as partner B, reads of A's rows return 0 and `UPDATE`/`DELETE` affect 0 rows. §8: this is the technical measure behind `plan/07` §1.1's processor boundary — `app_web` has no `BYPASSRLS`, so a forgotten `WHERE partner_id =` leaks nothing. RLS *coverage* gating in `db:check` is AC-26 on TASK-027; the exemption list for pure reference data is written here. Tests: T-16, T-17, T-18.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/12`
- `plan/07`

## Carry-forwards

_None recorded._
- **From `/review 71` (2026-09-16, TASK-014):** both Neon URLs connect as `neondb_owner`, which has `rolbypassrls = true`; `SET LOCAL ROLE app_web` is the isolation and a `RESET ROLE` in the same transaction restores bypass. AC-18 must assert on the **connecting** role (a dedicated `app_web` login without `BYPASSRLS`, or a proof that no code path can `RESET ROLE`), not only on `current_user` inside the helper.
- **From TASK-018 (PR 200).** For AC-16 and the customer scope: `payout_line` has no `partner_id`, so
  its policy reaches the partner through `payout` (`payout_line_payout_id_idx` serves the join);
  `partner_member`'s primary key leads with `user_id`; customer-scoped tables key on
  `customer.user_id` (`customer_user_id_idx`). Two trigger functions in `0005`,
  `partner_application_media_check()` and `media_asset_partner_application_guard()`, are `SECURITY
  DEFINER` as `app_owner` so they see every row whatever the caller's policy shows. That holds
  because the table owner bypasses RLS; if `0011` uses `FORCE ROW LEVEL SECURITY`, give them an
  explicit policy or revisit. `consent_log` is written once: no `UPDATE` policy is needed for it.
- **From TASK-018, round 1 of PR 200.** A third `SECURITY DEFINER` function, `payout_currency_check()`,
  reads `fulfillment_partner` `FOR SHARE`. It is owned by `app_owner`, as the two media functions
  are, so the same note about `FORCE ROW LEVEL SECURITY` applies. `partner_application_media_check()`
  now locks the listed `media_asset` rows `FOR SHARE`. Under RLS, its locking query must still see
  every row: as the owner it does, and with `FORCE ROW LEVEL SECURITY` it would need a policy.
- **From TASK-018, round 2 of PR 200.** Two more `SECURITY DEFINER` functions are owned by
  `app_owner`, with the same note about `FORCE ROW LEVEL SECURITY`:
  - `partner_coverage_country_check()`, which reads `fulfillment_partner` `FOR SHARE`, plus `city`
    and `postcode_zone`;
  - `fulfillment_partner_coverage_country_guard()`, which reads `partner_coverage`.

## Escalations

_None recorded._

## Progress

- 2026-10-13: `0011` + rollback, `db/rls.ts` (the map), unit and integration suites, eight mutations. Pushed.

- 2026-10-13: review round 1 items 1-4 and breaker holes H1-H3 on e270ed27 fixed, each shown red by a mutation:
  - no partner policy on `"order"` or `order_line`; partners read the `partner_order` and `partner_order_line` views, for open or accepted offers only;
  - the catalogue mapping is read-only to partners;
  - every correlation goes through a `SECURITY DEFINER` lookup, and T-16 now counts rows by owner keys;
  - unset, empty and unknown roles read as public;
  - customers edit only contact fields;
  - `customer_order_event` gives buyers their order timeline;
  - `audit_log` is append-only.

- 2026-10-13 (paused by the founder): done, each with a red mutation: review items 1–4, nits 2–4, nit 1 (documented), breaker H1–H3. Left: the `tests` step of `pnpm gates:cheap` exits 1 (not yet investigated), the `ci:full` label is not toggled, CI has not run on this head, and round 2 is not requested.

- 2026-10-13 (finisher): the red `tests` step was two failures. (1) `order-integrity.test.ts` AC-36 scan flagged `rls-policies.test.ts:287`, this bundle's plain-string assertion on the rollback's `DROP TRIGGER` line; rewritten as the anchored `/^…$/m` literal the scan allows (`900d4029`), red when line 13 of `0011_rls_policies.down.sql` is commented out. (2) `url-pii.test.ts` T-59 timed out at 5 s with the load average at 64–85 from other agents; the diff touches nothing under `src/`, and it passed in the full gates run at load 7.6.

## Result

PR 210 (feature PR, TASK-019…023).

**What `0011` does.**
- RLS is enabled on all 68 tables, each with a `<table>_staff` policy (`admin`, `system`). There is no `FORCE`, so the `SECURITY DEFINER` functions of `0005` and `0008` still see every row as the owner.
- Six helpers read `app.*` with `current_setting(…, true)`. `app.partner_ids` accepts the comma-separated form and `{…}`.
- `db/rls.ts` classifies every table. `RLS_EXEMPT_TABLES` holds `schema_migrations` only.

**AC-16 / T-16.** For each of the 13 partner-scoped tables, with two partners:
- each partner sees exactly its own rows and none of the other's;
- B's `UPDATE` and `DELETE` of A's rows affect 0 rows, and A's rows survive;
- A can change its own coverage, blackouts and catalogue mapping, but nothing in its order or money records (spec 011 §2);
- a partner cannot insert a row for another partner (42501);
- a customer reads no partner rows.

**Customer scope.** A buyer reads only their own row in each of the 11 customer-scoped tables. They can edit their own address book, but not another's, and not their orders.

**AC-17 / T-17.** As `public`:
- all 29 reference tables read exactly what the owner sees;
- `media_asset` returns only public rows and `review` only published rows;
- 24 private tables, each holding rows, return 0.

**AC-18 / T-18.**
- `app_web` has `rolbypassrls` and `rolsuper` both false.
- As `app_web`, these are all refused with 42501: `CREATE TABLE`, `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, `TRUNCATE`.
- Review 71's connecting-role point: under a login that holds only `app_web`, `SET ROLE app_owner` is refused, and `RESET ROLE` lands on a role without `BYPASSRLS`.
- Over Neon's owner login, the guarantee rests on the static `SET ROLE` / `RESET ROLE` scan in `tests/unit/db.test.ts`.
- The `pgboss` clause waits for `0012` (carried forward to TASK-024).

**Mutations.**
- These went red:
  - dropping `order_partner`;
  - dropping `country_read`;
  - `media_asset_read USING (true)`;
  - ignoring `app.partner_ids`;
  - making blackouts read-only;
  - ignoring `app.user_id` for customers.
- Two mutants change nothing, both recorded for TASK-027:
  - the `payout_line` predicate, already filtered through `payout`'s policy;
  - the `REVOKE CREATE`, which PG15 and later already apply by default.

**Choice for the reviewer.** T-16 says "A's rows (allowed)" for update and delete. Here A may write only its own configuration tables, because spec 011 §2 makes order and money records read-only to partners.

Local evidence: PostgreSQL 16.14 (embedded-postgres binaries with ICU, 127.0.0.1:54329), stopped by its PID afterwards. Neon was not touched. Every suite runs on its own scratch database (`tests/integration/support/scratch-db.ts`), and the whole integration project passed in parallel: 13 files passed, 4 skipped; 107 tests passed, 32 skipped.

### Round 1 fixes (review FAIL and breaker HOLES on `e270ed27`)

| Item | Fix | Mutations (all red in `tests/integration/rls-policies.test.ts` unless named) |
|---|---|---|
| Review 1 / H1: buyer PII to florists | Partner policies on `"order"` and `order_line` are removed. Partners read the views `partner_order` (fulfilment columns and `recipient_snapshot`) and `partner_order_line` (no retail price). Both are `security_barrier`, owned by `app_owner`, `SELECT`-only for `app_web`, and filtered by `app_partner_sees_order`: the offer must be open or accepted. `delivery_proof` and `substitution_note` follow the same rule. | 4 mutations: the views unfiltered; `buyer_snapshot` added to the view; the views writable; a partner `OR` on `order_customer`. 1 mutation: the decline/timeout cut dropped. |
| Review 2 / H2: payout write | `partner_catalog_mapping_partner` is `SELECT` only. Partners write only `partner_coverage` and `partner_blackout`. `can_fulfil` stays read-only too, because spec 011 gives no toggle. | Mapping made writable again. |
| Review 3: vacuous T-16 | Each correlation is a `SECURITY DEFINER` lookup with a pinned `search_path` (`app_partner_sees_order`, `app_partner_owns_payout`, `app_customer_owns`, `…_recipient`, `…_order`, `…_payment`). T-16 captures each row's key as owner and counts hits by key. | Correlation dropped from each of the 6 lookups. |
| Review 4 / H3: defaults and gates | Unset, `''` and unknown `app.role` read as `public`. `app_is_self` needs the `customer` or `partner` role. T-17's private list adds `webhook_inbox`, `consent_log`, `accounts`, `verification_tokens`, `partner_application` and `order_event`. | Default changed to `system` and to `admin`; customer role gate dropped; self role gate dropped. |
| H3: `WITH CHECK` | Ownership cannot be re-pointed: covered by an `INSERT`, a bare `UPDATE` (no SELECT policy re-checks it) and a re-pointing `UPDATE`, each refused with 42501. | `WITH CHECK (true)` on `customer_customer_update`, `address`, `recipient`, `recipient_address`, `partner_coverage` and `partner_blackout`. |
| H3: delivery proof `UPDATE` | Re-pointing a proof at a public asset is refused (`order-integrity.test.ts` T-19). | Trigger narrowed to `BEFORE INSERT` (red in T-19). |
| Nit 2 and the breaker's observation | `customer_self_update_guard`: as `customer`, a change to `email_normalised`, `marketing_consent`, `redacted`, `redacted_at`, `id` or `created_at` raises `CUSTOMER_COLUMN_READ_ONLY`. `user_id` is pinned by `WITH CHECK`. | `marketing_consent` removed from the guard. |
| Nit 3 | No customer policy on `order_event`. Buyers read `customer_order_event` (`order_id`, `seq`, `type`, `from_status`, `to_status`, `occurred_at`). | View unfiltered. |
| Nit 4 | `audit_log` is append-only (`0009`, `AUDIT_LOG_APPEND_ONLY`, row and `TRUNCATE` triggers). | Row trigger dropped (red in `schema-notifications-ops.test.ts`). |
| Nit 1 | Documented in `0011`'s header for spec 040. `SET ROLE app_owner` is refused to a login that holds only `app_web` (T-18). The migration login is a member of both, so the runtime `DATABASE_URL` must not connect as it once a dedicated runtime login exists. | — |

Carried forward:
- TASK-202: the event/status tie and the session-wide switch, from the breaker; the partner views.
- TASK-211: the partner status flip, and what the inbox reads.
- TASK-025: `audit_log` is append-only.

Local evidence: PostgreSQL 16.14 (embedded-postgres, 127.0.0.1:54329), stopped by its PID afterwards. The integration project: 13 files passed, 4 skipped; 110 tests passed, 32 skipped.

### Cheap gates on `900d4029` (load average 7.58 at start, 8.10 at end)

```
gates:cheap · 900d4029b5b108f409149ee75a60e814165d2f4d · tree clean · base origin/main · 2026-10-13T16:56:44.718Z
typecheck             exit 0 · 2.8 s
lint                  exit 0 · 17.2 s
format:check          exit 0 · 11.1 s
i18n:check            exit 0 · 0.6 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 21.8 s · changed 8 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```

Tests: 411 of 411 unit passed. No Postgres was started in this run: the fix is in a unit file, and CI's `test-integration` ran the integration project. No expensive gate was run locally. CI's `audit` is red until PR 211 merges; it is not fixed here.
