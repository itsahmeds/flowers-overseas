# TASK-074 — Seed price files: `prices/{ISO2}.json` + `addon-prices/{ISO2}.json` for the eight seeded countries — projected from spec 005's `prices.data.ts` through its `toCountryPriceRow()` / `toAddonCountryPriceRow()`, with tier steps, `surcharge_kind` rows, `active_from`/`active_to` and integer minor units + currency on every row

Row: `TASKS.md` → TASK-074. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-074-seed-price-files`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. **Dataset-ownership ruling (orchestrator, 2026-09-09):** spec 005 §13 Q9 makes `src/config/catalogue/*.data.ts` the single authored source of catalogue *rows* (products, tiers, add-ons, prices, FX) while spec 006 §13 Q10 makes `seed/data/` what spec 002's seed reads. Both hold only if 006's `products.json`, `product-tiers.json`, `addons.json`, `prices/{ISO2}.json` and `addon-prices/{ISO2}.json` are **generated projections** of 005's dataset (through 005's `to*Row()` functions), committed, and asserted equal by `seed:check` — never a second hand-authored copy. 006 exclusively owns `taxonomy.json`, `categories.json`, `occasions.json`, `occasion-country.json`, `copy/`, `media.json`, `media-variants.json` and `alt/`. Escalated to the founder: if 006 should instead hand-author its own catalogue rows, spec 006 §2.2 needs an amendment before TASK-072 starts. Depends on TASK-062 because that task authors the price rows and corrects `src/config/currencies.ts` to the binding endings (PLN `x9`, HUF `x90`) — this task must not restate a band or an ending. Exactly **one open-ended row per (product, country, tier, surcharge)**: the file-level mirror of spec 002's partial unique index, which is what preserves the Omnibus Art. 6a 30-day-lowest history by superseding rather than updating (§8, spec 002 AC-9). Every row is VAT-and-delivery-inclusive integer minor units with a currency (`CLAUDE.md`, `plan/07` §4). AC-6 requires a fixture per failure shape — out of band, float amount, wrong psychological ending, a second open-ended row, unknown tier — each failing `pnpm seed:check` with a message naming the file, the SKU and the rule (the check itself lands in TASK-075, so ship the fixtures here and wire them there). No image, badge, strike-through or scarcity claim anywhere in this dataset (`plan/07` §4: no fake urgency). Gates: `lint`, `typecheck`, `test-unit`, `check:no-db`. Tests: T-06.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `src/config/catalogue/*.data.ts`
- `src/config/currencies.ts`
- `plan/07`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#39](https://github.com/itsahmeds/flowers-overseas/pull/39); `/review` pass recorded in `TASKS.md`.
