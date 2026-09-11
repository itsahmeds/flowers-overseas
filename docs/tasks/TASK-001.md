# TASK-001 — Scaffold: Next.js App Router in TS strict, `plan/01` §5 tree, Tailwind logical vocabulary, Prettier + base ESLint, Vitest baseline, `.gitignore`

Row: `TASKS.md` → TASK-001. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-001-scaffold`. pnpm via `packageManager` + Corepack, Node 24 major (§13 Q2/Q3). Includes `scripts/check-layout.ts` (T-03), `tsconfig.fixtures.json` + `tests/fixtures/ts/unchecked-index.ts` (T-02), Vitest node env + `pnpm test` with one smoke test (enables RuleTester tests in 003/004; AC-16 itself owned by TASK-008), empty module barrels with owning-spec comment, `supabase/migrations/`, `seed/`, `messages/` with `.gitkeep`. Tests: T-01, T-02, T-03, T-33 (CI job for T-01/T-33 is added by TASK-002/011; local run here). PR must already be titled `… (TASK-001)` (§12 note c).

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `scripts/check-layout.ts`
- `tests/fixtures/ts/unchecked-index.ts`
- `supabase/migrations/`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#1](https://github.com/itsahmeds/flowers-overseas/pull/1); `/review` pass recorded in `TASKS.md`.
