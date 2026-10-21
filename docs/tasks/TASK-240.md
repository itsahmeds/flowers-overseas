# TASK-240 — Every offered stem count is odd, in every country

Row: `TASKS.md` → TASK-240. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder ruling D3 A, 2026-10-14 ("R ok, D1–D5, …"; `docs/decisions-log.md`). Keeps the breaker
(money: tier keys and the prices that follow them; seed data; `CLAUDE.md` DoD §4).

**Blocked on spec 005 §13 Q12 (founder, open since 2026-10-14):** which odd set (11 / 15 / 21 or
13 / 19 / 25), and whether prices stay with their tier position. The founder approved odd counts
without choosing a set. Do not dispatch until Q12 is answered; if the answer differs from the
default below, the spec writer amends spec 005 §14 A-founder-2026-10-14c first and this brief
follows it.

- **Spec 005 §14 A-founder-2026-10-14c, clauses 1 to 6. Owned: AC-36 (T-37).** As written today
  (the default of Q12):
  1. Every tier with `stems` carries an odd count, for every product (tiers are per product, not
     per country); the `isDefault` tier is odd too. Tiers without a stem count are unchanged.
  2. No tier offers 13 (the French guide says thirteen is avoided).
  3. The mapping: 12 / 18 / 24 → 11 / 15 / 21 (default 15); 10 / 15 / 21 → 11 / 15 / 21 (15);
     5 / 8 / 12 → 5 / 9 / 15 (9); 5 / 9 / 13 → 5 / 9 / 15 (9); 15 / 25 / 35, 9 / 15 / 21 and
     3 / 5 / 7 unchanged.
  4. `tierKey` is `stems_{n}` for the new count. Prices in `prices.data.ts` follow their tier by
     **position**, so no amount changes and spec 005 A1's bands hold. An old key in `?tier=` falls
     back to the default tier (spec 009 AC-15, TASK-128's); no redirect is added.
  5. `seed/data/product-tiers.json` is regenerated from the dataset in the same PR, never edited
     by hand (spec 006 §14 A-founder-2026-10-14c).
  6. Unchanged: `catalog.tier.stems` (ICU plural), §13 Q6's "middle tier" rule, `is_default` as
     data, spec 005 A1.
- **AC-36's checks:** `pnpm catalogue:check` and `pnpm seed:check` exit non-zero, naming the SKU
  and the tier, on a fixture with a 12-stem tier, one with a 13-stem tier, and one whose `tierKey`
  does not match its count. Prices compared position by position against a pinned base snapshot.
- **Tests that pin today's keys** (`stems_18` and friends) live in
  `tests/unit/catalog-tiers-addons.test.ts`, `catalog-pricing-quote.test.ts`,
  `catalog-product-view*.test.ts`, `catalogue-check.test.ts`, `catalogue-schemas.test.ts`,
  `catalog-offer-*.test.ts`, `fx-bundle-no-network.test.ts`, `product-page.test.tsx` and the
  product e2e. Move each to the new key; never loosen an assertion to a set of keys.
- **Order:** after the product feature (TASK-228 to TASK-230) merges, because its visual baselines
  and e2e read the tier labels. Never beside TASK-128 (the `?tier=` parser).
- **Gates:** `pnpm gates:cheap` with the block pasted; CI green on the head with `ci:full`
  (product visual baselines re-taken in CI); `/review` and `/break`. Watched red (T-37): one
  12 / 18 / 24 row restored; a 13-stem tier; a price moved by one minor unit at one position.

## Read

- `specs/005-catalogue-pricing-module.md`: `## 0. Index`, then §13 Q4, Q6, Q9, Q12, §14 A1,
  A-founder-2026-10-14c
- `specs/006-seed-catalogue-import-imagery-pipeline.md`: §14 A-founder-2026-10-14c
- `docs/codebase-map.md`
- `src/config/catalogue/tiers.data.ts`, `prices.data.ts`, `projections.ts`, `schemas.ts`,
  `scripts/catalogue-check.ts`, `seed/check.ts`, `seed/data/product-tiers.json`

## Carry-forwards

- **From the site test (2026-10-14):** QA summary "Product page": most default sizes are even
  (12, 18, 24); our own Poland, Romania and Italy guides say an even number is for a grave
  (`content/corridors/en/pl-guide.md` L46, L74; `ro-guide.md` L46; `it-guide.md` L46).
- **From `/plan-tasks` (orchestrator, 2026-10-20):** the spec 012b admin artboards (PR 296, escalation 2) draw placeholder sizes as 12 / 18 / 24 stems, which the odd-stem rule would refuse if a placeholder size were saved again in admin. This task's remap makes the seeded counts odd before spec 012b's product editor (TASK-297, which now depends on this task) ships; say in `## Result` which counts replace them so the designer can redraw.

## Escalations

- **2026-10-14, spec 005 §13 Q12 (to the founder, through the orchestrator):** which odd set, and
  do prices move? Default 11 / 15 / 21 with prices kept by position. `open`.

## Progress

_Not started._

## Result

_Pending._
