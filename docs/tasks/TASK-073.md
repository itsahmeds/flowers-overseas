# TASK-073 — Seed copy for `en` and `en-gb`: `copy/en/*.json` + `copy/en-gb/*.json` — 84 product descriptions (60–90 words, contents/size/who-it-suits/substitution, each ending with the local-florist sentence), names and slugs, SEO title/description, category and occasion intros; the `catalogue.*` and `media.*` message keys; and `pnpm i18n:draft` extended to the dataset and run for `de`/`pl` flagged unreviewed

Row: `TASKS.md` → TASK-073. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-073-seed-copy-en`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. **Names stay English, descriptors localise** (§13 Q2, `plan/10` §2.2): `Amber Hour` is `Amber Hour` in all four locales while "hand-tied rose bouquet" becomes "Rosenstrauß, handgebunden" / "bukiet róż wiązany ręcznie" — one brandable entity per product, stable slugs, and a genuine hreflang translation set. Our own text only, no competitor wording; no superlative that cannot be backed; **no two products share a description** (the thin-content guard of §6, enforced by TASK-075). `en` is the source of truth (`plan/03` §6 step 1) and `en-gb` ships **only** as differing overrides. `de`/`pl` copy is either absent or written by the deterministic, network-free `DraftProvider` with `translationStatus: "machine"`, `reviewed: false` and a `sourceHash` — **never present, unreviewed and unflagged** (AC-5). The correct consequence, stated so nobody "fixes" it: German and Polish PDPs are non-indexable until a native reviewer approves them (`plan/03` §6 gate 4, `plan/02` §12, spec 002 §6); substantive `de`/`pl` translation is founder + native-reviewer work (`plan/13` B12), not a task. Corridor guides and legal copy are **never** machine-drafted and are out of scope (§3). New keys: `media.provenance.aiExample`, `media.placeholder.{hero,occasion,product,delivery}` (the "Photography to supply · …" strings spec 004 renders as design copy today), the demo watermark label, `a11y.media.*` (gallery landmark, "image N of M"), plus the localised descriptor patterns, tier labels resolved from `product_tier.label_key`, and the local-florist sentence as **one** key so a rewording is one catalogue edit in four locales rather than 84 description edits. No literal user-facing string in any component (`fo/no-literal-strings`). Gates: `lint`, `typecheck`, `test-unit`, `i18n-check`, `check:no-db`. Tests: T-05.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `plan/10`
- `plan/03`
- `plan/02`
- `plan/13`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#41](https://github.com/itsahmeds/flowers-overseas/pull/41); `/review` pass recorded in `TASKS.md`.
