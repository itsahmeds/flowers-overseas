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
 * `BreadcrumbList` and `ItemList` are TASK-115's; the slot is here and empty. No client island, no
 * `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  CategoryChipRow,
  Container,
  Display,
  Label,
  ListingGrid,
  Stack,
  Text,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
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
      <Stack gap="xl" className="py-xl">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        {/* The hero: the one `<h1>`, the counted lede, and the sentence that is the whole of the
            Phase 0 demo state — no disabled basket button and no purchase affordance at all. */}
        <Stack gap="md">
          <Display as="h1" size="display-s">
            {shop("h1.countryCategory", { country, entity })}
          </Display>
          <Text measure>
            {shop("category.lede", { count: view.resultCount, country })}
          </Text>
          <Text measure tone="muted">
            {shop("root.demoNotice", { country })}
          </Text>
        </Stack>

        {/* "Also for Poland": the other categories that clear the floor **for this destination**,
            collated by `CategoryChipRow` in this locale's order, the current one marked and not a
            link to the page the reader is already on. */}
        <CategoryChipRow
          heading={shop("category.siblingsHeading", { country })}
          id="sibling-categories"
          items={view.links.chips}
          locale={code}
        />

        <Stack as="section" gap="md" data-fo-shop-listing>
          <Stack gap="xs">
            <Label>{shop("toolbar.count", { count: view.resultCount })}</Label>
            {/* §2 "Sort": the default order is labelled for what it is and never called a ranking
                by sales. The sentence ships with the order, not with the control. */}
            <Text measure size="sm" tone="muted">
              {shop("toolbar.disclosure")}
            </Text>
          </Stack>
          <ListingGrid cards={view.items} locale={code} priority />
          {/* Stale FX (spec 005 §14 A3, §5.3's state): the projection fell back to the
              destination's own authored price, so the page says which currency it quotes. One
              sentence for the page, because one rate priced all of it. */}
          {view.fxFallback ? (
            <Text measure size="sm" tone="muted">
              {catalog("availability.fxUnavailable")}
            </Text>
          ) : null}
        </Stack>

        {/* One short intro, last rather than first. It is the **country's** paragraph, not the
            category's: the category's authored intro belongs to its destination-less hub (§2's
            existence rule requires one there), and printing it at seven country URLs is the
            near-duplicate the artboard's "How it reaches Poland" exists to avoid. */}
        <Stack as="section" gap="md" data-fo-shop-intro>
          <Display as="h2" size="2xl">
            {shop("root.introHeading", { country })}
          </Display>
          <Text measure>{shop("root.introBody", { country })}</Text>
        </Stack>
      </Stack>
    </Container>
  );
}
