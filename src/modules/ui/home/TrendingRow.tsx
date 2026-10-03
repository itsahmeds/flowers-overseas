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
 * **Each card links to its product page** (spec 008 §14 A14 (e); TASK-173): the founder clicked
 * the home on 2026-10-03 and found five bouquets that went nowhere while their pages answered 200.
 * The page is the demo destination's (`DEMO_DESTINATION_ISO2`), and a card links only when the
 * `product` link id is published **and** that page exists in this locale — the home passes the
 * catalogue's product existence set as `productPages`, because `src/modules/ui` may not read the
 * catalogue (`plan/01` §5). A card with no page stays a photograph and a name: content, not a
 * control, so it looks like nothing that can be pressed. The canvas's filter chips above the row ("Best sellers", "New this
 * season", "Under …", "Same-day") are shop filters — 008's — and one of them is a delivery-timing
 * claim spec 006 §14 A4 forbids in copy, so none of them ships here.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import {
  DEMO_DESTINATION_ISO2,
  PRODUCT_LINK_ID,
  isPublished,
} from "../../../config/site-links.ts";

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
  /**
   * The product pages that exist in this locale — `listProductPages(locale)` from the catalogue,
   * passed by the home page (spec 008 §14 A14 (e); TASK-173). Structural, so this module needs no
   * runtime import of `src/modules/catalog`. Absent → no card links.
   */
  readonly productPages?: readonly TrendingProductPage[];
}

/** The three fields of a catalogue `ProductPageRecord` a card needs to link to its page. */
export interface TrendingProductPage {
  readonly sku: string;
  readonly countryIso: string;
  readonly path: string;
}

/**
 * The card's product page in the demo destination, or `undefined` → the card is not a link.
 * Permission (`isPublished("product")`) and existence (the record) are both required.
 */
export function trendingPickHref(
  sku: string | undefined,
  productPages: readonly TrendingProductPage[],
): string | undefined {
  if (sku === undefined || !isPublished(PRODUCT_LINK_ID)) return undefined;
  return productPages.find(
    (page) => page.sku === sku && page.countryIso === DEMO_DESTINATION_ISO2,
  )?.path;
}

/**
 * The card's content inside its `<li>`: an `<a>` laid out exactly as the `<li>`'s own column was
 * (the same `flex-col` and gap), so linking a card moves no pixel; or the content itself.
 */
function CardLink({
  href,
  children,
}: {
  readonly href: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  if (href === undefined) return children;
  return (
    <a className="gap-sm flex flex-col" href={href}>
      {children}
    </a>
  );
}

/** The id, so the section can be pointed at, screenshotted and skipped over. */
export const TRENDING_ANCHOR = "trending";

const HEADING_ID = "trending-heading";

export function TrendingRow({
  locale,
  headingLevel = "h2",
  provider,
  productPages = [],
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
            <CardLink href={trendingPickHref(pick.sku, productPages)}>
              {/*
              The pick's photograph, or the captioned placeholder — whichever the dataset earns.
              Since TASK-168 every product has approved, derived, alt-texted imagery; one that
              loses it renders the `--color-photo` box with `media.placeholder.product` and no
              `<img>`, which is `plan/10` §3's honesty rule and not a gap. The box is the
              `trending` slot, whose `sizes` states this row's own card width (`../media/slots.ts`). The pick's name
              is the heading the screen reader already announces, so it is handed to `MediaAsset`:
              an alt that merely repeats it is refused and degrades to the box (AC-18).
            */}
              <MediaAsset
                assetId={pick.assetId}
                locale={locale}
                slot="trending"
                productName={pick.name}
              />
              <Text as="span" size="sm" className="font-medium">
                {pick.name}
              </Text>
            </CardLink>
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
