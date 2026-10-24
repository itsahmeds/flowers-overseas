/**
 * The country occasion `/{locale}/{country}/{occasions}/{occasion}` (spec 008 §2 row 8, §5.2,
 * §5.3 row 2, §5.4, §12 task 7 — the country half of **AC-11**; T-01, T-11;
 * `docs/design/wireframes/country-occasion-desktop.dc.html` and `-mobile.dc.html`; TASK-111).
 *
 * **Why the page type exists.** Mother's Day is a different day in every country a buyer might
 * send to. This page answers "what can you make for it *there*, and when is it *there*" on one
 * URL, and the dated line is the whole reason it deserves to rank (`plan/02` §6: "a wrong
 * Mother's Day is worse than no page").
 *
 * **Block order, from the artboard** — breadcrumb · `h1` · the dated line · the lede · the demo
 * sentence · the priced grid · the "also in {country}" row. §5.3 row 2 is the normative list
 * ("the same, minus the tiles; occasion adds the dated line for that country").
 *
 * **The date is never computed here** (AC-11, T-11). It arrives on `listingView().occasionDates`
 * as one row for this destination, produced by spec 007's `occasionDate`/`nextOccasions` through
 * `upcomingOccasions()` — the same path the shop root's table and the occasion hub read, so no two
 * page types can print different days for one occasion. This component formats it with spec 003's
 * `formatDate` and composes nothing: there is no date literal here and none in any message string.
 *
 * **`date: null` is the honest blank** (§14 design round **Q6**). An occasion whose rule is `none`,
 * and Romania's Orthodox Easter until spec 009 task 2 adds the rule type (`plan/13` B15), carries
 * no date: the page says it is not printing one and why. The Western date is never reused.
 *
 * **No empty state.** A country occasion exists only where six deliverable products do (§2 row 8,
 * §13 Q7), so the grid can never be empty — the artboard draws that cell as unreachable, and
 * `tests/unit/catalog-occasion-page.test.tsx` asserts the existence set keeps it so.
 *
 * **What is deliberately not here.** The delivery-facts panel the desktop artboard draws under the
 * demo sentence is spec 007's `CorridorFacts` in its `facts-unknown` form: it reads a
 * `CorridorView`, and §5.2 makes `listingView()` the **only** source for this page. Spec 008 §14
 * **A9** already ruled that for the shop root — spec text governs over the drawing — and §5.3
 * row 2's block list names it no more than row 1 does, so it stays on the corridor page the
 * breadcrumb links to (dated row in `docs/design/README.md`). The **toolbar** and **pagination**
 * the artboard draws are TASK-114's (§14 **A8** (c)): nothing here reads `searchParams`, and a
 * sort form that cannot sort is a control the page does not pretend to have. `BreadcrumbList` and
 * `ItemList` are `listingJsonLd()`'s (TASK-115). No client island, no `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  Container,
  ListingGrid,
  ListingSortForm,
  Pagination,
  Text,
  VisuallyHidden,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import {
  ListingAlsoIn,
  ListingFootNote,
  ListingHead,
  ListingProse,
  ListingStatusAfterGrid,
  ListingSubsection,
  formatOccasionDates,
} from "./ListingChrome";
import { listingCount, listingStatusParts } from "./listingHead";
import { localeCode, registryLabel } from "./labels";

export interface CountryOccasionPageProps {
  readonly view: ListingView;
}

export function CountryOccasionPage({
  view,
}: CountryOccasionPageProps): ReactElement {
  const t = useTranslations();
  const shop = useTranslations("shop");
  const catalog = useTranslations("catalog");
  const code = localeCode(view.locale);
  const country = registryLabel(t, view.country?.nameKey ?? "");
  // The occasion's name is the founder's **authored copy** in this locale (spec 006's corpus), not
  // a message key: `listingView()` carries it on the entity, and nothing here composes a name.
  const occasion = view.entity?.name ?? "";

  // AC-24, asserted where the nomination is made: the first card of the one grid, and nothing else
  // on the page, carries `priority`. With the lead photograph gone (spec 043 item 7), the first
  // card's photograph is the page's LCP element.
  const lcp = view.items[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  /** This destination's row — the one `occasionDates` entry a country occasion carries. */
  const dated = view.occasionDates?.[0];
  const date = dated?.date ?? null;

  const heading = shop("h1.countryOccasion", { occasion, country });
  const datedLine =
    date === null
      ? shop("occasion.undatedLine", { occasion, country })
      : shop("occasion.datedLine", {
          occasion,
          country,
          // Every day of the occurrence, joined by the locale's own list format (spec 008 §14
          // A-founder-2026-10-21c, AC-76); a one-day occurrence is `formatDate`'s value alone.
          date: formatOccasionDates(
            [date, ...(dated?.alsoDates ?? [])],
            code,
            "calendarDate",
          ),
        });
  const parts = listingStatusParts(t, view);

  return (
    <Container
      as="main"
      id="main"
      data-fo-country-occasion={view.entity?.key ?? ""}
      data-fo-listing-state={view.items.length === 0 ? "empty" : "populated"}
    >
      <div className="pb-(--section-fluid)">
        <ListingBreadcrumb crumbs={view.breadcrumb} tone="quiet" />

        {/* The head (spec 043 §14 A-founder-2026-10-22 items 1, 2, 3, 5 and 7, revised
            2026-10-24; TASK-289): the short H1, the date line directly under it (no lead
            photograph, no date card, no band), one quiet line, one toolbar row whose start is
            "Also in {country}" and its one chip, the shop root. Below `md` the status parts
            follow the grid (spec 004 AC-57). */}
        <ListingHead
          count={listingCount(shop, view)}
          dateLine={{ text: datedLine, date }}
          emphasis={country}
          heading={heading}
          howWeSort={{
            label: shop("toolbar.howWeSort"),
            sentence: shop("toolbar.disclosure"),
          }}
          parts={parts}
          partsBelowMd="after-grid"
          sort={<ListingSortForm path={view.path} sort={view.sort} />}
          start={
            <ListingAlsoIn
              chip={
                view.links.shopRoot === undefined
                  ? undefined
                  : {
                      name: shop("occasion.shopRootLink", { country }),
                      href: view.links.shopRoot,
                    }
              }
              id="listing-also-in"
              label={shop("occasion.siblingsHeading", { country })}
            />
          }
        />

        {/* Products before prose (§5.3). */}
        <section aria-labelledby="occasion-grid-heading" data-fo-shop-listing>
          <VisuallyHidden as="h2" id="occasion-grid-heading">
            {heading}
          </VisuallyHidden>
          <ListingGrid
            cards={view.items}
            locale={code}
            priority
            provenance="grid"
          />
          <ListingFootNote
            after={
              date === null ? undefined : (
                <p data-fo-occasion-date-note>
                  {shop("occasion.dateNote", { country })}
                </p>
              )
            }
            before={<ListingStatusAfterGrid parts={parts} />}
            gridProvenance={{ cards: view.items, locale: code }}
          />
          {view.fxFallback ? (
            <div className="mt-[28px]" data-fo-fx-fallback>
              <Text measure size="sm" tone="muted">
                {catalog("availability.fxUnavailable")}
              </Text>
            </div>
          ) : null}
          <div className="mt-[28px]">
            <Pagination
              baseHref={view.path}
              locale={code}
              page={view.page}
              pageCount={view.pageCount}
            />
          </div>
        </section>

        {/* The lede, under the first screen. */}
        {view.page === 1 ? (
          <div className="pt-[40px] md:pt-[48px]" data-fo-shop-lede>
            <ListingProse>{shop("occasion.lede", { country })}</ListingProse>
          </div>
        ) : null}

        {/* "How it reaches Poland", last: the country's paragraph, as on the shop root. */}
        <ListingSubsection
          dataHook={{ "data-fo-shop-intro": true }}
          emphasis={country}
          heading={shop("root.introHeading", { country })}
          id="occasion-how-heading"
          split
        >
          <ListingProse>{shop("root.introBody", { country })}</ListingProse>
        </ListingSubsection>
      </div>
    </Container>
  );
}
