# TASK-083 — Seed importer and the R2 loader flip: `seed/index.ts`'s content half (`--only=catalogue|copy|media|prices|all`, `--dry-run`, `--report`, idempotent upserts by natural key, never touching `source = 'real'`, the dirtied-tag list) plus `r2VariantLoader` + `resolveLoader()` flip, deletion of `public/media/` and `staticVariantLoader`, the CSP `img-src` change and the RoPA/runbook R2 halves

Row: `TASKS.md` → TASK-083. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-083-seed-importer-r2-loader-flip`. **Blocked on TASK-013** for the same reason as TASK-082, and additionally on TASK-026 (spec 002's seed and shared fixtures — spec 002 §14 A1(d) makes its task 10 read `seed/data/**` through this spec's schemas and spec 005's projections, so 002 keeps the tables, the upsert plumbing, partners and geo rows while the catalogue content comes from here). Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. Natural keys: `product.sku`, `category.key`, `occasion.key`, `addon.key`, `media_asset.object_key`, `(product_id, locale_code)` for copy. **AC-26**: three runs produce identical row counts and identical `updated_at` values after the first, a row flipped to `source = 'real'` **survives untouched** (`plan/10` §4), and the report shape equals `seed:diff`'s (spec 002 AC-29 extended to media and copy). **AC-27 and the one real hazard in this spec**: after the flip every image URL is served from `R2_PUBLIC_BASE_URL`, `public/media/` and `staticVariantLoader` are **deleted in the same PR** so there is never more than one image origin, both environments' CSP `img-src` is asserted as a **whole string** (ADR-0016, spec 004 AC-23), and the rendered-markup diff is **origin-only**. **Reverting the loader flip after `public/media/` is deleted leaves no image origin — the flip and the deletion must be one commit and be reverted together** (the same pairing hazard spec 004 §12 recorded for its budget/CSP tasks). Rollback order post-002: revert the flip first (it is the only user-visible step), then delete `source='seed'` media rows, then the additive migration's `.down.sql`. `docs/compliance/ropa.md`'s Cloudflare row (written by spec 002) gains **product imagery** as a data category; `docs/architecture.md` §4's committed-bytes deviation row **closes here**; both runbooks gain their R2 halves. Migration order for the whole post-provisioning sequence, recorded so nobody reorders it: spec 002 `0003` (with the spec 002 §14 A1 amendments) → `db:seed --only=catalogue,copy,prices` → `media:upload` → `media.derive_variants` → loader flip. Gates: `lint`, `typecheck`, `test-unit`, `test-integration`, `test:contract`, `db:check`, `seed-check`, `build`, `test:e2e`, `test:visual`, `lighthouse`. Tests: T-26, T-27. **ADR-0017 clarification (orchestrator, PR 38):** the projected `seed/data/*.json` files carry the authored camelCase records byte-identical to `src/config/catalogue/`; the projection onto spec 002 §5.1's columns happens in the importer through the `to*Row()` functions re-exported from `seed/schema/catalogue.ts` — one import site, never a second row shape.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/**`
- `seed/data/`
- `plan/10`
- `docs/compliance/ropa.md`
- `docs/architecture.md`
- `seed/data/*.json`
- `src/config/catalogue/`
- `seed/schema/catalogue.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._
