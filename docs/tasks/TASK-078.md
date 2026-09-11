# TASK-078 — `pnpm media:variants`: the deterministic `sharp` ladder (AVIF q50/effort 4 + WebP q72 at 384/640/828/1080/1200/1600/1920 plus one 1200 px JPEG per asset for OG/email), unconditional EXIF/GPS stripping with the colour profile kept, the declared aspect ratios, manifest writing to `seed/data/media-variants.json`, and the `--check` CI mode

Row: `TASKS.md` → TASK-078. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-078-media-variants-cli`. Spec 006 §13's 2026-09-09 resolution note is binding: Q1 AI-generated under the locked style guide or free-licence stock (CC0 / public-domain / Unsplash-licence class, never paid stock); Q2 names stay English, descriptors localise; Q3 12 products x 2 assets plus the homepage slots; Q4 <=6 MB derived bytes committed until R2; Q5 AVIF+WebP at seven widths plus one 1200 px JPEG per asset for OG/email; Q6 originals in the founder's store plus a git-ignored `.local/imagery/originals/`; Q7 `fo-media` / `fo-media-preview` / `fo-backups`, `media.flowersoverseas.com`; Q8 both lawyer questions on the October legal-drafts list, label ships now; Q9 founder signs off against the §2.4 checklist; Q10 spec 002 task 10 reads `seed/data/`; Q11 the seven media columns fold into `0003` (spec 002 §14 A1); Q12 watermark mechanism kept, no watermarked asset in Phase 0. Aspect ratios per §13 Q5: 4:5 product, 1:1 occasion tile, 16:9 desktop / 4:3 mobile hero band, 3:2 context. **Determinism is the contract** (AC-13): the `sharp` version and every encoder option are **pinned and recorded in the manifest header**, two runs produce byte-identical files and no manifest diff, and changing one option is a manifest-wide diff rather than a silent re-encode — which is also what lets TASK-082's `media.derive_variants` worker prove it produces the same checksums as this CLI (AC-25). **Generation never runs in CI** (no originals there, no network, no generator); CI runs `--check` only, verifying every manifest entry has a file, every file has an entry and every checksum matches, and failing on a deleted file, an added file or a one-byte edit (AC-14). Metadata stripping is unconditional and asserted by reading the output's metadata (`plan/01` §6); any C2PA marking the generator embeds is preserved (§8). `sharp` is a **devDependency used by a local CLI, never at request time**, so its CVE surface is outside the deployed runtime — record the pinned version and keep it inside `pnpm audit`'s scope. Gates: `lint`, `typecheck`, `test-unit`, `audit`, `seed-check`, `check:no-db`. Tests: T-12 (three fixture originals: portrait, square, landscape), T-13, T-14.

## Read

- `specs/006-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `seed/data/`
- `plan/01`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#44](https://github.com/itsahmeds/flowers-overseas/pull/44); `/review` pass recorded in `TASKS.md`.
