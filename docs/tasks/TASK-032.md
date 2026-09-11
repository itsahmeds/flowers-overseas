# TASK-032 — `proxy.ts` rename and the ADR-0006 lint gate widened: `src/middleware.ts` → `src/proxy.ts`, `fo/no-geo-redirect` filename matcher covering both names, a new violation for importing `next-intl/middleware` or calling `createMiddleware(`, the `geo-redirect-proxy.ts` fixture

Row: `TASKS.md` → TASK-032. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-032-proxy-rename-lint-gate`. First task of spec 003 and the one task unblocked today; §12 order 1, because it closes the gate before any routing code exists that could slip through it. Spec 001 §14 A2 is the authority: matcher widening, the `proxy.ts` fixture and `plan/12` §6's naming land in the **same** PR as the rename, never apart. Discharges three carry-forwards: the `docs/architecture.md` §4 row "middleware.ts → proxy.ts" is removed; the README and `docs/runbooks/local-setup.md` troubleshooting cell for the Next 16 deprecation warning is deleted **together with** its pin in `tests/unit/docs.test.ts` (log 2026-09-08 — that pin is why the earlier attempt was reverted); `src/lib/health.ts` imports `REQUEST_ID_HEADER`/`resolveRequestId` from `@/middleware`, so the rename moves that contract to `src/lib/request-id.ts` and re-points both importers (`/review 6` note addressed to spec 003 — not an AC of 003, recorded here so it is not lost). §6 crawl efficiency and §8 geo-blocking: banning `next-intl/middleware` closes the most likely accidental route to a locale redirect. `x-request-id` behaviour unchanged, so spec 001 AC-14 still passes. Tests: T-10, T-11.

## Read

- `specs/003-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/12`
- `docs/architecture.md`
- `docs/runbooks/local-setup.md`
- `tests/unit/docs.test.ts`
- `src/lib/health.ts`
- `src/lib/request-id.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#13](https://github.com/itsahmeds/flowers-overseas/pull/13); `/review` pass recorded in `TASKS.md`.
