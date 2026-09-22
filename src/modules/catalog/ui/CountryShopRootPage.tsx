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

import { formatDate } from "@/modules/i18n";
import {
  Container,
  Display,
  FromPriceChip,
  Grid,
  Label,
  ListingEmpty,
  ListingGrid,
  ListingToolbar,
  Pagination,
  Stack,
  Text,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { localeCode, registryLabel } from "./labels";

/** Midday UTC: the hour that is the same calendar date in every European zone (007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

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
      <Stack gap="xl" className="py-xl">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        {view.items.length === 0 ? (
          /* AC-8. One sentence and the ways out — and the page stops here: no heading that
             promises a catalogue, no tiles, no dates, no grid, no skeleton, no placeholder card. */
          <ListingEmpty
            country={country}
            headingLevel="h1"
            links={emptyStateLinks(view, shop, country)}
          />
        ) : (
          <>
            {/* The hero: the one `<h1>`, the lede, and the sentence that is the whole of the
                Phase 0 demo state — no disabled basket button, no "coming soon" panel, no email
                capture, because there is no purchase affordance on this page at all. */}
            <Stack gap="md">
              <Display as="h1" size="display-s">
                {shop("h1.countryShopRoot", { country })}
              </Display>
              <Text measure>{shop("root.lede", { country })}</Text>
              <Text measure tone="muted">
                {shop("root.demoNotice", { country })}
              </Text>
            </Stack>

            {/* Products before prose (§5.3 row 1, `docs/design/README.md` §Density). */}
            <Stack as="section" gap="md" data-fo-shop-listing>
              <Stack gap="xs">
                <Label>{shop("root.listingEyebrow")}</Label>
                <Display as="h2" size="2xl">
                  {shop("root.listingHeading", { country })}
                </Display>
              </Stack>
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
              <ListingGrid cards={view.items} locale={code} priority />
              {/* Stale FX (spec 005 §14 A3, §5.3's state): the projection fell back to the
                  destination's own authored price, so the page says which currency it is
                  quoting. One sentence for the page, because one rate priced all of it. */}
              {view.fxFallback ? (
                <Text measure size="sm" tone="muted">
                  {catalog("availability.fxUnavailable")}
                </Text>
              ) : null}
              {/* Real `<a>`s in a labelled `<nav>`, page 1 linking to the bare URL, nothing at
                  all on a single-page listing (AC-10). The sort is deliberately **not** carried
                  into these hrefs: a sorted URL is `noindex` and may never be a crawlable link
                  (AC-15), so paging out of a sorted view returns the reader to the order the
                  page canonicals to. */}
              <Pagination
                baseHref={view.path}
                locale={code}
                page={view.page}
                pageCount={view.pageCount}
              />
            </Stack>

            {view.tiles.length === 0 ? null : (
              <Stack as="section" gap="md" data-fo-shop-tiles>
                <Display as="h2" size="2xl">
                  {shop("root.tilesHeading")}
                </Display>
                <Grid as="ul" columns="1-3" gap="lg" className="list-none">
                  {view.tiles.map((tile) => (
                    <li key={tile.key}>
                      <Stack
                        as="article"
                        gap="xs"
                        className="border-rule p-md border"
                        data-fo-category-tile={tile.key}
                      >
                        <Display as="h3" size="lg">
                          <a className="hover:text-accent" href={tile.href}>
                            {tile.name}
                          </a>
                        </Display>
                        <Text as="span" size="sm" tone="muted">
                          {shop("root.tileCount", {
                            count: tile.count,
                            country,
                          })}
                        </Text>
                        {/* The stale-FX sentence is the page's, once, above this row: six tiles
                            each repeating it would be one snapshot claimed six times. */}
                        <FromPriceChip locale={code} price={tile.fromPrice} />
                      </Stack>
                    </li>
                  ))}
                </Grid>
              </Stack>
            )}

            {occasionDates.length === 0 ? null : (
              /* The dated occasion row. Every date is `occasionDate(rule, year)`'s answer for
                 **this** destination, carried on `listingView()` (§14 A6) and rendered by spec
                 003's `formatDate`: not one of them is typed, in any locale (AC-11's rule applied
                 to this page type). A captioned table with row headers, because a calendar read
                 by a screen reader is a table. */
              <Stack as="section" gap="md" data-fo-shop-occasions>
                <Stack gap="xs">
                  <Label>{shop("root.occasionsEyebrow", { country })}</Label>
                  <Display as="h2" size="2xl">
                    {shop("root.occasionsHeading", { country })}
                  </Display>
                </Stack>
                <table className="w-full border-collapse text-sm">
                  <caption className="label text-ink-subtle pb-sm text-start">
                    {shop("root.occasionsCaption", { country })}
                  </caption>
                  <thead>
                    <tr>
                      <th
                        className="border-rule py-sm pe-md text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                        scope="col"
                      >
                        {shop("root.occasionColumn")}
                      </th>
                      <th
                        className="border-rule py-sm pe-md text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                        scope="col"
                      >
                        {shop("root.dateColumn")}
                      </th>
                      {/* The third column (§14 **A10**, TASK-111): which of these occasions has a
                          page of its own. It waited for the pages it links to — a column that
                          could only ever say "no" is not information — and a row without one
                          renders an **empty cell**, never a disabled link (spec 004 AC-14). */}
                      <th
                        className="border-rule py-sm text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                        scope="col"
                      >
                        {shop("root.pageColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {occasionDates.map((occasion) => (
                      <tr key={`${occasion.nameKey}-${occasion.date ?? ""}`}>
                        <th
                          className="border-rule py-sm pe-md border-b text-start font-semibold"
                          scope="row"
                        >
                          {registryLabel(t, occasion.nameKey)}
                        </th>
                        <td className="border-rule py-sm pe-md border-b">
                          {occasion.date === null
                            ? null
                            : formatDate(
                                instantOf(occasion.date),
                                code,
                                "calendarDate",
                                "UTC",
                              )}
                        </td>
                        <td className="border-rule py-sm border-b">
                          {occasion.href === undefined ? null : (
                            <a
                              className="hover:text-accent underline"
                              data-fo-occasion-page={occasion.nameKey}
                              href={occasion.href}
                            >
                              {shop("root.occasionPageLink")}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Stack>
            )}

            {/* One short intro, last rather than first: the country block that keeps seven
                near-identical listings from reading as one page. */}
            <Stack as="section" gap="md" data-fo-shop-intro>
              <Display as="h2" size="2xl">
                {shop("root.introHeading", { country })}
              </Display>
              <Text measure>{shop("root.introBody", { country })}</Text>
            </Stack>
          </>
        )}
      </Stack>
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
