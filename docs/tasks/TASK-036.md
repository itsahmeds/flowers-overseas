# TASK-036 — Formatters: `src/modules/i18n/format.ts` (`formatMoney` over the integer-to-decimal-string path, `formatNumber`, `formatPercentFromBasisPoints`, `formatDate`, `formatTimeInZone`, `formatRelativeTime`, `formatList`, `formatRange`), `collate.ts`, `MoneySchema`, the `currencies` fixture

Row: `TASKS.md` → TASK-036. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-036-formatters`. §8 price display becomes mechanically supportable rather than promised: integer minor units plus the currency's `minorUnitExponent` are turned into a decimal **string** and handed to `Intl.NumberFormat` (ES2023 string input), so no float ever holds money — proven by formatting 9007199254740993 minor units with no precision loss, and by `MoneySchema` rejecting a non-integer at the boundary. `formatTimeInZone` takes a required IANA zone and renders the zone label; there is deliberately no "local time" overload, because "local" is ambiguous in a relay (§5.2, `plan/03` §10). §7's formatting table gets at least one test per launch locale: separators (`1,234.50` / `1.234,50` / `1 234,50`), symbol position (`£45.00` / `45,00 €` / `45,00 zł`), percent spacing from basis points (`20%` / `19 %` / `23%`), short and delivery dates, list joiners and Polish `ł` collation. Fills `currencies` in `tests/fixtures/index.ts`; spec 002's AC-34 must extend rather than redefine it (§12). No date is *computed* here — occasion arithmetic, cutoffs and DST are spec 009. Tests: T-15, T-16, T-17, T-18.

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/03`
- `tests/fixtures/index.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#17](https://github.com/itsahmeds/flowers-overseas/pull/17); `/review` pass recorded in `TASKS.md`.
