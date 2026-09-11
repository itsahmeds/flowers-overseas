# TASK-072 — Seed schemas and dataset skeleton: `seed/schema/*.ts` (every `Seed*Schema`, `MediaAssetManifestSchema`, `MediaVariantManifestSchema`, `AltManifestSchema` and every `to*Row()` projection with its pinned column test) and `seed/data/` — `taxonomy.json`, `categories.json` (23), `occasions.json` + `occasion-country.json`, plus the generated-and-committed `products.json` (84), `product-tiers.json` and `addons.json`

Row: `TASKS.md` → TASK-072. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-072-seed-schemas-dataset-skeleton`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. **Dataset-ownership ruling (orchestrator, 2026-09-09):** spec 005 §13 Q9 makes `src/config/catalogue/*.data.ts` the single authored source of catalogue *rows* (products, tiers, add-ons, prices, FX) while spec 006 §13 Q10 makes `seed/data/` what spec 002's seed reads. Both hold only if 006's `products.json`, `product-tiers.json`, `addons.json`, `prices/{ISO2}.json` and `addon-prices/{ISO2}.json` are **generated projections** of 005's dataset (through 005's `to*Row()` functions), committed, and asserted equal by `seed:check` — never a second hand-authored copy. 006 exclusively owns `taxonomy.json`, `categories.json`, `occasions.json`, `occasion-country.json`, `copy/`, `media.json`, `media-variants.json` and `alt/`. Escalated to the founder: if 006 should instead hand-author its own catalogue rows, spec 006 §2.2 needs an amendment before TASK-072 starts. Every file carries a `version` header and `source: "seed"`. Projections must return exactly spec 002 §5.1's column lists for `product`, `product_translation`, `country_price`, `addon_country_price`, `media_asset`, `media_variant`, `product_media`, `product_media_alt` **including the seven media columns and the two catalogue amendments of spec 002 §14 A1** (`media_asset.generator_model`/`.credit`/`.licence`/`.depicts`/`.reviewed_by`/`.reviewed_at`, `media_variant.checksum_sha256`, `addon_country_price.vat_rate_bp`, `product_tier.is_default`), each pinned by a unit test that fails if either side is edited alone (AC-3). `occasion-country.rule_type`/`rule` shapes are transcribed verbatim from `plan/03` §9 and spec 002 §5.1 — the **evaluator is spec 009's** and must not be written here. No file added by this task or TASK-073…TASK-080 may import `src/lib/db*`, `drizzle*`, `pg` or `postgres`; extend `pnpm check:no-db` to `seed/**` in this PR (the whole-seam assertion is AC-1 on TASK-081). Gates: `lint`, `typecheck`, `test-unit`, `check:no-db`. Tests: T-03, T-04.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `src/config/catalogue/*.data.ts`
- `plan/03`
- `src/lib/db*`
- `seed/**`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#38](https://github.com/itsahmeds/flowers-overseas/pull/38); `/review` pass recorded in `TASKS.md`.
