/**
 * The committed-imagery byte budgets of spec 006 §2.5 — rule family 9 of §2.3 — in one place
 * (TASK-075).
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
 * Provenance of each number, because two of them are the spec's and the rest are an
 * `[agent-inferred]` split of the same page budget:
 *
 *  - **6 MB total** — spec 006 §13 Q4, the founder-accepted cap on derived bytes committed to the
 *    repository until R2 exists (deleted in the R2-flip task, AC-27). Spec 006 §2.5 repeats it.
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
import { type MediaSlot, mediaSlots } from "./schema/media.ts";

/**
 * Total committed bytes under `public/media/`, the whole derived set (spec 006 §13 Q4, §2.5).
 * 6 MB as 6 × 1024 × 1024, which is what `du -h` reports as `6.0M`.
 */
export const COMMITTED_MEDIA_BYTE_CAP = 6 * 1024 * 1024;

/** The directory the committed variants live in, relative to the repository root. */
export const COMMITTED_MEDIA_DIR = "public/media";

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
