/**
 * `TrendingRow` — the artboards' "Most sent this week" row, gated on real orders (spec 004 §13's
 * 2026-09-08 resolution note, §3, §14 A5, AC-14, AC-15; TASK-054;
 * `docs/design/homepage-v1/homepage-desktop.dc.html`, `homepage-mobile.dc.html`).
 *
 * **The gate is the deliverable.** The row asks `TrendingProvider` for its cards and for the
 * *basis* of the order they are in. While the basis is `picks` — nothing has been ordered yet —
 * the row renders the founder's verbatim sentence saying so; when spec 008/016 swaps in a
 * provider ranked by real orders in the last seven days the basis becomes `orders`, the sentence
 * disappears, and no call site changes. An empty provider hides the section altogether.
 *
 * **What a card is, and what it deliberately is not.** Spec 004 §3 ships "nothing that knows what
 * a product is", and §8 renders no price. So a card is a reserved photo box and a name, and there
 * is no price element on it **at all** — not a figure, not a "starting at", not the canvas's grey
 * price bar. The TASK-054 row offers "photo slot + name + 'starting at' without a figure" as the
 * alternative; a price label with no price is a price block with a hole in it, it invites the
 * reader to guess the missing number, and §3 does not permit a price block here in either form.
 * The reasoning is in the PR body for the reviewer's ruling, as the row asks.
 *
 * Nothing here is a link: the shop is spec 008's, so the home keeps zero internal links to a
 * non-200 URL (AC-14). The canvas's filter chips above the row ("Best sellers", "New this
 * season", "Under …", "Same-day") are shop filters — 008's — and one of them is a delivery-timing
 * claim spec 006 §14 A4 forbids in copy, so none of them ships here.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { MediaAsset } from "../media/MediaAsset.tsx";
import { Grid, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";
import {
  type TrendingProvider,
  getTrendingProvider,
} from "./trending-provider.ts";

export interface TrendingRowProps {
  /**
   * The resolved request locale. Required since TASK-080: a card's photograph is only rendered
   * when the dataset has alt text **in this locale**, so a row that did not know its locale could
   * only guess — and the guess a screen reader would hear is an English sentence on a Polish page.
   */
  readonly locale: string;
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
  /**
   * The gallery's populated state, and only the gallery's: a prop mutates no module state inside
   * a request (the precedent `MediaAsset`'s `manifest` prop set). The page passes nothing and
   * gets the composition root's provider.
   */
  readonly provider?: TrendingProvider;
}

/** The id, so the section can be pointed at, screenshotted and skipped over. */
export const TRENDING_ANCHOR = "trending";

const HEADING_ID = "trending-heading";

export function TrendingRow({
  locale,
  headingLevel = "h2",
  provider,
}: TrendingRowProps): ReactElement | null {
  const home = useTranslations("home");
  const source = provider ?? getTrendingProvider();
  const picks = source.list();

  // Nothing to show is a section that is not there: no heading, no empty grid, no reserved hole
  // in the page (the `TrustMarks` rule of §5.3, applied to a row).
  if (picks.length === 0) return null;

  return (
    <Stack
      as="section"
      gap="lg"
      className={`border-rule py-2xl border-t ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-trending
      data-fo-trending-basis={source.basis()}
      id={TRENDING_ANCHOR}
    >
      <Stack gap="sm">
        <Label>{home("trending.eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="2xl">
          {home("trending.heading")}
        </Display>
      </Stack>
      <Grid as="ul" columns="2-5" gap="lg">
        {picks.map((pick) => (
          <Stack as="li" gap="sm" key={pick.id} data-fo-trending-pick={pick.id}>
            {/*
              The pick's photograph, or the captioned placeholder — whichever the dataset earns.
              Twelve of the eighty-four products have approved, derived, alt-texted imagery
              (TASK-080); the rest render the `--color-photo` box with `media.placeholder.product`
              and no `<img>`, which is `plan/10` §3's honesty rule and not a gap. The pick's name
              is the heading the screen reader already announces, so it is handed to `MediaAsset`:
              an alt that merely repeats it is refused and degrades to the box (AC-18).
            */}
            <MediaAsset
              assetId={pick.assetId}
              locale={locale}
              slot="grid"
              productName={pick.name}
            />
            <Text as="span" size="sm" className="font-medium">
              {pick.name}
            </Text>
          </Stack>
        ))}
      </Grid>
      {source.basis() === "picks" ? (
        <Text measure size="xs" tone="subtle">
          {home("trending.basis")}
        </Text>
      ) : null}
    </Stack>
  );
}
