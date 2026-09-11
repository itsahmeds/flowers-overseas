# TASK-006 — Health route, placeholder shell (`layout`, `page`, `not-found`, `error`), `robots.ts` disallow-all, non-production `X-Robots-Tag: noindex` header, `lib/cache.ts` noop seam

Row: `TASKS.md` → TASK-006. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-006-health-shell-noindex`. §6 indexability belt-and-braces (meta + header + robots), zero `Set-Cookie`, no third-party scripts, `<html lang="en" dir="ltr">` (lang literal documented as 003 removal in TASK-012). Reviewer verifies AC-14/15 locally via `pnpm build && pnpm start` + `curl -I`; preview re-check happens in TASK-008's e2e (T-15, T-16).

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#6](https://github.com/itsahmeds/flowers-overseas/pull/6); `/review` pass recorded in `TASKS.md`.
