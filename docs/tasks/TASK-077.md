# TASK-077 — Imagery intake, style guide and provenance: `content/imagery/style-guide.md` (the locked `plan/10` §3 style guide verbatim, the prompt template and the human review checklist), `content/imagery/prompts/{sku}.json` for the demo set, the git-ignored `.local/imagery/originals/` intake directory, and `media.json` wired to `MediaAssetManifestSchema`'s provenance refinements

Row: `TASKS.md` → TASK-077. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-077-imagery-style-guide-provenance`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. Style guide verbatim from `plan/10` §3: neutral warm-grey seamless background, soft north light from the left, 4:5 with 8% margin, kraft or white wrap, **no hands, no faces, no text**, one hero + one detail + one in-home context shot per product, colour-accurate to the colour facet, plausible stem count for the tier, funeral pieces on neutral stone, plants in plain terracotta or white. Review checklist: impossible stems, melted petals, wrong flower, implausible count, visible text, any person or premises. **AC-8 makes provenance data, not a comment**: every asset carries `source` (`ai | photo | partner`) and `depicts` (`product | brand | context | delivery`); `ai` assets carry generator, model, `prompt_hash` (SHA-256 of the canonicalised prompt record) and seed; `photo` assets carry `credit` and `licence`; `approved` assets carry `reviewed_by` and `reviewed_at`; and a `depicts: "delivery"` asset is **rejected outright in Phase 0** — real delivery photos are specs 018/027 and carry consent (`plan/07` §1.2). **No original is ever committed** (§13 Q6): originals live in the founder's own store of record plus the git-ignored `.local/imagery/originals/`, and move to R2 `originals/{assetId}` in TASK-082. **Founder actions gating this task (row note, not a task):** confirm the generator and **file its commercial-use terms in `docs/compliance/`** — that is ADR-0014's own standing condition — and note that `licence` + `credit` are mandatory for the free-licence stock class (CC0 / public-domain / Unsplash-licence) that §13 Q1 permits for the hero and delivery band. The two lawyer questions of §13 Q8 (label wording under DE/PL transposition, EU AI Act Art. 50 reach) go on the October legal-drafts list and **do not block** — no money changes hands during the demo phase; the reading recorded in §8 is that Art. 50 does not reach a labelled, non-deceptive product illustration, and provenance stays in data so a wrong reading is a configuration change. Gates: `lint`, `typecheck`, `test-unit`, `seed-check`, `check:no-db`. Tests: T-08.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `plan/10`
- `plan/07`
- `docs/compliance/`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#42](https://github.com/itsahmeds/flowers-overseas/pull/42); `/review` pass recorded in `TASKS.md`.
