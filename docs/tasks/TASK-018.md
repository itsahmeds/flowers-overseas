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
- 2026-10-05: round 1 of PR 200 (review FAIL, breaker HOLES on `283daf3a`). Pushed:
  - `c1b98413`: the lock, the currency and coverage keys, the fail-closed gate, the evaluated
    mirror, and the unit pins;
  - `9da97605`: the two-session, delete-rule, currency and zero-line integration cases.

  Local PostgreSQL 16.14, fresh data directory, PID 41893, stopped by PID: the round trip,
  13 live mutations, and 24 gate/unit mutations.
- 2026-10-05: round 2 of PR 200 (reviewer r2 PASS; breaker r2 HOLES on `42be2786`). Pushed:
  - `84f7102b`: holes A, B, C and B6, plus the ENOENT fix;
  - then the propagation and standalone-`OF` cases.

  Local PostgreSQL 16.14, fresh data directory, PID 99523, stopped by PID: round trip, 6 live
  mutations, 13 gate/unit mutations.

## Result

### Round 2 fixes (breaker HOLES on `42be2786`)

| Hole | Fix | Mutation, and the case that went red |
|---|---|---|
| A (depth) | `dynamicSqlCount` and the table model read every string at **every** depth. A quoted body is strictly shorter than its quote, so the recursion ends, and no limit is left for a statement to hide behind. A plpgsql statement (`BEGIN …`, `IF … THEN …`) is read from its first DDL word. Fixtures: an `EXECUTE` four and six `$qN$` levels deep, and literal `ALTER TABLE … ADD COLUMN email` six function bodies deep. | Limit 3 restored (1 red). Limit 1 (1 red). Model limit 3 (1 red). Statements read only from index 0 (1 red). |
| B (typed tables) | Refused outright in migrations: `CREATE TABLE … OF`, `ALTER TABLE … OF` and `ALTER TYPE … CASCADE`. Composite types are modelled: a column of a type carrying an email attribute (nested, as an array, carried by `LIKE`, or gaining the attribute later by `ADD` or `RENAME ATTRIBUTE`) is reported as `column.attribute`. Live: the AC-27 case walks composite column types recursively and asserts neither recipient table is typed (`reloftype = 0`). | Each refusal removed (1 red each; `ALTER TABLE … OF` needed its own fixture, now added). Composite attributes not carried (2). Added attribute not propagated (1). Live: the breaker's typed-table route (3 red), a composite column with an email attribute (1), a typed table with no email (1). |
| C (CLI) | `scripts/db-check.ts` takes `--migrations-dir` and `--schema-dir`; `pnpm db:check` passes neither. A test spawns the CLI against a mirror copy that spreads in an email column (exit 1, the line), and against the committed tree (exit 0). The scratch copy lives in `test-results/` with its parent created, which fixes the ENOENT on a fresh install. Node does not strip types under `node_modules/`, so the copy cannot live there. | CLI back to `runDbCheck` (1 red). |
| B6 (partner country) | `partner_coverage_country_check()` (`SECURITY DEFINER`, locks the partner `FOR SHARE`) refuses a coverage row whose city or zone is outside the partner's country, on insert and on update. `fulfillment_partner_coverage_country_guard()` refuses moving a partner to another country while it covers the old one. No new column. The rollback drops both functions. | Live: either trigger dropped, or the zone branch removed (red each). Unit: `FOR SHARE` removed, guard trigger renamed (1 red each). |

**B4, not fixed, by instruction.** Mirror-side CHECK expression drift stays a carry-forward to
TASK-027's AC-26 drift check, for the reviewer to accept.

**Evidence, local.** PostgreSQL 16.14 (127.1:54320, PID 99523, stopped by PID, no `postmaster.pid`
left).
- Suites: partners-customers 12/12, i18n-geo 10/10, media 8/8.
- Round trip: `--to 0004` left 31 tables with only `set_updated_at`; `--to 0000` left only
  `schema_migrations`; re-migrate restored 45 tables and six functions. All exited 0.

**Gates** on `850ac7d3` (rebased on `origin/main`; the next commit changes only this brief). Load average 53:

```
gates:cheap · 850ac7d3edca768b99be4052d11b307914a47e3e · tree clean · base origin/main · 2026-10-05T07:12:19.864Z
typecheck             exit 0 · 45.4 s
lint                  exit 0 · 33.9 s
format:check          exit 0 · 23.0 s
i18n:check            exit 0 · 0.7 s
check:no-db           exit 0 · 0.3 s
codebase:map --check  exit 0 · 0.5 s
tests                 exit 0 · 31.6 s · changed 7 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

**Tests now:** unit `db-check-recipient-email.test.ts` 82, `schema-partners-customers.test.ts` 68;
integration `schema-partners-customers.test.ts` 12.

### Round 1 fixes (review FAIL and breaker HOLES on `283daf3a`)

| Item | Fix | Mutation, and the case that went red |
|---|---|---|
| R1 (race) | `partner_application_media_check()` locks the listed assets `FOR SHARE`, with `kind = 'partner' AND visibility = 'private'` in the locking query. Three two-session integration cases: a delete during a listing, a make-public during a listing, and a listing during a make-public. Each one waits on the lock, then is refused with `PARTNER_APPLICATION_MEDIA_ASSET (23503)`. Plus a unit pin on the SQL. | Live, lock removed: all three red. Live, `FOR KEY SHARE`: the two make-public cases red (the delete still conflicts, as the reviewer predicted). SQL text `FOR KEY SHARE`: 2 unit red. |
| B1 (dynamic SQL, views) | `db:check` refuses any dynamic-SQL `EXECUTE` (one not followed by `FUNCTION`, `PROCEDURE` or `ON`), at any quoting depth, outside `DYNAMIC_SQL_ALLOWED`: only `0001` and its rollback, each with a reason. It refuses a view, materialized or not, named like a recipient table. A view renamed into a recipient name (`ALTER VIEW`, `ALTER TABLE` or `ALTER MATERIALIZED VIEW`) brings every name in its text. A foreign table counts as a table. Integration: after a full migrate, `recipient` and `recipient_address` exist only as `public` plain tables (`relkind = 'r'`), with no email-like column in `pg_attribute`. | Gate: ban off (4 red); allow-list admits every file (4); `ON` not excluded (61: the committed tree fails); view not flagged (2); `ALTER VIEW` not followed (1). Live: `recipient` swapped for a view (3 red). |
| B2 (mirror forms) | `recipientEmailInTables` reads the evaluated mirror through `getTableConfig`. `pnpm db:check` runs it (`runDbCheckWithMirror`). Unit cases: a spread, a constant, a template literal, a computed name with a key-named column, `pgSchema(...).table`, and end to end a copied mirror with a spread email column. | Reads nothing (6 red). `runDbCheckWithMirror` ignores the mirror (1). |
| B3 (delete rules) | `tests/fixtures/schema-foreign-keys.ts` pins all 29 FKs with their delete rule. Only `partner_translation` cascades: §5.1 allows `CASCADE` only to a parent's own translation rows. Asserted against the SQL, the mirror (`onDelete`) and the live `confdeltype`. Behaviour: a buyer with a recipient, an address or a linked recipient cannot be deleted, a recipient with an address cannot be deleted, and the rows survive. | Live `CASCADE` on `recipient.customer_id`, `address.customer_id`, `recipient_address.recipient_id`, `partner_coverage.partner_id` or `payout.partner_id`, and `SET NULL` on `linked_customer_id`: each red. SQL `CASCADE` (1 red). Mirror `onDelete: "cascade"` (1). |
| B4 (parity) | The unit test now holds the mirror equal to the SQL on column types, FKs, CHECK names, unique keys, primary keys and index names. Expressions, `NULLS NOT DISTINCT`, predicates and the triggers are AC-26 live drift, carried to TASK-027. | Mirror: `lines` not `.array()`; zone FK renamed; `recipient_phone_check` renamed; an index removed (1 red each). |
| B5 (zero line) | Behaviour: a zero `goodwill` and a zero `order` line are refused. Unit pin on the check text. | Live `>= 0` (red). SQL text `>= 0` (1 red). |
| B6 (currency, coverage) | Currency: `fulfillment_partner_id_payout_currency_key` plus `partner_catalog_mapping_partner_currency_fkey`, so a mapping is in its partner's currency, and the partner's currency cannot change under its mappings. `payout_currency_check()` (`SECURITY DEFINER`, locks the partner `FOR SHARE`) refuses a payout written in another currency. Coverage: `postcode_zone_id_city_key` (on `0002`'s table, dropped by the rollback) plus `partner_coverage_zone_city_fkey`, so a zone named with a city must be in that city. Coverage against the partner's own country stays declared and not enforced: it needs a column §5.1 lacks. | Live: mapping FK dropped, payout trigger dropped, coverage FK dropped (each red). SQL mapping FK removed (1 red). |
| Nit 1 | The PR description: test counts (71, 66 and 12) and the rollback wording (`--to 0000` leaves `schema_migrations`). | — |
| Nit 2 | RoPA row 3 now says that `consent_log.source_ip_truncated` exists, why (spec 002 §5.1, §8), and that the writer moving the consent sink onto the table must leave it null, or rewrite the row first. No task in `TASKS.md` writes `consent_log` yet, so the rule lives in the RoPA row. | — |
| Nit 3 | A unit tripwire: each deferred column exists, TASK-019's or TASK-022's brief names its constraint, and once the parent table exists, a migration must add the constraint. The briefs also ask for the live assertion. | Constraint name removed from the TASK-022 brief (1 red). |

**Integration evidence, local.** PostgreSQL 16.14 (fresh ICU data directory, 127.1:54319, PID 41893,
stopped by PID with `kill -INT`, no `postmaster.pid` left). `db:migrate` 0001-0006, then:
- the suites: partners-customers 12/12, i18n-geo 10/10 (updated for `postcode_zone_id_city_key`),
  media 8/8, catalog-pricing 8/9 (the known first-query case);
- rollbacks, probed after each step:
  - `--to 0005` left 40 tables, with the zone keys `country_prefix` and `id_city`;
  - `--to 0004` left 31 tables, only `set_updated_at`, no guard trigger, only the `country_prefix`
    key;
  - `--to 0000` left only `schema_migrations`;
- re-migrate: 45 tables and all four functions back. Every step exited 0.

**Gates** on `fdfc632c` (rebased on `origin/main` `22a2d110`; the next commit changes only this brief). Load average 11:

```
gates:cheap · fdfc632c8109fbebbb6f62562ae67d55faa1eeff · tree clean · base origin/main · 2026-10-05T06:04:00.534Z
typecheck             exit 0 · 5.5 s
lint                  exit 0 · 17.3 s
format:check          exit 0 · 11.6 s
i18n:check            exit 0 · 0.5 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 28.0 s · changed 7 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

**Tests now:** unit `db-check-recipient-email.test.ts` 71, `schema-partners-customers.test.ts` 66,
`db-check.test.ts` 29; integration `schema-partners-customers.test.ts` 12.

### Round 0

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
  `--to 0000` left no table except the runner's own `schema_migrations`, and no function.
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

**Gates** on `1be34e8e` (the commit after it changes only this brief and the row). Load average
28, rising to 65 during the run:

```
gates:cheap · 1be34e8e195f3827007df4695549be13df65e1e8 · tree clean · base origin/main · 2026-10-05T03:53:54.136Z
typecheck             exit 0 · 11.3 s
lint                  exit 0 · 35.8 s
format:check          exit 0 · 14.4 s
i18n:check            exit 0 · 0.7 s
check:no-db           exit 0 · 0.3 s
codebase:map --check  exit 0 · 0.4 s
tests                 exit 1 · 68.2 s · changed 7 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: FAIL (1 of 7 red: tests)
```

The one red case is `tests/unit/url-pii.test.ts` "the real tree", which hit its 5 s timeout. Run
alone at load 65, it took 7.8 s; the other 356 tests, including all of this task's, pass. The test
builds a TypeScript program over `src/` only, and this PR changes nothing under `src/`. TASK-017
recorded the same timeout at loads of 7.4 and 11.9. CI is the gate of record (DoD §3).

**Work order note.** The work order named a carry-forward for spec 010 §5.1 A and an event-name pin.
This brief has neither; both sit in TASK-019's brief. Of §5.1 A, only the partner status values
touch this task, and they are in place.
