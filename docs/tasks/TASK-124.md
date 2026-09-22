# TASK-124 — Operational data and gates: Poland's `operations` block (§13 Q3: `Europe/Warsaw`, `14:00`, Mon–Sat, `sundayDelivery: false`) and **no other country's**, PL public holidays in `holidays.json` for the rendered window, the four new `seed:check` rules (published country without holiday rows in-window; holiday without `nameKey`; undatable `rule_type`; missing product slug where §13 Q1 requires one) with one failing fixture each, the picker-state CI step summary; `deliveryDatesOpen(iso2)` from TASK-120 re-sourced to `pickerState()`

Row: `TASKS.md` → TASK-124. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-124`; keep it current by editing this file, not the row.

## Binding

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/review 93` round 2 via TASK-114 (2026-09-21):** landing PL's `operations` block is the
  first of the two facts that arm a deliberate tripwire. `tests/unit/listing-params.test.ts`,
  case "cannot be asserted on a country-scoped type yet, and this is why", asserts
  `corridorState("PL","en") === "guide"` **inside** `withActivePartnersProvider({ hasActivePartners:
  () => true }, …)` and then asserts `noindex,follow` on both sides of the `parameterised` flag.
  It stays green for you — `corridorState()` also needs a `live` content file, and
  `content/corridors/en/` holds only `pl-guide.md`, which `corridor:check`'s `live-operations` rule
  will now permit for the first time. When the `pl-live.md` half lands too, that case goes **red**,
  and the fix is not to relax it: move the two-directive assertion onto `countryShopRoot`
  (`{ locale: "en", pageType: "countryShopRoot", country: "poland" }`), where an `index,follow`
  base URL and a `noindex,follow` `?sort=` URL become distinguishable for the first time and spec
  008 **AC-15** actually bites. Nothing else in TASK-114 changes.

- **From `/review 97` rounds 1–2 via TASK-123 (2026-09-22; merged as `2b64267`):** two findings
  land on you, because this task next edits the calendar's data and its suite.
  1. **The holiday data runs out silently.** With holiday rows for 2027 only, the grid offered
     **2028-01-01 (New Year) as open** and `nextOpenDate` returned it. The picker looks 366 days
     ahead, and nothing refuses a window that runs past the last year of holiday data. Your
     `seed:check` rule ("published country without holiday rows in-window") is the fix. Define
     *in-window* as the picker's full horizon, not the current year. Prove it by mutation: drop
     the last year's rows and the rule goes red, naming the country and the first uncovered date.
     `seed/data/holidays.json`'s note now says this rule does not exist yet; update it when it does.
  2. **Pin the DST fixture table lengths.** In `tests/unit/geo-delivery.test.ts`, emptying
     `DST_READINGS` leaves the suite 232/232 green, and emptying `DST_WINDOWS` leaves it 298/298
     green, because their loops then declare no cases. Pin them at **30** and **8**, and prove each
     pin by emptying its table. The same class of hole applies to any `for … of FIXTURE` loop you
     add.

- **From `/review 100` round 1 (2026-09-23): PASS on `545e056`** (CI run 35775978715, 22/22, on
  that exact SHA). Both carry-forwards landed. Every claim was checked by breaking it:
  `deliveryDatesOpen` reverted to the TASK-120 body → 17 red over the chrome suites (the claimed 15
  plus two new `countries-config` cases); `!== "unavailable"` → 17 red; stuck `false` → 1 red. A
  local build with the block and no partner printed **no** "14:00", "Order by 14", "same-day" or
  "delivery today" on `/en`, `/en-gb`, `/de`, `/pl`, `/en/send-flowers-to/poland` or the four PL
  shop roots, and the same build with the old rule printed "Order by 14:00" 8× on `/en`. Every
  cutoff/date surface goes through `anyDeliveryDatesOpen()` or `pickerState()`, or through
  `corridorState()`, which is stricter. A default cutoff in the schema → 39 red. A default in
  `deliveryWindow` → 3 red. `pickerStateFrom` treating a missing block as preview → 10 red. With
  each of the four rules disabled, 5/2/2/2 red. Horizon counted in UTC → 2 red, 365 days → 4 red,
  2027 rows dropped → exit 1. `--as-of=2026-12-30T22:59Z` exits 0 and `…23:00Z` exits 1 on
  `PL/2028`. All 28 holiday dates match an independent computus (Easter 5 Apr 2026 / 28 Mar 2027).
  Emptying `DST_READINGS` or `DST_WINDOWS` gives 1 red each. `listing-params` changed only in
  comments and passes 18/18, and indexing a `pl-live.md` turns both designed tripwires red.
  `pickerState` is defined once. The i18n files are untouched. Nits, none blocking:
  1. **Orchestrator: open a row for Poland's 2028 holidays before 30 Dec 2026 23:00 UTC.** From
     then on `seed-check` is red on every PR. The line is actionable (it names the file, the rule,
     `PL/2028`, the horizon and 2028-01-01), but nothing warns ahead of time and no row exists.
  2. Stale prose. The first paragraph of the `deliveryDatesOpen` docstring (`countries.ts`
     L459–465) still describes the old `status && operations` body. `prices.data.ts` L455 still
     says Poland "has no `operations` at all".
  3. To TASK-125/126: a `preview` `DeliveryWindow` carries `cutoffLocal`/`timeZone`, and the schema
     allows it. The renderer must print the cutoff line in `live` only (§2's table).
  4. Pre-existing: the PL-only `OccasionDates` strip is gated on the global `anyDeliveryDatesOpen()`
     instead of `deliveryDatesOpen("PL")`. It fails open for Poland once any other country goes
     live first.
  5. `holiday-coverage` asks for at least one row per year, not a complete year. Only the unit pin
     guards the 14 per year of the committed data.
  6. **To TASK-126/127 (copy gate):** there are **14** distinct `delivery.holiday.pl.*` keys across
     28 rows, not 28. The measured baseline on `main` 430cf34 is en 22/498 = 4.4%. If all 14 land
     unreviewed that becomes 36/512 = 7.0%, and 39/525 = 7.4% from the quoted 25/511. Either way
     `en`/`en-gb` stop being indexable. At most 3 of the 14 (1 from 25/511) may land unreviewed.
  7. `TASKS.md` row is still `todo` with PR `—`; orchestrator to set `in_review` + #100.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

**PR [#100](https://github.com/itsahmeds/flowers-overseas/pull/100)** · spec 009 AC-2, AC-8 (data
half) · T-02. Poland's `operations` block is authored in `src/config/countries.ts` exactly as §13 Q3
rules (`Europe/Warsaw`, `14:00`, Mon–Sat, `sundayDelivery: "none"` — spec 002's value for "false")
and **no other destination has one**, so Poland's picker is `preview` and the six others stay
`unavailable` (no global default cutoff). `deliveryDatesOpen(iso2)` is now `pickerState(iso2) ===
"live"`, with no call-site change; it had to move in the same commit, because the TASK-120 body
(`status === "live"` and a block) turns true for Poland the moment the block exists — reverting it
turns **15** chrome-honesty / footer / home-strip cases red. `pickerState()` and
`NEXT_AVAILABLE_HORIZON_DAYS` moved to `src/modules/geo/delivery/state.ts` (re-exported by
`calendar.ts` unchanged), because the registry and `seed:check` are loaded by plain `node` and
`calendar.ts` reaches the `i18n` barrel's `.tsx`. `seed/data/holidays.json` carries Poland's 14
statutory holidays for 2026 and 2027 (incl. Wigilia, a day off since 2025), pinned by date in
`geo-delivery.test.ts`.

`pnpm seed:check` gains a tenth family, **`calendar`** — `holiday-coverage` (in-window = the
picker's full 366-day horizon from today in the destination's zone; the line names the country and
the first uncovered date), `holiday-name-key`, `undatable-rule` — plus **`slugs/product-slug-required`**
(§13 Q1). The instant is `SeedTree.asOf`, read once by `readSeedTree()`, pinned by the unit suite
and by `--as-of=`; the CI job uses the real clock. `--report` opens with the §11 picker-state table.
One failing fixture per rule under `tests/fixtures/seed/_cases/{calendar,slugs}/`; the fixture
table is pinned at 25 and each new rule at exactly one. `DST_READINGS` / `DST_WINDOWS` pinned at
30 / 8.

**Mutations (each run, red, restored, green):** coverage loop disabled → `bad-holiday-horizon` 2
red; name-key check disabled → `bad-holiday-name-key` 2 red; undatable check disabled →
`bad-undatable-rule` 2 red; product-slug check disabled → `bad-missing-product-slug` 2 red;
**2027 rows dropped from the committed file** → `pnpm seed:check` exit 1, "`PL/2027` … the first
uncovered date is 2027-01-01"; `DST_READINGS` emptied → 1 red (239 green); `DST_WINDOWS` emptied →
1 red (305 green); predicate forced false → 1 red; PL block removed → 22 red and a DE block added → 7 (both over the `-t "Poland|horizon|picker"` subset)
red, and `seed:check` names DE 2026/2027. The horizon boundary is pinned on committed data by the
CLI: `--as-of=2026-12-30T22:59:00Z` exit 0, `…23:00:00Z` (00:00 Warsaw) exit 1 on `PL/2028`.

**The TASK-114 tripwire stayed green** (`listing-params.test.ts`, 18/18): `corridorState("PL","en")`
is still `guide` because `pl-live.md` does not exist. Only its comment changed (it said Poland had
no block). `corridor:check`'s `live-operations` fixture moved from `pl-live.md` to `de-live.md`,
since a live Polish file is now permitted.

**Handed on.** (1) **`seed:check` goes red on 31 Dec 2026 (Warsaw)** unless Poland's 2028 holidays
are authored first — the rule working as designed, not a flake. (2) The 28 `delivery.holiday.pl.*`
name keys have no message strings yet; the UI task that renders a holiday reason (TASK-126/127)
authors them in four locales. (3) When TASK-142 lands `pl-live.md`, both
`listing-params.test.ts` (carry-forward above) and `corridor-route.test.ts` "keeps Poland in the
guide state even with a florist and a cutoff" go red by design. (4) The spec 006 §14 amendment
record for the new family is AC-29's (task 13). (5) `toCountryRow()` still projects three
columns: spec 002's `iana_zone` is `NOT NULL` and six destinations have no zone.
