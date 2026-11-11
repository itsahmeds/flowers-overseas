# TASK-297 — Spec 012b product editor and florist bouquets

Row: `TASKS.md` → TASK-297. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 5. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-15, AC-16, AC-17; tests T-15 to T-17 and T-39's AC-16 rows.
- After TASK-293, TASK-294, TASK-296, TASK-219 (done), TASK-220 (the high-risk flag path) and TASK-221 (`saveMapping`).
- Add this task's commands to T-09's table (TASK-296).
- No florist name, code or photo credit in any public HTML document (AC-17).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): money, the payout mapping and buyer copy rules.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/catalog`, `scripts/catalogue-check`, `src/modules/partners`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b artboards (PR 296, escalation 2) draw placeholder sizes as 12 / 18 / 24 stems, which the odd-stem hard rule refuses. TASK-240 makes every seeded count odd and never 13; build to the rule, not the drawn numbers, and do not dispatch before TASK-240 merges or the seed fixtures will fail the rule.
- **2026-11-11 (implementer, self-review):** (1) T-17's e2e half (the built public HTML holds no fixture florist name, code or credit) is owed to the e2e pass; public reads never select a partner table (`app_web` cannot), so nothing here writes one into a page. (2) T-39 (visual, `admin-product-edit-*` at 1440 and 390) is owed: the pages follow the artboards' structure (tabs, form on two thirds, status card on the last third) but were not compared pixel for pixel. (3) Not built in the editor: the Approve button on the text tab (the ledger's `attest()`, shown here as the review state only), the photos tab (TASK-299), the occasions picker on the details tab, the list's priced-country, review-state and florist filters and its "imported, not re-read" and "waiting to publish" chips, and a distinct "florist without terms" state (the supplier refusal covers demo, paused and offboarded florists only). (4) Main's reds left as found: `catalog-barrel` (the discounts client entry reaches the barrel), `admin-permission-binding` (four, the partners actions list; TASK-301 owns the permission rows in spec 012's suites), `check:no-db` (analytics).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer (TASK-297 and TASK-298 as one feature PR, #543): main's red `migrations-round-trip` fixed (0045's two functions); after the rebase on #541 and #542, `admin-scans` also knows TASK-370's `at` and `note` params; shared rules in `src/modules/catalog/validate/` read by `catalogue:check`, `seed:check` and the admin save; the commands in `src/modules/admin/catalogue.ts`; the one-way placeholder window; `/admin/catalogue/products`, `/new`, `/[sku]`; integration suite `catalog-cms` green on a local PG16; clean-env staging build green.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#543](https://github.com/itsahmeds/flowers-overseas/pull/543), with TASK-298. First commit: main's red `tests/integration/migrations-round-trip.test.ts` expected no `occasion_reminder_limit` and `saved_recipient_limit` (0045, TASK-352); the list now names both, no migration changed. AC-15: the hard and soft rules of §2.5 with stable ids in `src/modules/catalog/validate/` (17 hard, 3 soft); `catalogue:check` prints the id with its tier, stem and price problems (and gains the price-currency check), `seed:check` runs the slug and copy rules on every product translation (254 rows clean), the admin save refuses with the same ids and asks for a reason on a soft rule, which lands on the audit row. AC-16: `setProductStatus` checks the four `draft → active` preconditions; retire, `removeFromCountry` and a slug edit are refused for an exposed product (`isExposedIn`: priced in a country with `first_live_at`, and the window closed or the product real); `catalogue.placeholder_window` gained `oneWay: "off"` (turning it on is refused, the flags page shows no control once it is off). AC-17: a supplier save writes the product or its sizes and the florist's `partner_catalog_mapping` rows through `saveMapping` inside the same transaction; a refused mapping rolls the product back; copy naming a non-demo florist's legal name or city, or a banned word, is refused. Pages: `/admin/catalogue/products` (list, filters, empty states), `/new`, `/[sku]` (details, sizes, text, prices, margin, status card); permissions `catalogue.edit`, `catalogue.supplier`, `price.edit` and the Catalogue nav entry. Tests: unit `catalog-validate` (T-15, shared ids against both gates), `catalog-placeholder-window`, `feature-flags`, `admin-scans`, `admin-permissions`, `catalog-barrel` (surface and files); integration `catalog-cms` (16 on a local PG16: T-15 admin half, T-16, T-17, T-19, T-09 tag rows). New admin texts: 200, `reviewed: false`; `.claude/state/record-approval-297.py` passes `--check`. Clean-env staging build green (3450 URLs).
