/**
 * The country shop root `/{locale}/{country}/{shopCategory}` (spec 008 §2 row 6, §5.2, §5.3 row 1,
 * §5.4, **AC-1**, **AC-8**, **AC-24**; `docs/design/wireframes/country-shop-desktop.dc.html` and
 * `-mobile.dc.html`, canvas id `wf-country-shop`; TASK-109).
 *
 * The first page in the repository on which a buyer sees a bouquet and a price.
 *
 * **Block order, from the artboards** — breadcrumb · `h1` + lede + the demo sentence · the priced
 * grid · the category tiles with their `from` prices · the destination's own dated occasion row ·
 * one short intro, last. §5.3 row 1 is the normative list ("Opens with a priced product row before
 * any prose … then category tiles with `from` prices, then the occasion row with real computed
 * dates, then one short intro") and the drawing is that list with its states drawn beside it.
 *
 * **One grid** (spec 008 §14 **A8** (d)): the desktop artboard draws "Six we make for Poland" and
 * "Everything we can make for Poland" as two panels whose first six cards are the same six
 * products, and the ruling reads them as one grid with the lower panels as its chrome. The page
 * therefore renders the page-1 grid once, first, and the *toolbar* and *pagination* drawn under it
 * are **TASK-114's** — nothing here reads `searchParams`, so a sort form that cannot sort and a
 * `?page=2` link to a page that renders page 1 are controls this page does not pretend to have
 * (§14 A8 (c)).
 *
 * **The empty state** (AC-8): a published country with no deliverable product renders the honest
 * sentence and the ways out — **no grid, no skeleton, no placeholder card, no tiles, no dates** —
 * and returns before any block that would imply a catalogue. `ListingEmpty` is TASK-108's, and the
 * links are the ones `listingView()` resolved, so none of them can point at a page that does not
 * exist (spec 004 AC-14).
 *
 * **One `priority` image** (AC-24): the grid's first card, nominated by the one `priority` prop
 * this page passes, with its `<link rel="preload">` emitted by `MediaAsset` from the **same**
 * manifest lookup that produced the `srcset` (spec 006 AC-19, `preloadArgsFor`).
 * `assertSinglePriority()` is called with what this page nominated, so a second grid added here
 * later fails loudly at render rather than in a Lighthouse report.
 *
 * **The occasion table's third column** (spec 008 §14 **A10**; TASK-111): the artboards draw
 * three columns — occasion, date, page — and this page shipped two, because no country-occasion
 * page existed for the third to link to. It now does, so the column is here: a link where
 * `listingView()` resolved one, an empty cell where the (occasion, country) pair fails the
 * existence rule, and no placeholder in either case.
 *
 * **What is deliberately not here.** The delivery-facts panel the desktop artboard draws between
 * the demo sentence and the grid is spec 007's `CorridorFacts` in its `facts-unknown` form: it
 * reads a `CorridorView`, and §5.2 makes `listingView()` the **only** source for this page, its
 * JSON-LD and its sitemap row. §5.3 row 1's block list names four blocks and not that one, so it
 * is left to the corridor page the breadcrumb links to. `BreadcrumbList` and `ItemList` are
 * TASK-115's; the slot is here and empty. No client island, no `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  Container,
  ListingEmpty,
  ListingGrid,
  ListingToolbar,
  Pagination,
  Text,
  VisuallyHidden,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import {
  ListingIntro,
  ListingProse,
  ListingSubsection,
  ListingTiles,
  OccasionDatesTable,
} from "./ListingChrome";
import { localeCode, registryLabel } from "./labels";

export interface CountryShopRootPageProps {
  readonly view: ListingView;
}

export function CountryShopRootPage({
  view,
}: CountryShopRootPageProps): ReactElement {
  const t = useTranslations();
  const shop = useTranslations("shop");
  const catalog = useTranslations("catalog");
  const code = localeCode(view.locale);
  const country = registryLabel(t, view.country?.nameKey ?? "");

  // AC-24, asserted where the nomination is made: the first card of the one grid, and nothing
  // else on the page, carries `priority`.
  const lcp = view.items[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  const occasionDates = view.occasionDates ?? [];

  return (
    <Container
      as="main"
      id="main"
      data-fo-shop-root={view.country?.iso2 ?? ""}
      data-fo-listing-state={view.items.length === 0 ? "empty" : "populated"}
    >
      <div className="pb-(--section-fluid)">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        {view.items.length === 0 ? (
          /* AC-8. One sentence and the ways out — and the page stops here: no heading that
             promises a catalogue, no tiles, no dates, no grid, no skeleton, no placeholder card. */
          <div className="pt-xl">
            <ListingEmpty
              country={country}
              headingLevel="h1"
              links={emptyStateLinks(view, shop, country)}
            />
          </div>
        ) : (
          <>
            {/* v2 `.shop-intro`: the one `<h1>` with the destination in the poppy italic, the
                lede, and the demo sentence as the page's note card — the whole of the Phase 0
                state, with no disabled basket button and no purchase affordance at all. */}
            <ListingIntro
              emphasis={country}
              heading={shop("h1.countryShopRoot", { country })}
              lede={shop("root.lede", { country })}
              eyebrow={shop("listing.eyebrow", { country })}
              note={shop("root.demoNotice")}
              noteLabel={shop("note.label")}
              noteMark={shop("note.mark")}
            />

            {/* Products before prose (§5.3 row 1, `docs/design/README.md` §Density). The grid's
                heading names the section for a screen reader; the artboards draw none. */}
            <section aria-labelledby="shop-grid-heading" data-fo-shop-listing>
              <VisuallyHidden as="h2" id="shop-grid-heading">
                {shop("root.listingHeading", { country })}
              </VisuallyHidden>
              {/* The toolbar carries the count, the ranking disclosure and the sort form — one
                  `<form method="get">` with a visible label and a submit button, so sorting works
                  with JavaScript off and from the keyboard alone and adds zero client bytes (§2
                  "Sort", AC-9, TASK-114). The order it shows is the order the server rendered:
                  `view.sort` comes from `listingRequest()`, never from the browser. */}
              <ListingToolbar
                page={view.page}
                pageCount={view.pageCount}
                productCount={view.resultCount}
                sort={view.sort}
              />
              <div className="mt-[32px]">
                <ListingGrid
                  cards={view.items}
                  interlude={
                    <p className="display-em text-accent-strong text-[26px] leading-[1.15] md:text-xl">
                      {shop("cardNote.heading")}
                    </p>
                  }
                  locale={code}
                  priority
                />
              </div>
              {/* Stale FX (spec 005 §14 A3, §5.3's state): the projection fell back to the
                  destination's own authored price, so the page says which currency it is
                  quoting. One sentence for the page, because one rate priced all of it. */}
              {view.fxFallback ? (
                <div className="mt-[32px]" data-fo-fx-fallback>
                  <Text measure size="sm" tone="muted">
                    {catalog("availability.fxUnavailable")}
                  </Text>
                </div>
              ) : null}
              {/* Real `<a>`s in a labelled `<nav>`, page 1 linking to the bare URL, nothing at
                  all on a single-page listing (AC-10). The sort is deliberately **not** carried
                  into these hrefs: a sorted URL is `noindex` and may never be a crawlable link
                  (AC-15), so paging out of a sorted view returns the reader to the order the
                  page canonicals to. */}
              <div className="mt-xl">
                <Pagination
                  baseHref={view.path}
                  locale={code}
                  page={view.page}
                  pageCount={view.pageCount}
                />
              </div>
            </section>

            {view.tiles.length === 0 ? null : (
              <ListingSubsection
                dataHook={{ "data-fo-shop-tiles": true }}
                emphasis={shop("root.tilesSubheading").split(" ").at(-1) ?? ""}
                eyebrow={shop("root.tilesHeading")}
                heading={shop("root.tilesSubheading")}
                id="shop-tiles-heading"
              >
                <ListingTiles
                  countLabel={(tile) =>
                    shop("root.tileCount", { count: tile.count, country })
                  }
                  locale={code}
                  tiles={view.tiles}
                />
              </ListingSubsection>
            )}

            {occasionDates.length === 0 ? null : (
              /* The dated occasion row. Every date is `occasionDate(rule, year)`'s answer for
                 **this** destination, carried on `listingView()` (§14 A6) and rendered by spec
                 003's `formatDate`: not one of them is typed, in any locale (AC-11's rule applied
                 to this page type). The third column links only where a country occasion page
                 exists (§14 **A10**, TASK-111). */
              <ListingSubsection
                dataHook={{ "data-fo-shop-occasions": true }}
                eyebrow={shop("root.occasionsEyebrow", { country })}
                heading={shop("root.occasionsHeading", { country })}
                id="shop-dates-heading"
                split
              >
                <OccasionDatesTable
                  caption={shop("root.occasionsCaption", { country })}
                  columns={[
                    shop("root.occasionColumn"),
                    shop("root.dateColumn"),
                    shop("root.pageColumn"),
                  ]}
                  linkLabel={shop("root.occasionPageLink")}
                  locale={code}
                  rows={occasionDates.map((occasion) => ({
                    key: `${occasion.nameKey}-${occasion.date ?? ""}`,
                    name: registryLabel(t, occasion.nameKey),
                    nameKey: occasion.nameKey,
                    date: occasion.date,
                    href: occasion.href,
                  }))}
                />
              </ListingSubsection>
            )}

            {/* One short intro, last rather than first: the country block that keeps seven
                near-identical listings from reading as one page. */}
            <ListingSubsection
              dataHook={{ "data-fo-shop-intro": true }}
              emphasis={country}
              heading={shop("root.introHeading", { country })}
              id="shop-how-heading"
              split
            >
              <ListingProse>{shop("root.introBody", { country })}</ListingProse>
            </ListingSubsection>
          </>
        )}
      </div>
    </Container>
  );
}

/**
 * The ways out of the empty state (AC-8): the corridor guide, the all-destinations hub and the
 * occasions index — **each only where `listingView()` resolved one**, so the empty state can never
 * carry a link to a page that does not exist (spec 004 AC-14, 007 AC-17). In Phase 0 the occasions
 * index has no URL until TASK-113, so it is absent rather than disabled.
 */
function emptyStateLinks(
  view: ListingView,
  shop: ReturnType<typeof useTranslations<"shop">>,
  country: string,
): readonly { id: string; href: string; label: string }[] {
  const links: { id: string; href: string; label: string }[] = [];
  if (view.links.corridor !== undefined) {
    links.push({
      id: "corridor",
      href: view.links.corridor,
      label: shop("empty.corridorLink", { country }),
    });
  }
  if (view.links.destinationsHub !== undefined) {
    links.push({
      id: "destinations",
      href: view.links.destinationsHub,
      label: shop("empty.destinationsLink"),
    });
  }
  if (view.links.occasionsIndex !== undefined) {
    links.push({
      id: "occasions",
      href: view.links.occasionsIndex,
      label: shop("empty.occasionsLink"),
    });
  }
  return links;
}
