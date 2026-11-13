# TASK-301 — Spec 012b slice A gates and records

Row: `TASKS.md` → TASK-301. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 9. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-26, AC-27, AC-29; tests T-26, T-27, T-29 and T-38's AC-26 rows.
- Spec 012b's one gates task for slice A: the a11y and visual runs for the admin pages run once here.
- ADR-0021 and ADR-0022 are written through `/adr` only if the founder accepts Appendix A and B (§12 founder action 2); otherwise say so in `## Copy approval

- founder (delegated), 2026-11-13: recorded by the orchestrator with record-approval-301.py under the founder's blanket approval of 2026-10-31, after reading the exact text it printed; spec 012b (TASK-301); the founder did not read this text: the 2 admin texts of spec 012b's backup warning (`admin.catalogue.backupWarning.*`), exactly as printed.

## Result`.
- Exit signal (§12): on staging, a bouquet created in admin is on the Polish shop after one publish with no code change.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): auth, compliance records and env declarations.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `docs/compliance/` RoPA, `.env.example`, `src/lib/env.ts`, `config/railway.json`, `docs/runbooks/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-13 (implementer, self-review):** (1) **Clean-env build not run**: the 180-minute limit hit before the build slot was taken; run `env -i PATH="$PATH" HOME="$HOME" APP_ENV=staging NEXT_PUBLIC_APP_ENV=staging NEXT_PUBLIC_SITE_URL=https://staging.flowersoverseas.com NODE_OPTIONS=--max-old-space-size=4096 pnpm build` in the slot before `gh pr ready`. Then mark ready and add `ci:full`. Also still to do: set the TASKS.md row to `in_review` with PR 550. (2) **T-38's AC-26 rows (axe), and the AC-23 rows TASK-299 handed here, are not run, and neither is T-39 visual**: no admin page is in any Playwright suite, because none has a signed-in session over a seeded database. It needs its own task: a Playwright fixture that signs in through the capture mailer on a seeded preview, then axe and visual over the eight 012b pages. Done statically here: the publish status (`publish/page.tsx` L76) and the upload progress (`MediaUploadForm`) already have their polite live regions. (3) **Backup record source**: `lastBackupVerifiedAt()` (`src/modules/admin/backup.ts`) returns `null` because spec 002's `db.backup_verify` has no handler and writes no record (TASK-028 is `todo`). Until then, production always shows the warning, which is accurate. TASK-028 replaces that function's body with a read of its record. (4) **`config/railway.json` cannot list variables**: Railway's config-as-code schema (railway.com/railway.schema.json: `build`, `deploy`, `environments`) has no variables block, and an unknown key risks Railway rejecting the file. The "Railway declarations" therefore live in the contract `railway:check` derives from the env schema (`REQUIRED_VARIABLE_KEYS`, plus `CONTRACT_KEYS_NOT_REQUIRED` for PR environments), proven against the recorded fixtures. The live `pnpm railway:check --env staging|production` passes only once the founder sets the three keys. (5) **ADR-0021/0022 not written**: no founder acceptance of Appendix A/B is recorded, and those numbers went to the Wyoming LLC and Consent Mode ADRs. Once accepted, they take the next free numbers (0024+). (6) **The public uploaded-photo render**: the shop still renders product photos from `seed/data/media.json` (the static media provider). Spec 012b puts "approved uploaded photo renders in a locale with alt" under AC-23 (TASK-299's); the public path that must read `media_asset`/`product_media` is the catalogue's media provider under `src/modules/catalog`. Not this task's AC. (7) Main's reds left as found: `freshness-claim` (13 admin strings, none of them new), `no-import-time-env` (payments wiring, a 5 s timeout), and the container health case (also a timeout). The railway-check counts that were red on main (41 and 37 against 52) are fixed here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer: branch `task/TASK-301-cms-gates` from main `3e5773b50`; row `in_progress`. Next: env declarations, permission suites, backup warning, records.
- 2026-11-11 implementer: env keys declared (`fa2ed1424`), T-26 suite (`tests/unit/catalogue-cms-permissions.test.ts`), backup warning, runbook, RoPA and architecture records, plus T-27/T-29 (`tests/unit/catalogue-cms-records.test.tsx`), codebase map regenerated. `record-approval-301.py --check` passes (2 keys).
- 2026-11-13 implementer: time limit reached; **partial**. Left to do: the clean-env build in the slot, `gh pr ready` + `ci:full`, and the TASKS.md row `in_review` (carry-forward 1).

## Result

**Partial.** PR [#550](https://github.com/itsahmeds/flowers-overseas/pull/550). AC-26: the spec's §5.2 rows are parsed from `specs/012b-cms.md` and every cell is asked of `can()`. Each 012b action, handler and fixed-permission page is bound per role (403 for each role left out, past the guard for each role marked). Spec 012's walks find all 8 pages, 4 action files and 2 handlers with no list edited by hand, and every 012b URL falls under the `/admin/:path*` noindex/no-store rule. That is 112 unit cases. AC-27: every `admin.{catalogue,media,countries,publish,review}` key named in `src/` resolves in `messages/admin/en.json`, and no public catalogue or meta file has one. The history half was checked once: `git show --name-only` over the slice A squash merges a1f72befa (292), e8a0ba3e3 (293), 777819db5 (294), 7c7d9810c (295/296), b48498758 (297/298), fbefb5b41 (300) and 3e5773b50 (299) lists no `messages/{en,en-gb,de,pl}(.meta).json`. AC-29: the backup warning on the 8 section pages, production only (shown at 49 h and when absent, not at 47 h or 48 h; tested on a rendered page). `docs/runbooks/catalogue.md` is indexed, the RoPA has rows 28 and 29 (renumbered at merge; reviews took 25 to 27) plus the Railway note, and `docs/architecture.md` has a "catalogue as data" section. The three keys are in `.env.example`, the env schema (the build login as `BUILD_CREDENTIAL_ENV_KEYS`; `fake` is refused in production and staging; `railway` without a token is refused when deployed) and the Railway contract. `env:check` 0; `railway:check` 0 against the recorded fixtures. That is 29 unit cases. Two new admin strings ship `reviewed: false`. Updated: the `container`, `db`, `env` and `env-check` tests and the `railway-check` contract counts and fixtures. Exit codes: typecheck 0, eslint 0, i18n:check 0, check:no-db 0, codebase:map --check 0, own and affected vitest files green. Not run: the clean-env build (carry-forward 1).
