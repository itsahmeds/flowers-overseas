# TASK-300 — Spec 012b go-live

Row: `TASKS.md` → TASK-300. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 8. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-25 (as amended by §14 A-orchestrator-2026-10-20a), AC-39 (preflight half); tests T-25, T-41 (preflight half).
- After TASK-294 and TASK-295, and PR 298 (the amendment) merged.
- `setGoLiveFiscalFields` sets `vat_rate_bp` (integer 0 to 10 000) or `supply_model` (`principal` or `agent`) only while the stored value is null, only with `country.status` and a non-empty reason, through `withAdminContext({ action: 'country.fiscal.set' })`; it raises `FISCAL_FIELD_ALREADY_SET` otherwise and writes no other column.
- AC-24's slice A clause holds here: `/admin/countries/[iso2]` renders operations and corridor flags with no edit control (AC-24 itself is TASK-305's).
- The flip goes only through `setCountryStatus` (spec 012's `status_flip_guard()`); go-live stays a data flip in admin, never a code change.
- Add this task's commands to T-09's table (TASK-296).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): country go-live, the VAT rate and indexability.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/geo`, `admin-countries-*`, `admin-country-detail-*`, `flows/admin-go-live.dc.html`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b design review (PR 296) found the go-live screen drawing "Supply model: Not set" read-only. Build from the artboard only once it draws the two fiscal inputs in the preflight's missing state (absent once both are set); that redraw is in progress on PR 296.
- **2026-11-11 (implementer):** (1) **No live corridor file exists** (`content/corridors/en/*-guide.md` only), so every country's check lists "The English country guide is reviewed in its live version" until a reviewed `en` `*-live.md` is authored for it; Poland cannot go live before that file merges (spec 007's content, not this task's). (2) **Staging without `DATABASE_BUILD_URL`** serves the file registry (TASK-294's fallback), so a flip writes the row and audits it but the public pages keep the file's status until the build login is set. (3) The sanctions list (`src/config/sanctions.ts`: BY, IR, KP, RU) is the implementer's reading of broad EU restrictive measures; the founder confirms it with the lawyer before a non-EU destination is added. (4) T-25's e2e half on the preview (`live → demo` gives `noindex,follow` and sitemap exclusion within 60 s) is owed to the e2e pass; the unit and integration halves are green. (5) The `/admin/countries` artboard's backup warning is AC-29 (TASK-301); "Open in the catalogue" waits for TASK-297's product list. (6) Main's reds left as found: `catalog-barrel` (`ga4ProductFacts`, client graph), `admin-permission-binding` (unlisted pages and partners/payouts actions), `codebase-map` size budget, `check:no-db` (analytics).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-11 (implementer, decided in-task, for the orchestrator to confirm):** `country.vat_rate_bp` is `NOT NULL` in the database (`0002`, `country_vat_rate_bp_check`), and the seed fills it from `prices.data.ts` for every destination. So the amendment's "VAT rate missing" state cannot occur, and making the column nullable would be a schema change the spec does not list (and would let pricing read a null). No migration was written: `setGoLiveFiscalFields`, `fiscalInputsFor` and the preflight all handle a null VAT rate, and the unit and page tests prove the both-null screen; in the database only the supply model is ever offered (the artboard's Poland case). The integration suite pins the `NOT NULL` (T-25's both-null fixture is a unit and page fixture, not a row). Open only if the founder wants a country to arrive without a VAT rate.
- **2026-11-11 (implementer, decided in-task):** spec 012b §5.2 places `goLivePreflight`, `setCountryStatus` and `setGoLiveFiscalFields` in `src/modules/geo`. The catalogue module imports geo, and the preflight needs the catalogue's floor (`PRODUCT_COUNT_FLOOR`, now read through `productCountFloor()`), so the rules and schemas live in `src/modules/geo/go-live.ts` (database-free, exported from the geo barrel) and the facts and the two commands in `src/modules/admin/countries.ts`, beside TASK-295's `admin/publish.ts`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer: branch from main f0f1120c4; reading the brief, spec §2.8, §5.2, §5.4, AC-25, AC-39, T-25, T-41 and the go-live boards.
- 2026-11-11 implementer: rules (`src/modules/geo/go-live.ts`), sanctions list, `country.status` permission, the commands and reads (`src/modules/admin/countries.ts`), `/admin/countries` and `/admin/countries/[iso2]` with their actions, 120 admin texts; unit, page and PG16 integration tests green; clean-env staging build green. Draft PR 545.

## Copy approval

- founder (delegated), 2026-11-11: recorded by the orchestrator with record-approval-300.py under the founder's blanket approval of 2026-10-31, after reading the exact text it printed; spec 012b (TASK-300); the founder did not read this text: the 120 admin texts of spec 012b go-live (`admin.countries.*` and the nav entry), exactly as printed.

## Result

PR [#545](https://github.com/itsahmeds/flowers-overseas/pull/545). `/admin/countries` (every destination: status, first live, guide and country-page flags, real florists, priced and saleable counts, the go-live check per row) and `/admin/countries/[iso2]` (operations and corridor flags read-only, florists covering the country, the preflight checklist on any status, Go live behind the typed ISO code, Back to demo, the accountant's-answer form with exactly the null fiscal inputs). `goLivePreflight` gives one named reason per unmet §2.8 condition; `setCountryStatus` re-runs it in the locked admin transaction, writes through `status_flip_guard()`, lets `0044`'s trigger set `first_live_at` once, calls `invalidate()` once with the §5.4 flip set and asks for a publish exactly when the existence diff is not empty; `live → disabled` is refused. `setGoLiveFiscalFields` writes only null fields with `country.status` and a reason (`country.fiscal.set` audit row), else `FISCAL_FIELD_ALREADY_SET`, and invalidates the country facts set once. Tests: unit `country-go-live` (rules, 39), `admin-countries-pages` (pages and actions, 12), `command-tags` rows named; integration `country-go-live` (PG16, 34). New admin texts: 120, `reviewed: false`, `.claude/state/record-approval-300.py` passes `--check`. Clean-env staging build green.
