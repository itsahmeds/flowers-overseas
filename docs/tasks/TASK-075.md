# TASK-075 — `pnpm seed:check` and the `seed-check` CI job: all nine rule families of §2.3 with one fixture per family, the per-(country, category) and per-(country, occasion) coverage table, the step summary, and the job on `needs: typecheck` added to the derived required-check set

Row: `TASKS.md` → TASK-075. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-075-seed-check-gate`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. The nine families: schema/`version` parse; counts and split (84 in 40/14/8/10/12, 23 categories, 6 add-ons); referential integrity (facet, category/occasion edge, price row, media asset); **slugs** (ASCII, lowercase, hyphenated, no trailing slash, unique per locale **across products, categories and occasions**, equal to the ASCII fold of the name — `Kraków Spring` → `krakow-spring`, AC-7); prices (band, integer, currency, ending, tier step tolerance, single open-ended row); copy (60–90 words at the 59/60/90/91 boundaries, closing local-florist sentence, banned superlatives, **duplicate description across two products**, missing `en` name or slug); media (complete provenance, one `is_primary` per product, variant present with matching checksum, alt text per launch locale, no empty alt on a product image); **no PII and no third-party marks** (`@`-shaped, E.164-shaped, postcode-shaped, real-person allowlist, competitor brand names from `docs/research/competitors-*.md`) reported with the file **and the JSON path** (AC-9); and byte budgets. One line per problem, naming file, entity key and rule; exit 0 on the merged tree. The step summary is the standing catalogue-health report of §11 — product counts by type, the six-product-rule coverage table (`plan/02` §6, so 008 can test both sides of the threshold and the PL set is guaranteed to pass), price-band outliers, description word-count distribution, copy review shares per locale, committed image bytes, per-slot maxima and the count of products still on a placeholder. **A locale or country must not be able to look ready in CI while it is gated in code.** Job placement per spec 001 §14 A9 (`needs: typecheck`, as `i18n-check` and `catalogue-check` do) plus `scripts/branch-protection.ts` (AC-30). CI minutes: gates locally, one push, `gh pr ready` (TASK-057). Gates: `seed-check`, `lint`, `typecheck`, `test-unit`, `build`. Tests: T-07, T-09, T-10, T-30. **From PR 41's spine:** `tests/unit/seed-prices.test.ts`'s projection test hit the 5 s default timeout once on a loaded runner — give the byte-for-byte projection tests an explicit `{ timeout }` when wiring `seed:check`. TASK-073 ships the copy rule family as functions (`seed/copy.ts`: `copyProblems`, `duplicateDescriptions`, `wordCount`, `bannedSuperlativesIn`, `asciiFoldSlug`) — compose, do not re-implement.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `docs/research/competitors-*.md`
- `plan/02`
- `scripts/branch-protection.ts`
- `tests/unit/seed-prices.test.ts`
- `seed/copy.ts`

## Carry-forwards

- **From `/review 41`:** add a delivery-timing phrase check (spec 006 §14 A4: next day / same day / working day / lead time / "or late") and `freshest`-class superlatives to the copy rule family; surface category/occasion `seoTitle` near-duplicates (10 topic-sharing pairs) in the health report for spec 008 to nominate a primary.

## Escalations

_None recorded._

## Result

Done. PR [#46](https://github.com/itsahmeds/flowers-overseas/pull/46); `/review` pass recorded in `TASKS.md`.
