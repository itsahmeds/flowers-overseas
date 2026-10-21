# TASK-292 — Spec 012b insert-only seed, country registry and the build role

Row: `TASKS.md` → TASK-292. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 1. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-1, AC-2 (country half), AC-4; tests T-01, T-02 (country half), T-04.
- Depends on TASK-026 and TASK-027 (done) and TASK-070 (unblocked 2026-10-20; dispatch it first or build on its merged providers).
- `DATABASE_BUILD_URL` is the only database the build reads; its value is in no image layer, history entry or label (AC-4). The founder creates the `app_build` login (§12 founder action 4).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): a migration, a database role and CI.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `seed/index.ts`, `src/config/countries.ts`, `.github/workflows/ci.yml` build job

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-21 (implementer, PR 309) **`corridorPagePublished` has no database column.** §2.2 lists
  it among the country facts the database owns and AC-3's scan forbids a runtime read of it from
  `countries.ts` outside the static providers, but `country` (`0002`) carries `guide_published`
  only and §5.1 adds no column for it. TASK-292 keeps it file-sourced in both registries, so the
  country parity holds and nothing here is blocked. Question for TASK-294's cutover: add
  `country.corridor_page_published` to `NNNN_catalogue_cms` (seeded from the file), or keep the
  flag in the file and amend AC-3's field list? To the orchestrator / founder. `open`.
- 2026-10-21 (implementer, PR 309) **§5.1 item 1's `ALTER ROLE app_build SET app.role = 'public'`
  cannot run on Neon.** On Postgres 15 and later only a superuser may set a role default for a
  placeholder parameter; reproduced on PG16 as a `CREATEROLE` login (`permission denied to set
  parameter "app.role"`), which is what Neon's migration login is. Not issued; the intent holds
  without it: an unset `app.role` reads as `public` (`app_current_role()`, `0011`), the build
  policies do not read it, and `src/lib/db.ts` sets it in every transaction. Recorded as a
  deviation in the migration header and the PR. FYI, not blocking.
- 2026-10-21 (implementer, PR 309) **AC-4's "with the database unreachable the build exits
  non-zero" is not observable before the cutover**: no prerender reads the database until
  TASK-294 selects the database providers. Proven here at the client: the build-phase client throws
  naming `DATABASE_BUILD_URL` when it is absent or malformed, and fails with `ECONNREFUSED` when the
  database is unreachable, never falling back to `DATABASE_URL` (unit + integration). The
  end-to-end build run with the database stopped is handed to TASK-294 as a carry-forward. FYI.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21: migration `0018_catalogue_build_role` + rollback, `--insert-only` and the production
  refusal, the real-parent guard, the seed's country status from `countries.ts`, the build-phase
  client, `dbCountryRegistry` (`src/modules/geo/db/registry.ts`), `pnpm catalogue:parity`; draft
  PR 309.
- 2026-10-21: T-01, T-02 (country half) and T-04 written and green on a throwaway PG16; CI `build`
  job on Postgres 16 with parity as `app_build`; `container` job searches the image for a
  `DATABASE_BUILD_URL` sentinel (with a positive control on the build stage); `db:check` snapshot
  regenerated; every AC-carrying assertion watched red under a mutation.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 309. **AC-1**: `db:seed --insert-only` issues no `UPDATE` (every existing row byte-identical,
missing rows inserted); `APP_ENV=production` without it exits 1 before connecting; in every mode a
row whose parent product, country or florist is `real` is neither updated nor inserted (reported
`under real`). **AC-2 (country half)**: the seed writes each country's status from `countries.ts`
(insert only: on an existing row status is admin's flip); `countryRegistryFromRows` overlays a
`country` row on the file registry; `pnpm catalogue:parity --target=<url>` is empty on a fresh seed
and exits 1 naming every corridor and shop-root URL and field that differs. **AC-4**: `app_build`
(`NOLOGIN NOBYPASSRLS`) has `SELECT` on exactly 32 public reference tables (spec 002's public set
minus the two order reference tables, plus the two flag tables) with one `<table>_build_read`
policy each; `src/lib/db.ts` connects through `DATABASE_BUILD_URL` and enters `app_build` while
`NEXT_PHASE=phase-production-build`, with no fallback; the Dockerfile declares it as a build-stage
`ARG` only, and CI proves the shipped image carries the value in no layer, history entry or label.
Tests: unit 4 files (`seed-insert-only` 4, `country-registry` 11, `db` +5, `rls-policies` +3, plus
pins in `container`, `ci-workflow`, `db-check-recipient-email`, `db-migrate`, `lint-coverage`,
`no-db-imports`); integration 2 new files (`seed-insert-only` 4, `build-role` 7) and updates to
`seed`, `migrations-round-trip` (app_build in the role census) and `payments-a7` (its "changes
nothing" case now rolls the later migrations back first). Mutations watched red: the production
refusal, insert-only, the parent guard (tables and cities), the seed's status projection, the
build-phase role and URL, a stray `SELECT` grant, a missing grant, a closed policy, a stray
`INSERT` grant (caught by the privilege-catalogue assertion added for it), the parity comparison.
`pnpm gates:cheap` at `eed00bf3`: typecheck, lint, format:check, i18n:check, check:no-db and
codebase:map --check exit 0; the unit run reported 10 files red under load average 17 (5 s
timeouts), all 10 green when rerun at load 6 with a longer timeout, plus `docs.test.ts` (the new
script's README row, fixed). No build slot taken. Handed on: the end-to-end "build with the
database stopped exits non-zero" and the `corridorPagePublished` column question to TASK-294
(Escalations); `.env.example`/env schema/`config/railway.json` declarations of
`DATABASE_BUILD_URL` to task 9 (AC-29) — this PR documents the key in `.env.example` as a comment
and lets `railway:check` accept it on staging and production.
