/**
 * The country category `/{locale}/{country}/{shopCategory}/{category}` (spec 008 §2 row 7, §5.2,
 * §5.3 row 2, §5.4, **AC-5**, AC-1, AC-6; `docs/design/wireframes/country-category-desktop.dc.html`
 * and `-mobile.dc.html`, canvas id `wf-country-category`; TASK-110).
 *
 * One category inside one destination: the roses we can actually make in Poland, at Poland's
 * prices.
 *
 * **Block order, from the artboards** — breadcrumb (five levels) · `h1` + lede + the demo sentence ·
 * the sibling-category chip row · the priced grid · one short intro, last. §5.3 row 2 is the
 * normative list — "the same, minus the tiles" — and the drawing is that list with its states
 * beside it.
 *
 * **This page cannot be empty** (§2 row 7, §13 Q7): it exists only where `PRODUCT_COUNT_FLOOR`
 * products do, so there is no URL at which an empty grid could render and no empty branch here.
 * A category that *falls* below the floor stops being generated and its URL becomes a 404 at the
 * next build — never a thin page, never a `noindex` one. That is the same rule read from the other
 * end as **AC-5**: a category that *crosses* the floor gains its URL, its chip on every sibling
 * page and its tile on the shop root from the data alone, with no edit under `src/app/` and none
 * here. Nothing in this file names a category.
 *
 * **The sibling row is the whole browsing affordance** (§2 "Filters", §13 Q6). Every chip is a
 * link to a page that exists — a category below the floor has no URL and is therefore *absent*
 * rather than disabled (spec 004 AC-14) — and the row is `listingView()`'s `links.chips`, so the
 * page invents no second list of what exists.
 *
 * **Toolbar and pagination are not here** (spec 008 §14 **A8 (c)**, TASK-109's precedent). The
 * artboard draws a sort form and a page nav; both are driven by `searchParams`, and this task
 * reads no query parameter. A `<select>` that cannot sort and a `?page=2` link that renders page 1
 * are controls the page would only pretend to have, so what ships is the honest half of that band:
 * the result count and the ranking-disclosure sentence, which describe the order the page is
 * *actually* in. TASK-114 adds the controls with the parameter that makes them work.
 *
 * **What is deliberately not here.** The delivery-facts panel both artboards draw between the demo
 * sentence and the chip row is spec 007's `CorridorFacts` in its `facts-unknown` form: it reads a
 * `CorridorView`, and §5.2 makes `listingView()` the **only** source for this page. §5.3 row 2's
 * block list does not name it. That is exactly spec 008 §14 **A9**'s ruling for the shop root,
 * applied to the artboard that shares the panel; the dated row is in `docs/design/README.md`.
 * `BreadcrumbList` and `ItemList` are `listingJsonLd()`'s (TASK-115), from this same view. No
 * client island, no `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { sortBy } from "@/modules/i18n";
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
  ListingCategoriesToggle,
  ListingFootNote,
  ListingHead,
  ListingProse,
  ListingSubsection,
} from "./ListingChrome";
import { chipGroups, listingCount, listingStatusParts } from "./listingHead";
import { localeCode, registryLabel } from "./labels";

export interface CountryCategoryPageProps {
  readonly view: ListingView;
}

export function CountryCategoryPage({
  view,
}: CountryCategoryPageProps): ReactElement {
  const t = useTranslations();
  const shop = useTranslations("shop");
  const catalog = useTranslations("catalog");
  const code = localeCode(view.locale);
  const country = registryLabel(t, view.country?.nameKey ?? "");
  // Authored copy in this locale — the founder's category name, carried on the view model rather
  // than composed here (§7: this file writes no sentence).
  const entity = view.entity?.name ?? "";
  // The sibling categories, once: the phone's chip line and the desktop's "Categories" panel.
  const siblings = sortBy(view.links.chips, code, (chip) => chip.name);

  // AC-24's rule, asserted where the nomination is made: the first card of the one grid, and
  // nothing else on the page, carries `priority`.
  const lcp = view.items[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  return (
    <Container
      as="main"
      id="main"
      data-fo-shop-category={view.entity?.key ?? ""}
      data-fo-listing-state="populated"
    >
      <div className="pb-(--section-fluid)">
        <ListingBreadcrumb crumbs={view.breadcrumb} tone="quiet" />

        {/* The head (spec 043 §14 A-founder-10-22 items 1, 2, 3 and 5, revised by
            design PR 347; TASK-289): the short H1, one quiet line, one toolbar row with the sibling
            categories folded into the "Categories" panel (A-founder-2026-10-15c), grouped by
            kind (§5.3 E), the only place their links render. */}
        <ListingHead
          count={listingCount(shop, view)}
          emphasis={country}
          heading={shop("h1.countryCategory", { country, entity })}
          howWeSort={{
            label: shop("toolbar.howWeSort"),
            sentence: shop("toolbar.disclosure"),
          }}
          parts={listingStatusParts(t, view)}
          partsBelowMd="head"
          sort={<ListingSortForm path={view.path} sort={view.sort} />}
          start={
            <ListingCategoriesToggle
              groups={chipGroups(siblings, view, {
                what: shop("root.tilesHeading"),
                occasion: t("home.occasions.eyebrow"),
              })}
              heading={shop("category.siblingsHeading", { country })}
              label={t("nav.categories.label")}
            />
          }
        />

        <section aria-labelledby="category-grid-heading" data-fo-shop-listing>
          {/* The grid's heading repeats the H1 word for word, so it is visually hidden and stays
              the list's accessible name (spec 008 §14 A15 (d), AC-32). */}
          <VisuallyHidden as="h2" id="category-grid-heading">
            {shop("h1.countryCategory", { country, entity })}
          </VisuallyHidden>
          <ListingGrid
            cards={view.items}
            locale={code}
            priority
            provenance="grid"
          />
          <ListingFootNote
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

        {/* The lede, under the first screen (A24 clause 2). */}
        {view.page === 1 ? (
          <div className="pt-[40px] md:pt-[48px]" data-fo-shop-lede>
            <ListingProse>
              {shop("category.lede", { count: view.resultCount, country })}
            </ListingProse>
          </div>
        ) : null}

        {/* One short intro, last rather than first. It is the **country's** paragraph, not the
            category's: the category's authored intro belongs to its destination-less hub (§2's
            existence rule requires one there), and printing it at seven country URLs is the
            near-duplicate the artboard's "How it reaches Poland" exists to avoid. */}
        <ListingSubsection
          dataHook={{ "data-fo-shop-intro": true }}
          emphasis={country}
          heading={shop("root.introHeading", { country })}
          id="category-how-heading"
          split
        >
          <ListingProse>{shop("root.introBody", { country })}</ListingProse>
        </ListingSubsection>
      </div>
    </Container>
  );
}
