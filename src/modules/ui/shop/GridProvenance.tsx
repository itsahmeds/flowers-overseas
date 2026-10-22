/**
 * `GridProvenance` — a grid's one "Example arrangement" label (spec 004 §14 A-founder-2026-10-19b
 * clause 3; spec 008 AC-6, A2 and A16 (a) as amended there; TASK-285).
 *
 * **One element per grid**, rendered where at least one card shows an `ai` asset, and displayed as
 * the grid's mode says (`gridProvenanceMode()`, the same question `ListingGrid` asks with
 * `provenance="grid"`, over the same cards):
 *
 *  - an all-example grid displays it at every width, and every card hides its own;
 *  - a mixed grid displays it below `md` only (`md:hidden`), and from `md` up each `ai` card
 *    displays its own, so the buyer can tell which picture is an example.
 *
 * The page places it: on the count line's row from `md` up and between the count line and the
 * first row below it (the country listings), or on the grid's heading row (the hubs). The words
 * are `MediaProvenanceNote`'s, which cannot be switched off (ADR-0014): this wrapper only decides
 * the widths at which the one label for the grid shows. Server Component, no client bytes.
 */
import type { ReactElement } from "react";

import { MediaProvenanceNote } from "../media/MediaProvenanceNote.tsx";
import type { MediaManifest } from "../media/manifest.ts";

import { gridProvenanceMode } from "./gridProvenanceMode.ts";
import type { ListingCardView } from "./viewModel.ts";

export interface GridProvenanceProps {
  /** The grid's cards, exactly as `ListingGrid` receives them. */
  readonly cards: readonly ListingCardView[];
  readonly locale: string;
  /** The manifest the grid resolved against, where it is not the committed one (`/dev/components`). */
  readonly manifest?: MediaManifest;
}

export function GridProvenance({
  cards,
  locale,
  manifest,
  className,
}: GridProvenanceProps & {
  /** Placement only (grid cells, margins); the mode decides the widths. */
  readonly className?: string;
}): ReactElement | null {
  const mode = gridProvenanceMode(cards, locale, manifest);
  if (mode === "none") return null;
  const assetIds = cards.flatMap((card) =>
    card.photo.kind === "asset" ? [card.photo.assetId] : [],
  );
  return (
    <div
      className={[mode === "mixed" ? "md:hidden" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      data-fo-grid-provenance={mode}
    >
      <MediaProvenanceNote
        assetIds={assetIds}
        locale={locale}
        {...(manifest === undefined ? {} : { manifest })}
      />
    </div>
  );
}
