# TASK-033 — Locale, currency and address config with zod: `src/config/locales.ts` (four launch locales, `pathSegments` per `plan/02` §4.1), `src/config/currencies.ts` (ten currencies), `src/config/address-formats.ts` (PL, DE, AT, GB and generic), `LocaleRegistrySchema` / `CurrencyConfigSchema` / `AddressFormatSchema`, `toLocaleRow` / `toCurrencyRow`, the no-database static check

Row: `TASKS.md` → TASK-033. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-033-locale-currency-address-config`. The no-database seam is the point (§1, §5.1): AC-2's static check asserts that no file added by spec 003 imports `src/lib/db*`, `drizzle*`, `pg` or `postgres`, and that `pnpm build` plus `pnpm test` pass with `DATABASE_URL` unset — which is why this spec is implementable while TASK-013 is parked. AC-4 pins `toLocaleRow` to spec 002 §5.1's `locale` column set and `toCurrencyRow` to `currency`'s, so TASK-015 and TASK-026 seed from these projections instead of restating the locale set and the two cannot drift. §6: the localised URL segments are authored here, human-written from `plan/02` §4.1, never machine-drafted; their shape and per-locale uniqueness are gated as AC-13 by TASK-040. §8 consumer information: `/de/rechtliches/agb`, `/de/impressum` and `/pl/regulamin` are fixed now so spec 004/007's legal pages land on the URLs the German and Polish regimes expect. `scripts/check-layout.ts`'s manifest and `docs/architecture.md` §2 gain `src/config/`. Resolved inputs: §13 Q1 (four prefixes, A1) and Q8 (`isLaunch` as the Phase 0 go-live switch — an accepted, bounded deviation from the CLAUDE.md data-flip rule, read only through `LocaleRegistryProvider`). Tests: T-01, T-02, T-04.

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/lib/db*`
- `plan/02`
- `scripts/check-layout.ts`
- `docs/architecture.md`
- `src/config/`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#14](https://github.com/itsahmeds/flowers-overseas/pull/14); `/review` pass recorded in `TASKS.md`.
