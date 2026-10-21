/**
 * `TrendingRow` — the home's "Popular choices" row (v2: spec 004 §14 A21 clause 7, TASK-177), gated on real orders (spec 004 §13's
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
import {
  CARD_MOTION_ATTRIBUTE,
  CARD_MOTION_HEADING,
  CardMotionFrame,
  CardMotionLine,
} from "../primitives/cardMotion.tsx";
import {
  Display,
  Eyebrow,
  HEADING_EM,
  TextLink,
} from "../primitives/typography.tsx";

import { HOME_BLEED, HOME_SECTION } from "./HomeHero.tsx";
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
  /**
   * The demo destination's shop root, or `undefined` while it may not be linked
   * (`corridorShopEntry()`, from the page). It is the row's "see every bouquet" link, worded
   * with the header's reviewed "Our selection"; absent → no link at all (A20).
   */
  readonly shopHref?: string;
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
 * (the same `flex-col` and gap), so linking a card moves no pixel; or the content itself. A linked
 * card is a moving card: motion 6 (spec 004 §14 A-founder-2026-10-19e; TASK-277) lifts it, zooms
 * its photograph inside the clipped box and draws its name's line on a fine pointer's hover. No
 * card of this row is a page's priority (LCP) photograph.
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
    <a className="block no-underline" href={href} {...CARD_MOTION_ATTRIBUTE}>
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
  shopHref,
}: TrendingRowProps): ReactElement | null {
  const t = useTranslations() as unknown as (key: string) => string;
  const home = useTranslations("home");
  const source = provider ?? getTrendingProvider();
  const picks = source.list();

  // Nothing to show is a section that is not there: no heading, no empty grid, no reserved hole
  // in the page (the `TrustMarks` rule of §5.3, applied to a row).
  if (picks.length === 0) return null;
  const CardHeading = headingLevel === "h2" ? "h3" : "h4";

  return (
    <section
      className={`${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-trending
      data-fo-reveal=""
      data-fo-trending-basis={source.basis()}
      id={TRENDING_ANCHOR}
    >
      <div className="mb-[28px] flex flex-wrap items-end justify-between gap-x-[40px] gap-y-[16px] md:mb-[48px]">
        <div>
          {/* The row's destination, in the catalogue's own word for it (the artboard's "For
              Poland"); the picks are the demo destination's products. */}
          <Eyebrow className="mb-[14px]">
            {t(`destinations.${DEMO_DESTINATION_ISO2.toLowerCase()}.name`)}
          </Eyebrow>
          <Display as={headingLevel} id={HEADING_ID} size="display-s">
            {home.rich("trending.heading", HEADING_EM)}
          </Display>
          {source.basis() === "picks" ? (
            <p
              className="text-ink-subtle mt-[12px] text-sm"
              data-fo-trending-basis-line
            >
              {home("trending.basis")}
            </p>
          ) : null}
        </div>
        {shopHref === undefined ? null : (
          <TextLink href={shopHref} arrow>
            {t("nav.category.ourSelection")}
          </TextLink>
        )}
      </div>
      {/* Item 5A (TASK-284; TASK-252 "all A"; spec 004 AC-49; `home-mobile.dc.html` `.scroll5`):
          below `md` the five are one row that scrolls sideways, each card 44 % of the row with a
          14 px gap, bled to the screen's edges by the gutter and padded by it, so the first card
          starts on the page's frame, the third peeks at the edge and no half row is left blank;
          the `trending` slot's `sizes` states that card's width. It really scrolls, with snap;
          nothing auto-advances and nothing is called a carousel (AC-36). The 8 px block padding,
          taken back by the same negative margin, is room inside the scroller's clip for a card's
          4 px lift and its focus ring, so the layout does not move. Every card is a link on the
          home, so the row takes no tab stop; with no link in it, the row is the stop, named by
          the heading. From `md`, one row of five, unchanged. */}
      <ul
        aria-labelledby={HEADING_ID}
        className="m-0 grid list-none p-0 max-md:-mx-(--gutter-s) max-md:-my-[8px] max-md:snap-x max-md:snap-mandatory max-md:scroll-px-(--gutter-s) max-md:[scrollbar-width:none] max-md:auto-cols-[44%] max-md:grid-flow-col max-md:gap-x-[14px] max-md:overflow-x-auto max-md:overscroll-x-contain max-md:px-(--gutter-s) max-md:py-[8px] md:grid-cols-5 md:gap-x-[24px] md:gap-y-[40px]"
        {...(picks.some(
          (pick) => trendingPickHref(pick.sku, productPages) !== undefined,
        )
          ? {}
          : { tabIndex: 0 })}
      >
        {picks.map((pick) => {
          const href = trendingPickHref(pick.sku, productPages);
          const moving = href !== undefined;
          const photo = (
            <MediaAsset
              assetId={pick.assetId}
              locale={locale}
              slot="trending"
              ratio="card"
              productName={pick.name}
            />
          );
          return (
            <li
              className="max-md:snap-start"
              key={pick.id}
              data-fo-trending-pick={pick.id}
            >
              <CardLink href={href}>
                {/*
              The pick's photograph, or the captioned placeholder — whichever the dataset earns
              (spec 006 AC-18). The box is the `trending` slot, whose `sizes` states this row's
              own card width (`../media/slots.ts`). The pick's name is the heading the screen
              reader already announces, so it is handed to `MediaAsset`: an alt that merely
              repeats it is refused and degrades to the box.
            */}
                {moving ? <CardMotionFrame>{photo}</CardMotionFrame> : photo}
                <CardHeading
                  className={`display md:text-h3 mt-[10px] text-[19px] leading-(--line-height-title) md:mt-[14px]${moving ? ` ${CARD_MOTION_HEADING}` : ""}`}
                >
                  {pick.name}
                  {moving ? <CardMotionLine /> : null}
                </CardHeading>
              </CardLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
