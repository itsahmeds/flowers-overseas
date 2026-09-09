# `content/imagery/` — intake, prompts and provenance

The pictures themselves are not here, and that is the point.

| What | Where | Committed? |
| --- | --- | --- |
| The style guide, the prompt template, the review checklist | `style-guide.md` | yes |
| One prompt record per asset | `prompts/{SKU}.json`, `prompts/homepage.json` | yes |
| Per-asset provenance (source, generator, hash, seed, review state) | `seed/data/media.json` | yes |
| **Originals** (≥ 2000 px, straight out of the generator or the camera) | `.local/imagery/originals/{assetId}.{ext}` and the founder's own store | **never** |
| Derived variants (AVIF/WebP ladder + one JPEG) | `public/media/{assetId}/` from TASK-078/080 | yes, ≤ 6 MB, until R2 |

## Intake: never commit an original

`.local/` is git-ignored in the repository root `.gitignore`, and originals live there for the
generation-and-review loop only. Two reasons, both hard (spec 006 §2.4, §13 Q6):

1. **Repository weight.** Thirty-one originals at ≥ 2000 px is tens of megabytes of history that no
   later `git gc` reclaims. The repository commits derived bytes, capped at 6 MB, and deletes even
   those in the R2-flip task.
2. **There is already a store of record.** The founder's own store (Drive or local) holds the
   originals, and TASK-082 moves them to R2 under `originals/{assetId}`. A third copy in git would
   be the one nobody re-syncs.

If an original is ever staged by accident, it is a force-push, not a follow-up commit: a binary in
git history is permanent.

## The loop

```
1. read style-guide.md §1 and §6
2. edit or add the record in prompts/{SKU}.json   (assetId, slot, role, aspect, prompt, seed)
3. generate with exactly the recorded seed and model
4. save the original as .local/imagery/originals/{assetId}.{ext}   (never staged)
5. review against style-guide.md §7 — one failed item rejects the asset
6. rejected? regenerate from the same prompt with a new seed; never retouch
7. accepted? set reviewState/reviewedBy/reviewedAt in seed/data/media.json (founder only)
8. pnpm media:variants --only <assetId>   (the deterministic ladder, EXIF/GPS stripped)
9. pnpm seed:check            (provenance, budgets, no delivery asset, no unapproved approval)
```

Step 8 derives `public/media/{assetId}/{width}.{fmt}` — AVIF + WebP at the seven widths of the
slot's declared aspect ratio plus one 1200 px JPEG for OG and email — and rewrites
`seed/data/media-variants.json` with a width, height, byte count and SHA-256 per file. Without
`--only` it runs over every asset whose original is present and reports the ones it has none for;
an asset with no original keeps whatever rows and files it already had, so running it on a clone
that holds the committed bytes but no originals changes nothing. `pnpm media:variants --check` is
the CI form and verifies manifest ↔ files ↔ checksums; generation never runs in CI, because the
originals are not there.

Step 9 is TASK-075's script. Until it lands, the loop stops at step 8 and nothing renders: every
asset in `seed/data/media.json` is `pending`, and an unapproved asset shows the placeholder rather
than an image (spec 006 AC-18).

The operational version of this loop — with the reject counts, the budget check, and what to do
after R2 exists — is `docs/runbooks/imagery.md` (TASK-081).

## The demo set (spec 006 §13 Q3)

31 assets: **12 products × 2** (hero + detail), one product per named archetype of `plan/10` §2.2,
plus **7 homepage slots** (the full-bleed hero and the six occasion tiles).

- The four "most sent" cards reuse the demo products' hero assets, so they need no asset of their
  own.
- The delivery-photo band has **no asset at all** and renders its placeholder: `depicts: "delivery"`
  is rejected outright in Phase 0 (spec 006 AC-8) and we may not fake a delivery.
- The other 72 products render the placeholder with its caption and no `<img>` until R2 exists
  (`plan/10` §3's honesty rule).

## What is not decided here

The variant ladder, the aspect-ratio crops and the determinism contract are
`seed/media-variants.ts` and `seed/schema/variants.ts` (TASK-078, landed); the loader, `Photo`, the preload and the honesty-label component are
`src/modules/ui/media/` (TASK-079); the committed bytes and the budgets are TASK-080; R2 is
TASK-082.
