# Imagery style guide

The locked style guide for every picture on flowersoverseas.com, the prompt template each
generation run is written from, and the checklist a human applies before an image may be approved.

Owned by spec 006 (`specs/006-seed-catalogue-import-imagery-pipeline.md` §2.4), decided by
ADR-0014 and `plan/10` §3. The prompts themselves are `content/imagery/prompts/{sku}.json`; the
per-asset provenance is `seed/data/media.json`; the intake and review loop is
`content/imagery/README.md`.

## 1. The locked style guide

From `plan/10` §3, verbatim and unabridged:

> neutral warm-grey seamless background; soft north-light from the left; bouquet centred at 4:5
> with 8% margin; consistent paper wrap in kraft or white; no hands, no faces, no text; one hero
> angle + one detail + one "in a home" context shot per product; colour-accurate to the product's
> colour facet; stem count visually plausible for the tier; funeral pieces on a neutral stone
> surface; plants in a plain terracotta or white pot. Generation prompt template stored per product
> with seed so images can be regenerated consistently; outputs reviewed for anatomy errors
> (impossible stems, melted petals) before import; AVIF/WebP derivatives produced at import.

It is called locked because it is not a preference. Every clause is doing work:

| Clause                                | Why it is not negotiable                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral warm-grey seamless background | 84 products photographed over months must sit in one grid without looking like eight shops. The background is what makes them one catalogue.                                          |
| Soft north light from the left        | One light direction across the set; a mixed set reads as stock, and stock reads as untrustworthy.                                                                                     |
| 4:5 with an 8% margin                 | The margin is what lets `pnpm media:variants` crop to 1:1 and 3:2 without cutting a stem. A tight crop cannot be re-cropped.                                                          |
| Kraft or white wrap                   | Two options, so the set is consistent without being identical.                                                                                                                        |
| **No hands, no faces, no text**       | A face or a hand is personal data and needs a release (`plan/07` §1.2, spec 006 §8); text in an image is information available only visually and fails WCAG 1.4.5. Both are absolute. |
| Hero + detail + in-home context       | The three shots a buyer actually wants: what it is, what it is made of, what it will look like where it lands.                                                                        |
| Colour-accurate to the colour facet   | The colour facet is a filter and a promise. An orange bouquet returned under `red` is a misleading main characteristic (CRD Art. 6).                                                  |
| Plausible stem count for the tier     | The tier is the price. Thirty roses pictured against a twelve-stem tier is the clearest possible misleading action.                                                                   |
| Funeral pieces on neutral stone       | Restraint is the product. A funeral wreath on a warm styled surface is the wrong register.                                                                                            |
| Plants in plain terracotta or white   | The pot is not the product, and a decorative pot we do not ship is a promise we cannot keep.                                                                                          |

Phase 0 commits the **hero and the detail only** (spec 006 §13 Q3: 12 products × 2 assets plus the
homepage slots). The in-home context shot stays in this guide, unprompted and unbudgeted, until R2
exists — leaving it out of the guide would lose the decision; generating it now would exceed the
6 MB the repository accepts.

## 2. Where a picture may come from

Three sources, and provenance records which one on every asset
(`MediaAssetManifestSchema.source`, spec 006 AC-8). Nothing else is permitted.

| `source`  | What it is                                                           | Required provenance                                          | Where it may be used                                                       |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `ai`      | Generated under this guide from a committed prompt record (ADR-0014) | `generator`, `generatorModel`, `promptHash`, `generatorSeed` | Anywhere, and always with the honesty label                                |
| `photo`   | A photograph we own, or free-licence stock of the class §3 permits   | `credit` **and** `licence`                                   | Anywhere; the hero band and brand imagery are where it is worth the effort |
| `partner` | A florist's own photograph, uploaded with their consent              | spec 011's, not this guide's                                 | Not in Phase 0                                                             |

**Paid stock is never used.** ADR-0014 rejected it on cost, consistency and the fact that
competitors licence the same frames; spec 006 §13 Q1 restates the ban. A licence receipt is not a
defence against publishing the same picture as three rival relay sites.

**A delivery photograph is not one of these.** `depicts: "delivery"` is rejected outright by the
manifest schema in Phase 0 (spec 006 AC-8). A real delivery photograph carries the recipient's
consent and is spec 018/027's data; an AI-generated one presented as a delivery is a misleading
commercial practice under the UCPD. The homepage's delivery band therefore renders its placeholder
until a consented photograph exists, and a placeholder is the honest state, not a gap.

## 3. Free-licence stock: the only stock class permitted

Spec 006 §13 Q1 permits one narrow class for the hero band and brand imagery, where AI output reads
as synthetic:

- **CC0 1.0**, **public domain / PDM**, or the **Unsplash Licence** — and nothing else. No paid
  library, no subscription, no "free tier" of a commercial library, no editorial-only licence, no
  "free with attribution" licence whose terms forbid commercial use.
- **`licence` and `credit` are both mandatory and the schema enforces it.** `licence` carries the
  identifier (`CC0-1.0`, `Unsplash-License`, `PDM-1.0`); `credit` carries the photographer's
  published name and the source. A `photo` asset missing either does not parse, so it can never
  reach a page — this is the mechanism, not the intention.
- **The licence text is filed, not linked.** A copy of the licence as it stood on the day we took
  the file goes in `docs/compliance/` alongside the generator terms. A URL that later changes is
  not evidence.
- **The style guide still applies.** A free-licence photograph that carries a face, a hand, a
  shopfront, visible text, or a bouquet that misrepresents a colour facet is rejected for the same
  reasons an AI generation would be. Free is not a reason to lower the bar.
- **No fabricated trust, whatever the licence.** No stock photograph of a "florist", a shop, a
  smiling recipient or a doorstep handover enters the site. We do not illustrate a claim we cannot
  make (`plan/07` §7; spec 004 AC-15).
- **A real photograph replaces stock the moment we have one**, and that is a data edit: change
  `source`, `credit` and `licence` on the asset row, drop in the new original, re-run
  `pnpm media:variants`. No component changes.

## 4. The generator and its terms

ADR-0014 accepted AI generation **conditional on** checking the generator's commercial-use terms,
and that condition is a founder action, not a code change:
`docs/compliance/imagery-generator-terms.md` records what must be filed and is **pending** until
it is. Until it is filed, `seed/data/media.json` and every prompt record carry
`generator: "to-be-confirmed"` and `generatorModel: "to-be-confirmed"` — a value the schema accepts
and a test pins, so the placeholder is visible rather than plausible.

Confirming the generator is three edits: the two fields in every prompt record, the filed terms,
and a re-run of the hash (§5) — which re-hashes every asset and shows up as a whole-manifest diff.
That diff is intended: the images in the repository were made by a named model under named terms,
and changing either is not a silent event.

## 5. The prompt record and its hash

One file per product, `content/imagery/prompts/{SKU}.json`, plus `homepage.json` for the slots that
belong to no product. Each record fully specifies one generation run — asset id, product, slot,
role, aspect ratio, generator, model, seed, positive prompt, negative prompt, parameters — so the
image can be regenerated years later by someone who was not there.

`seed/data/media.json` carries `promptHash` per asset: the SHA-256 of the **canonicalised** prompt
record, computed by `promptHash()` in `seed/schema/prompts.ts`. Canonicalisation fixes the field
order, collapses insignificant whitespace, normalises to NFC and sorts the parameter bag, so
reflowing the JSON file does not invalidate provenance while changing a word, the model or the seed
does. `tests/unit/imagery-prompts.test.ts` recomputes every hash, so a prompt edited without
updating the manifest fails CI with the asset named.

The seed is **declared, not discovered**: `promptSeed(assetId)` derives it from the asset id, so it
is stable, unique per asset, and reproducible by anyone reading the id. A generation run that uses
a different seed is not the run the record describes, and the record is what we would show a
regulator.

## 6. The prompt template

Substitute the bracketed parts from the product's own facets in
`src/config/catalogue/products.data.ts` — never from a description, and never from memory.

**Hero (4:5, `slot: "productHero"`)**

> A hand-tied [style] bouquet of [default tier's stem count] [colour facet] [primary flower] with
> [greenery], wrapped in [kraft|white] paper and tied with plain twine, centred at 4:5 with an 8%
> margin on every side, on a neutral warm-grey seamless background, soft north light from the left,
> colour-accurate [colour facet] heads, natural stem structure, no hands, no faces, no text.

**Detail (4:5, `slot: "productDetail"`)**

> A close detail of the same [product]: [two or three named parts] filling the frame at 4:5, [the
> wrap's edge visible], on a neutral warm-grey seamless background, soft north light from the left,
> [named texture] sharp, colour-accurate [colour facet], no hands, no faces, no text.

**In-home context (3:2, `slot: "context"`, not generated in Phase 0)**

> The same [product] standing in a plain glass vase on a plain table in a domestic room, seen from
> the front at 3:2, daylight from the left, no hands, no faces, no people, no signage, no text.

**Per product type, replacing the wrap clause**

| Type          | Clause                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| `arrangement` | "arranged low in a plain kraft gift box / a plain woven basket of [size tier]"          |
| `plant`       | "in a plain white ceramic pot / a plain terracotta pot"                                 |
| `funeral`     | "standing on a neutral stone surface … restrained and dignified … no ribbon lettering"  |
| `gift_set`    | "beside a plain closed box of chocolates with an unmarked lid … no branding on the box" |

**Negative prompt (identical on every record, because every rejection reason belongs to every
asset)**

> hands, fingers, arms, faces, people, shop interior, shopfront, premises, signage, text, lettering,
> numbers, watermark, logo, price tag, greetings card message, fused or impossible stems, extra
> petals, melted or waxy petals, plastic or silk flowers, wilted flowers, wrong flower species,
> implausible stem count, harsh flash, heavy vignette, cluttered background, props, tiled or
> repeated pattern.

It states the review checklist to the generator as well as to the reviewer: a rejection costs a
regeneration, and preventing one is cheaper than counting one.

**Parameters.** Generator-neutral only, until the generator is confirmed: `aspectRatio`,
`colourProfile: "sRGB"`, `minLongEdgePx: 2000` (originals are ≥ 2000 px, `plan/01` §6) and
`styleReference`. Sampler, steps and guidance are added when the founder names the generator; doing
so re-hashes the affected assets, which is the intended signal.

**Never in a prompt**: a person, a body part, a premises, a brand or competitor name, a real
person's name, a place we do not deliver to, a price, a rating, a review, a word implying a
photograph of a real delivery, or any text to be rendered inside the image.

## 7. The human review checklist

`plan/10` §3 and spec 006 §2.4. The founder applies it to every generated asset before its
`reviewState` may become `approved` (spec 006 §13 Q9). **One failed item rejects the asset** — it is
regenerated from the same prompt with a new seed, never retouched, because a retouched image no
longer matches the record that claims to describe it.

| #   | Reject if                                                                                                                        | Why                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | **Impossible stems** — a stem that starts nowhere, forks into two heads, passes through another, or bends in a way a stem cannot | The signature AI failure, and the one a florist spots in a second (`plan/10` §7)            |
| 2   | **Melted petals** — waxy, fused, smeared or plastic-looking petals; a head that dissolves into the background                    | Same                                                                                        |
| 3   | **Wrong flower** — not the product's primary flower, or a species that does not exist                                            | The primary flower is a facet, a filter and a promise                                       |
| 4   | **Implausible count** — visibly more or fewer stems than the tier sells                                                          | The tier is the price; the picture must not oversell it                                     |
| 5   | **Visible text** — any lettering, number, watermark, logo, price or card message anywhere in the frame                           | WCAG 1.4.5; and a rendered price that is not the charged price                              |
| 6   | **Any person or premises** — a face, a hand, an arm, a silhouette, a shop interior, a shopfront or signage                       | Personal data without a release; and an identifiable shop we do not have permission to show |

Also reject, from §1's own clauses: a background that is not the neutral warm-grey seamless one, a
light direction that is not from the left, a margin visibly tighter than 8%, a colour that
contradicts the colour facet, a funeral piece not on neutral stone, a plant in a decorative pot.

**Record the counts.** Every batch's generated / accepted / rejected numbers and the reason per
rejection go in `docs/runbooks/imagery.md` and in the PR that commits the bytes (spec 006 AC-28,
§11). That count is the honest measure of ADR-0014's main risk and the only evidence that tells the
founder whether a small real shoot is needed.

**Approval is data.** `reviewState: "approved"` requires `reviewedBy` and `reviewedAt`, and the
schema rejects an approval without them. Every asset in this repository is `pending` until the
founder signs off; an unapproved asset never renders — the page shows the placeholder instead
(spec 006 AC-18).

## 8. What appears on the page

- **The honesty label.** Any page displaying a `source: "ai"` asset renders "Example arrangement ·
  our florist hand-makes each one" as server-rendered, crawlable text, from a message key, with no
  prop that can suppress it (ADR-0014, spec 006 AC-17). It is the condition ADR-0014 was accepted
  under. The pronoun is **our**, as spec 008 §14 A2 settled and `media.provenance.aiExample` ships:
  the florist is ours, working to our promise, and the second person would hand the buyer a
  relationship they do not have (TASK-080, closing the `/review 49` carry-forward). The label is
  written once, in the message catalogue; this file quotes it and must never drift from it.
- **Alt text comes from data**, per locale, never generated at render, and never the product name.
  An asset with no alt for the resolved locale renders the placeholder and no `<img>` (spec 006
  AC-18).
- **Watermarks.** The demo environment's sample mechanism stays specified and no watermarked asset
  ships in Phase 0 (spec 006 §13 Q12); when one does, the mark is baked into the bytes, never a CSS
  overlay that a screenshot removes.
