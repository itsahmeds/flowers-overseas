/**
 * `HomeProvenanceNote` — the locale home's honesty label (spec 006 §2.5 "Honesty label", **AC-17**;
 * spec 008 §14 A2's pronoun; ADR-0014's standing condition; TASK-080).
 *
 * `MediaProvenanceNote` is the label and knows the rule; it does not know which pictures this page
 * displays. This component is that list, in one place, for the one page that has one:
 *
 *  - the full-bleed band (`HomeHero`),
 *  - the six occasion tiles (`occasionTiles()`),
 *  - the "most sent" cards (the trending provider's picks).
 *
 * Three properties fall out of collecting them here rather than at three call sites:
 *
 *  - **One label per page, not one per section.** ADR-0014 asks for a disclosure a buyer reads, and
 *    three identical sentences down one page is noise that teaches a reader to skip it.
 *  - **It follows what the page actually displays.** `MediaProvenanceNote` re-asks
 *    `isDisplayable()` per asset, so a home whose imagery all degraded to placeholders renders no
 *    label — correctly, because it is claiming nothing — and the German home labels itself the day
 *    German alt text lands, with no edit here.
 *  - **It cannot be switched off.** There is no prop for it here either; the section either has
 *    generated pictures on it or it does not.
 *
 * Placed after the occasion grid, which is the last image-bearing section of the page: the label
 * sits under the pictures it is about and above the explainer, and it is server-rendered text, so
 * it is in the HTML before hydration and crawlable (§2.5, `plan/02` §15).
 */
import type { ReactElement } from "react";

import {
  MediaProvenanceNote,
  needsAiProvenanceNote,
} from "../media/MediaProvenanceNote.tsx";

import { HOME_BLEED, HOME_HERO_ASSET } from "./HomeHero.tsx";
import { occasionTiles } from "./occasion-model.ts";
import {
  type TrendingProvider,
  getTrendingProvider,
} from "./trending-provider.ts";

export interface HomeProvenanceNoteProps {
  readonly locale: string;
  /** The gallery's populated state — see `TrendingRow`'s twin for why it is a prop. */
  readonly provider?: TrendingProvider;
}

/**
 * Every asset id the locale home puts in a box, in the page's own order. Exported because the
 * label, the e2e assertion and spec 009's future `Product.image[]` builder must all be able to ask
 * one function rather than re-derive the list and disagree about it.
 */
export function homeMediaAssetIds(
  locale: string,
  provider: TrendingProvider = getTrendingProvider(),
): readonly string[] {
  return [
    HOME_HERO_ASSET,
    ...provider.list().map((pick) => pick.assetId),
    ...occasionTiles(locale).map((tile) => tile.assetId),
  ];
}

export function HomeProvenanceNote({
  locale,
  provider,
}: HomeProvenanceNoteProps): ReactElement | null {
  const assetIds = homeMediaAssetIds(locale, provider ?? getTrendingProvider());
  // `MediaProvenanceNote` already returns `null` when no label is owed, but the *wrapper* would
  // still lay out its own padding — a 24 px band of nothing on a page that is displaying no
  // generated image. So the question is asked here as well: a section that says nothing does not
  // reserve space for saying it. `/ar-XB` is the page that proves it — no alt text, so every slot
  // degrades to a placeholder, no label is owed, and the pseudo-RTL baseline is exactly the height
  // it was before any of this landed.
  if (!needsAiProvenanceNote(assetIds, locale)) return null;
  return (
    <div className={`pb-lg ${HOME_BLEED}`} data-fo-home-provenance>
      <MediaProvenanceNote assetIds={assetIds} locale={locale} />
    </div>
  );
}
