# Imagery: generate, review, derive, commit, budget

The loop that turns a prompt into bytes a page serves, and the record of the one time it has been
run end to end (spec 006 §2.4, §2.5, §2.7; ADR-0014; TASK-080).

Read `content/imagery/style-guide.md` first — it is the locked style guide, the prompt template and
the §2.4 review checklist. This file is the *procedure*, not the rules.

---

## 1. The loop

| Step | Command or place | What it produces |
|---|---|---|
| 1. Author the prompt | `content/imagery/prompts/{SKU}.json` (or `homepage.json`) | one record per asset: prompt, negative prompt, generator, model, seed, parameters |
| 2. Generate | the generator named in the record, with that record's seed | a ≥ 2000 px original per asset |
| 3. Review | the founder, against `content/imagery/style-guide.md` §7's checklist | accept, or **regenerate from the same prompt with a new seed — never retouch** |
| 4. Land the original | `.local/imagery/originals/{assetId}.{png,jpg,…}` (git-ignored) **and** the founder's Drive folder "Flower Images" (the store of record) | an original this repository can read and will never commit |
| 5. Record it | `seed/data/media.json` | `reviewState: "approved"`, `reviewedBy`, `reviewedAt`, `originalSha256`, `derivativeC2pa` |
| 6. Derive | `pnpm media:variants` (or `--only <assetId>`) | `public/media/{assetId}/{width}.{fmt}` + `seed/data/media-variants.json` |
| 7. Write alt text | `seed/data/alt/{locale}.json`, **all four launch locales** | the only thing that lets `MediaAsset` render an `<img>` at all |
| 8. Gate | `pnpm seed:check` then `pnpm media:variants --check` | byte caps, provenance, alt coverage, manifest ↔ file ↔ checksum |
| 9. Snapshot | `pnpm seed:diff --write` | `seed/snapshot/**` back in step with the dataset |

**Step 7 is all-or-nothing across locales, deliberately.** The first alt row anywhere obliges every
launch locale to carry one for every product asset, because a locale with no alt text renders the
captioned placeholder instead of the photograph (spec 006 AC-18) — and a half-translated alt set is
how an English sentence ends up being read aloud on a Polish page (`plan/07` §8).

**A missing original is never an error.** `pnpm media:variants` on a clean clone derives nothing,
reports the assets it has no original for and exits 0, leaving the committed rows and files alone.
That is what makes the command safe to run in any worktree.

---

## 2. What ships in Phase 0, and why it is not the whole ladder

`seed/schema/variants.ts` holds two tables that decide it:

- **`PHASE0_SLOT_WIDTHS`** — which of spec 006 §13 Q5's seven widths each slot derives. The full
  15-file ladder cannot fit 31 assets inside the 6 MB committed-bytes cap, so each slot stops at the
  last width whose largest file (always the WebP fallback, on the busiest asset) is still inside
  `seed/budgets.ts`'s per-slot cap, and never above its own original's width.
- **`OG_JPEG_SLOTS`** — `["og"]`. No Phase-0 asset uses that slot, so no 1200 px JPEG is committed:
  31 of them would be ~3.4 MB of files nothing requests, and each would blow its asset's own cap.

| Slot | Widths shipped | Cap | Largest committed file |
|---|---|---|---|
| `hero` | 384, 640, 828 (4:3) · 1080, 1200 (16:9) | 90 000 B | 59 878 B |
| `occasionTile` | 384 | 18 000 B | 17 830 B |
| `productHero` | 384, 640, 828 | 90 000 B | 81 486 B |
| `productDetail` | 384 | 60 000 B | 38 398 B |

Widening a ladder is an edit to `PHASE0_SLOT_WIDTHS` plus `pnpm media:variants`; the manifest header
records the ladder, so `--check` fails if the two ever disagree. The whole arrangement disappears at
the R2 flip (TASK-083, spec 006 AC-27), which deletes `public/media/` and `staticVariantLoader` in
one PR.

**WebP `effort` is 6, not the libwebp default 4.** It is not a quality lever — the pinned quality is
still §13 Q5's 72 — it is how hard the encoder searches, and it buys the 3–6 % that keeps the two
busiest occasion tiles inside the 18 000 B cap. Changing it re-encodes everything, which is exactly
what the manifest-wide diff is for.

---

## 3. The review record (spec 006 AC-28, ADR-0014's named risk)

**Run of 2026-09-18.** 31 assets — 1 homepage band, 6 occasion tiles, 12 product heroes, 12 product
details — generated with **OpenAI ChatGPT**, model **`gpt-image 2.0`**, one seed per asset derived
from the asset id.

| Outcome | Count | Notes |
|---|---|---|
| Accepted by the founder against the §2.4 checklist | **31** | `reviewState: "approved"`, `reviewedBy: founder`, 2026-09-18 07:30Z / 07:45Z |
| Rejected and regenerated from the same prompt with a new seed | **not recorded** | the founder ran the generate/review loop outside this repository and did not record the rejected generations; the number is honestly unknown rather than zero, and ADR-0014's risk measure is therefore unmeasured for this run |
| Retouched | **0** | forbidden: a checklist failure is a regeneration, never a repair |

**Intake finding, recorded rather than papered over.** `plan/01` §6 asks for originals of ≥ 2000 px
on the long edge. The approved set is **1024–1672 px** (`home-hero` 1672 × 941, the occasion tiles
1254 × 1254, the product assets 1024–1122 × 1402–1536). No upscaled file is committed — the Phase-0
ladder stops inside each slot's own original — so the consequence is a shorter ladder, not soft
pixels. The next run should generate at ≥ 2000 px so the R2 ladder can be complete.

**Content credentials.** Every original carries a C2PA manifest (issuer `OpenAI Media Service API`,
`softwareAgent gpt-image 2.0`) and a SynthID watermark. `sharp` can carry XMP across a re-encode and
nothing else, and these manifests are JUMBF-boxed, so **the served AVIF and WebP carry no content
credential at all**. `pnpm media:variants` says so per asset as it runs, and the data says so
permanently: every `ai` row records `originalSha256` (the digest of the artefact that does carry the
manifest) and `derivativeC2pa: "stripped"`. Verification path: take the digest, fetch the original
from the Drive store of record or `.local/imagery/originals/`, check its manifest.

---

## 4. Budgets, and what fails first

| Budget | Number | Enforced by |
|---|---|---|
| Total committed under `public/media/` | ≤ 6 291 456 B — **3 012 746 B today (47.9 %)**, 118 files | `pnpm seed:check` family 9 |
| Any single variant | its slot's cap (table in §2) | `pnpm seed:check` family 9 |
| Image transfer per page at mobile width | ≤ 204 800 B | `tests/e2e/media-budgets.spec.ts` |
| Hero LCP candidate | ≤ 90 000 B | the same spec |
| LCP / CLS | < 2.0 s / < 0.05 | `pnpm lighthouse` |

The order matters and is the point: **the byte caps fail in `seed:check`, before the bytes are ever
served.** A 900 KB hero must fail a gate, not a Lighthouse run (spec 006 §6).

---

## 5. Replacing an image

- **A better generation of the same asset.** Replace the original, keep the asset id, re-run
  `pnpm media:variants --only <assetId>`, re-run the two gates and `pnpm seed:diff --write`. The URL
  does not change, so remember that `/media/*` is served `immutable` for a year: if the image is
  already public, mint a **new asset id** instead. A changed image is a new asset version, never a
  mutated URL.
- **A real photograph replacing an AI image.** Same steps, with `source: "photo"`, `credit` and
  `licence` instead of the generator fields — the schema requires the pair — and the honesty label
  stops rendering on pages whose displayed assets are all photographs, with no code change.
- **Withdrawing an image.** Set `reviewState` to `rejected` (or delete the row and its variants).
  The slot returns to the captioned placeholder with no `<img>`; no template changes.

## 6. Two standing notes

- **`/media/*` must stay crawlable.** When spec 007 lifts `Disallow: /`, `/media/*` — and later the
  R2 host — must not be blocked, or Google cannot fetch the images it evaluates for Core Web Vitals.
- **Image sitemaps are Phase 4** (`plan/02` §10). The data that makes one a query (asset ↔ entity ↔
  locale ↔ variant) exists now; when it arrives it must obey "nothing `noindex` ever appears in a
  sitemap".
