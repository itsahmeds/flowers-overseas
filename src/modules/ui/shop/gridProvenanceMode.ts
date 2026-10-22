/**
 * Where a grid's "Example arrangement" label is displayed (spec 004 §14 A-founder-2026-10-19b
 * clause 3; spec 008 AC-6 as amended there, A2 and A16 (a) as replaced; TASK-285).
 *
 * One question with three answers, asked by the grid (which hides or shows each card's own label)
 * and by the page (which places the grid's one label above it). Both ask this function with the
 * same cards, so the two halves of the rule cannot disagree about which grid they are looking at:
 *
 *  - `all`: every card that shows a photograph shows an `ai` asset, and at least one does. The
 *    grid's label is displayed once at every width and no grid card displays its own (each keeps
 *    it in the server HTML, hidden by CSS; spec 006 AC-17);
 *  - `mixed`: the grid also shows a non-`ai` photograph. From `md` up each `ai` card displays its
 *    own label, so the buyer can tell which picture is an example; below `md` the grid's label is
 *    displayed once;
 *  - `none`: no card shows an `ai` asset, so no label is owed anywhere.
 *
 * "Shows" is `MediaProvenanceNote`'s own test (`needsAiProvenanceNote`, which asks the same
 * `isDisplayable()` as the `<picture>`): a card whose asset degraded to the placeholder shows no
 * photograph and counts for neither side. Pure: no clock, no messages.
 */
import { needsAiProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import type { MediaManifest } from "../media/manifest.ts";
import { isDisplayable } from "../media/resolve.ts";

import type { ListingCardView } from "./viewModel.ts";

export const GRID_PROVENANCE_MODES = ["all", "mixed", "none"] as const;
export type GridProvenanceMode = (typeof GRID_PROVENANCE_MODES)[number];

export function gridProvenanceMode(
  cards: readonly ListingCardView[],
  locale: string,
  manifest?: MediaManifest,
): GridProvenanceMode {
  let shown = 0;
  let examples = 0;
  for (const card of cards) {
    if (card.photo.kind !== "asset") continue;
    const { assetId } = card.photo;
    if (!isDisplayable(assetId, locale, manifest)) continue;
    shown += 1;
    if (needsAiProvenanceNote([assetId], locale, manifest)) examples += 1;
  }
  if (examples === 0) return "none";
  return examples === shown ? "all" : "mixed";
}
