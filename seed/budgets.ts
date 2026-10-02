/**
 * The byte budgets of spec 006 §2.5 — rule family 9 of §2.3 — in one place (TASK-075; split
 * between the repository and the bucket by TASK-138, see below).
 *
 * `pnpm seed:check` is the gate that makes "a 900 KB hero fails a gate rather than a Lighthouse
 * run" true (spec 006 §6 "CWV budget impact"): the caps have to be readable by a script that runs
 * before the bytes are ever served, so they are data here rather than a Lighthouse assertion or a
 * comment in a design file.
 *
 * **Why this module and not `src/modules/ui/media/slots.ts`.** That module (TASK-079) owns the
 * *render* facts of a slot — its aspect ratio and its `sizes` string — and it does not exist yet;
 * this gate does. Splitting the byte cap out means the number that fails CI is the number the
 * loader will import when it lands, rather than a second copy of it. `mediaSlots` in
 * `seed/schema/media.ts` is the closed slot list both sides key off, and the exhaustiveness of
 * this record is a type error rather than a runtime surprise.
 *
 * **Two trees since TASK-138, and which cap governs which.** Every variant is derived into the
 * git-ignored `.local/media/` and uploaded to `flowersoverseas-media`. Only the slots
 * `SITE_ORIGIN_MEDIA_SLOTS` names — `hero`, the home page's LCP image (founder, 2026-10-03,
 * option (a)) — are **also committed** under `public/media/` and served from the site's own
 * origin. So:
 *
 *  - `COMMITTED_MEDIA_BYTE_CAP` (6 MB, spec 006 §13 Q4) still caps the bytes committed to the
 *    repository — which is now one asset's ladder, not the catalogue. It stopped governing the
 *    catalogue, which is what lets all 84 products be photographed; it did not stop existing.
 *  - The per-slot caps below govern **every** variant, wherever it is served: `pnpm seed:check`
 *    reads them against the manifest rows (`seed/data/media-variants.json`, committed, reviewed in
 *    a diff, carrying each variant's byte count and checksum), so the gate fires before any byte
 *    is served and needs no bytes present to fire. Three other guards stand behind it:
 *    `pnpm media:variants --check` ties the rows to the committed files on every runner and to the
 *    derived files wherever that tree exists, `scripts/media-upload.ts` refuses to upload a file
 *    that disagrees with its row or exceeds its slot's cap, and `tests/e2e/media-budgets.spec.ts`
 *    measures image transfer per page in a browser whatever origin serves it.
 *
 * Provenance of each number, because one of them is the spec's and the rest are an
 * `[agent-inferred]` split of the same page budget:
 *
 *  - **hero 90 000 B** — spec 006 §2.5: "the hero LCP candidate ≤ 90 000 B at the mobile width".
 *    `productHero` carries the same cap because it is the same thing on a PDP: `plan/01` §6 makes
 *    the product image the LCP element there.
 *  - **grid tile 18 000 B** — spec 006 §2.5: "each grid tile ≤ 18 000 B". `occasionTile` is that
 *    tile; `productThumb` is smaller again (96 px, `plan/01` §6) and is capped below it.
 *  - `productDetail`, `context` and `og` are `[agent-inferred]`: the spec's page budget is
 *    ≤ 204 800 B per page (spec 004 AC-24), a gallery image below the fold is not the LCP
 *    candidate but is a full-width photograph when opened, and the OG/email JPEG of §13 Q5 is one
 *    1200 px baseline file that never loads in a page at all. They are recorded as decisions in
 *    TASK-075's PR rather than derived silently, and the day a real measurement disagrees, this
 *    is the one file to edit.
 *
 * The caps are per **variant file**, at the widest width the slot ships: a cap per (slot, width)
 * would be a table nobody maintains, and the widest file is the one that can blow the budget.
 */
import { SITE_ORIGIN_MEDIA_SLOTS } from "../src/lib/media-origin.ts";
import { type MediaSlot, mediaSlots } from "./schema/media.ts";

/**
 * Total committed bytes under `public/media/` (spec 006 §13 Q4, §2.5): 6 MB as 6 × 1024 × 1024,
 * which is what `du -h` reports as `6.0M`. Since TASK-138 only `COMMITTED_MEDIA_SLOTS` are
 * committed, so this measures the site-origin ladder and nothing the bucket serves.
 */
export const COMMITTED_MEDIA_BYTE_CAP = 6 * 1024 * 1024;

/** The directory the committed (site-origin) variants live in, relative to the repository root. */
export const COMMITTED_MEDIA_DIR = "public/media";

/**
 * The slots whose variants are committed under `COMMITTED_MEDIA_DIR` — the same list the loader
 * routes to the site origin, read from the same constant, so a slot is committed exactly when a
 * page asks this origin for it. The annotation is the check that every entry is a real slot.
 */
export const COMMITTED_MEDIA_SLOTS: readonly MediaSlot[] =
  SITE_ORIGIN_MEDIA_SLOTS;

/**
 * Where `pnpm media:variants` writes the derived ladder, relative to the repository root.
 *
 * Git-ignored, like the originals beside it (`.local/imagery/originals`): the bytes are an
 * artefact of a deterministic derivation from an original the repository never holds, and their
 * home is the bucket (and, for `COMMITTED_MEDIA_SLOTS`, `COMMITTED_MEDIA_DIR` as well). A clean
 * clone and every CI runner therefore have **no** derived tree at all, which is why every gate
 * over these bytes is written to check the manifest first and the derived files only where they
 * exist.
 */
export const DERIVED_MEDIA_DIR = ".local/media";

/** The per-slot cap on a single variant file, in bytes (see the header for each number). */
export const SLOT_BYTE_CAPS: Readonly<Record<MediaSlot, number>> = {
  hero: 90_000,
  productHero: 90_000,
  productDetail: 60_000,
  occasionTile: 18_000,
  productThumb: 8_000,
  context: 60_000,
  og: 120_000,
};

/** Every slot has a cap: a slot added without one would silently have no budget. */
export const SLOTS_WITHOUT_A_CAP: readonly MediaSlot[] = mediaSlots.filter(
  (slot) => SLOT_BYTE_CAPS[slot] === undefined,
);
