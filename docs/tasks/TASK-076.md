# TASK-076 — `pnpm seed:diff`: the `SeedTarget` interface, `snapshotTarget`, the differ, the stable per-table report (inserts / updates / unchanged / conflicts) and the committed JSON snapshot

Row: `TASKS.md` → TASK-076. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-076-seed-diff`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. **One differ, two targets** — `snapshotTarget` now, `dbTarget` in TASK-083 — so the command the founder learns in Phase 0 is the command that runs against the database later, and `db:seed`'s report shape is this report's shape (spec 002 AC-29 extended to media and copy, AC-26 on TASK-083). AC-11: zero inserts / zero updates / zero conflicts on the merged tree; a snapshot with one changed price reports **exactly one** update naming the SKU, country, tier and **both** amounts; `--dry-run` writes nothing, asserted by a clean `git status` **and** an unchanged snapshot mtime. The report is the audit trail of §11 — post-002 every run also prints the cache tags it dirtied with `request_id` and `actor = system:seed` (`plan/11` §1's actor convention). Runs entirely offline with `DATABASE_URL` unset. Gates: `lint`, `typecheck`, `test-unit`, `seed-check`, `check:no-db`. Tests: T-11.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `plan/11`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#48](https://github.com/itsahmeds/flowers-overseas/pull/48); `/review` pass recorded in `TASKS.md`.
