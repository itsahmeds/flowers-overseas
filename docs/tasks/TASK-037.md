# TASK-037 — `fo/no-adhoc-intl` and address formatting: the new lint rule banning `Intl.*` construction, `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString`, `toFixed` and currency/percent template concatenation everywhere in `src/` except `format.ts` and `collate.ts`, with fixture pairs and RuleTester tests; `src/modules/i18n/address.ts` (`formatAddressBlock`, `postcodeRegex`, `normalisePostcode`) and the `addresses` / `phones` fixtures

Row: `TASKS.md` → TASK-037. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-037-adhoc-intl-ban-address`. The rule is the mechanism behind "exactly one way to render a price, a date, a list or an address block" (§4, §7) and must land immediately after the formatters exist, before specs 004–011 can invent a second way; it also removes the `toFixed` and string-concatenation paths through which a rounding error would otherwise enter a displayed price (§8 price display). The fixture pair proves the identical code is valid inside a path simulating `src/modules/i18n/format.ts` and invalid outside it. Address data is `plan/03` §8 verbatim (PL `ul. … 10/5` with postcode `00-001`, DE house number after the street, GB postcode after the town) with label **keys**, so a new country is data plus four message keys; `formatAddressBlock` is pure and fixture-tested. E.164 phone validation, postcode lookups and the address *forms* stay in spec 010; recipient phone being required in every format is recorded in the data now. Fills `addresses` and `phones` in `tests/fixtures/index.ts`. Tests: T-19, T-21.

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/modules/i18n/format.ts`
- `plan/03`
- `tests/fixtures/index.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#18](https://github.com/itsahmeds/flowers-overseas/pull/18); `/review` pass recorded in `TASKS.md`.
