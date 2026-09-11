# TASK-081 — Docs, records and the no-database seam close (spec 006 Phase-0 close): `docs/runbooks/imagery.md` and `docs/runbooks/seed-catalogue.md` with the review-and-reject loop executed once and its counts recorded, the RoPA "no personal data" statement plus the conditional row, the filed generator terms, `docs/architecture.md` §2/§3/§4, `README.md`'s four new scripts, and the whole-seam assertion that `build` / `test` / `seed:check` / `media:variants --check` all pass with `DATABASE_URL` unset and no network

Row: `TASKS.md` → TASK-081. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-081-seed-imagery-docs-records`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. Split out of spec 006 §12's task T9 by the orchestrator because T9 as written (generate + review + commit imagery, six gate families, visual baselines, the data-flip proof, two runbooks, RoPA, README and the architecture doc) is several days, not one — the same split precedent as spec 004 §12 task 5 → TASK-052…TASK-055. **AC-1 is the whole no-provisioning seam asserted in one test**: `pnpm build`, `pnpm test`, `pnpm seed:check` and `pnpm media:variants --check` all succeed with `DATABASE_URL` unset and MSW `onUnhandledRequest: "error"`, and `pnpm check:no-db` covers **every** file added by §2.2–§2.5 with none importing `src/lib/db*`, `drizzle*`, `pg` or `postgres`. **AC-28** requires the imagery runbook's review-and-reject loop to have been **executed once** for the demo product set with the outcome recorded (generated / accepted / rejected per batch and the rejection reasons) — T-28 is a manual, reviewer-recorded test; do not mark it done on an unexecuted runbook. **AC-29 compliance records:** `docs/compliance/ropa.md` gains the explicit "spec 006 introduced imagery and catalogue data with **no personal data**" statement **and** the conditional row that must be written the moment the founder supplies photography containing an identifiable person or a named florist's shopfront (that would be personal data needing a lawful basis, a model/property release and a retention decision); the generator's commercial-use terms are filed in `docs/compliance/`; `docs/architecture.md` §2/§3 list the new directories and `ui/media` ownership and §4 carries the committed-bytes deviation row; `README.md` documents `seed:check`, `seed:diff`, `media:variants` (and `media:upload` when TASK-082 lands). Both runbooks are added to the runbook index: `seed-catalogue.md` covers editing a product, adding a country's prices, running the gate, reading the diff, re-seeding safely and what "never touch `source='real'`" means operationally (`plan/10` §4); `imagery.md` covers generate/review/reject/regenerate-from-seed, `media:variants`, the budget check, upload after R2, replacing an AI image with a real photo, the `/media/*` crawlability requirement on spec 007, and the R2 storage/egress probe to add beside spec 002's Neon usage probe (`plan/13` D1). Gates: full local chain then one push and `gh pr ready`. Tests: T-01, T-28 (manual, recorded), T-29. **Spec 006 Phase-0 exit signal: this PR merged with a recorded `/review` pass, with TASK-082 and TASK-083 `blocked` on provisioning rather than dropped.**

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `src/lib/db*`
- `docs/compliance/ropa.md`
- `docs/compliance/`
- `docs/architecture.md`
- `plan/10`
- `plan/13`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
