/**
 * Named media slots (spec 004 §2 "Image conventions", `plan/01` §6, ADR-0014, ADR-0015;
 * TASK-052).
 *
 * "`sizes` per named slot (hero 100vw, grid 50vw/33vw/25vw, thumb 96 px), fixed aspect-ratio
 * boxes, `loading="lazy"` + `decoding="async"` below the fold, exactly one `priority` candidate
 * per page" (§2). Every one of those decisions is made **here, once, per slot** rather than at a
 * call site, which is the whole point of the wrapper: a slot is a place in the design (the hero
 * band, a card in the 2-up/4-up grid, a thumbnail), and its `sizes` string is a property of the
 * layout that produced it, not of the image that happens to land in it.
 *
 * `aboveFold` is the eligibility flag, not the decision: a slot that is never above the fold can
 * never be `priority`, and `Media` refuses the combination. The page still chooses which single
 * eligible slot is the one candidate — `plan/01` §6's "exactly one `priority` per page" is a page
 * property and cannot be decided in this file.
 *
 * No slot carries a `src`, a `width` or an `alt`: Phase 0 has no imagery at all (spec 006
 * generates it, ADR-0014), so `Media` renders the token-gradient placeholder and **no `<img>`**
 * (`plan/10` §3's honesty rule). The `sizes` strings are shipped now so that landing imagery is a
 * change of one branch inside `./Media.tsx` and not a survey of every call site.
 */

/** The four places this design puts a photograph. Named, so a call site cannot invent a fifth. */
export const MEDIA_SLOTS = ["hero", "grid", "tile", "thumb"] as const;
export type MediaSlot = (typeof MEDIA_SLOTS)[number];

export interface MediaSlotSpec {
  /**
   * The `sizes` attribute for this slot, describing the **layout**, mobile-first: what fraction
   * of the viewport the box occupies at each breakpoint. Read straight from the artboards
   * (`docs/design/homepage-v1/*.dc.html`) rather than guessed.
   */
  readonly sizes: string;
  /** The reserved aspect ratio, as the `Photo` ratio name so the two cannot drift. */
  readonly ratio: "hero" | "landscape" | "portrait" | "square";
  /** May a page nominate this slot as its single `priority` image? */
  readonly aboveFold: boolean;
}

/**
 * The slot table. `grid` is the card grid of §2 (2-up mobile → 4-up desktop, so 50vw → 25vw);
 * `tile` is the occasion grid (2-up mobile → 3-up desktop); `thumb` is the fixed 96 px square a
 * basket line or an order row uses.
 */
export const MEDIA_SLOT_SPECS: Readonly<Record<MediaSlot, MediaSlotSpec>> = {
  hero: { sizes: "100vw", ratio: "hero", aboveFold: true },
  grid: {
    sizes: "(min-width: 768px) 25vw, 50vw",
    ratio: "portrait",
    aboveFold: true,
  },
  tile: {
    sizes: "(min-width: 768px) 33vw, 50vw",
    ratio: "square",
    aboveFold: false,
  },
  thumb: { sizes: "96px", ratio: "square", aboveFold: false },
};

/** The spec for a slot. Total over `MediaSlot`, so there is no failure mode to handle. */
export function mediaSlot(slot: MediaSlot): MediaSlotSpec {
  return MEDIA_SLOT_SPECS[slot];
}

/* -------------------------------------------------------------------------- */
/* The seed ↔ UI slot mapping (spec 006 §2.5; `/review 42`).                  */
/* -------------------------------------------------------------------------- */

/**
 * **Two slot vocabularies exist, and this is the one place they meet** (`/review 42`).
 *
 * `seed/schema/media.ts`'s `mediaSlots` (`hero`, `occasionTile`, `productHero`, `productDetail`,
 * `productThumb`, `context`, `og`) names *what an asset was cropped for* — it is what
 * `pnpm media:variants` reads to pick an aspect ratio (`seed/data/media-variants.json`'s
 * `pipeline.aspects`) and what `seed:check` reads to apply a per-slot byte cap. `MEDIA_SLOTS`
 * above names *the box the design puts a photograph in* — it is what fixes the `sizes` string and
 * the reserved ratio. They are different questions with overlapping words, so neither side is
 * renamed: the manifest keeps the crop vocabulary, the UI keeps the layout vocabulary, and the
 * translation is this table, pinned by `tests/unit/ui-media-manifest.test.ts`.
 *
 * Two consequences worth reading before adding a slot:
 *
 *  - **`og` maps to nothing.** The 1200 px JPEG of spec 006 §13 Q5 is for Open Graph, email and
 *    social; it is never a box on a page, so mapping it to one would put a social crop into a
 *    layout. `null` is the honest answer and callers must handle it — spec 009's metadata builder
 *    is its consumer.
 *  - **The reserved box and the asset's crop are allowed to differ, and the box wins.** A
 *    `productHero` asset is cropped 4:5 (§13 Q5) and lands in the `grid` box, whose reserved
 *    ratio is 3:4; the difference is cropped by `object-fit: cover` inside a box whose height was
 *    reserved before paint, so the CLS delta of landing imagery stays 0 (spec 004 §2's promise).
 *    The PDP's own main-image box — square on
 *    `docs/design/wireframes/product-{desktop,mobile}.dc.html` — is **not** in `MEDIA_SLOTS` yet;
 *    spec 009 owns that page and adds it with the template that needs it.
 */
export const SEED_SLOT_TO_UI_SLOT = {
  hero: "hero",
  occasionTile: "tile",
  productHero: "grid",
  productDetail: "grid",
  productThumb: "thumb",
  // The in-home context shot is cropped 3:2, which is the `hero` box's reserved ratio exactly.
  context: "hero",
  og: null,
} as const satisfies Readonly<Record<string, MediaSlot | null>>;

/** A slot name as `seed/data/media.json` writes it (`seed/schema/media.ts`'s `mediaSlots`). */
export type SeedMediaSlot = keyof typeof SEED_SLOT_TO_UI_SLOT;

/**
 * The box a seed slot renders in, or `undefined` when the slot is not a page box at all (`og`).
 * Total over the seed vocabulary, so a new crop slot is a type error here rather than a silently
 * unrendered asset.
 */
export function uiSlotForSeedSlot(slot: SeedMediaSlot): MediaSlot | undefined {
  return SEED_SLOT_TO_UI_SLOT[slot] ?? undefined;
}
