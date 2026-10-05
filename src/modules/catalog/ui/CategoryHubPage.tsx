/**
 * The destination-less **category hub** `/{locale}/{shopCategory}/{category}` (spec 008 §2 row 10,
 * §5.3 row 3, **AC-7**, §13 Q4; `docs/design/wireframes/category-hub-desktop.dc.html` and
 * `-mobile.dc.html`, canvas id `wf-category-hub`; TASK-112).
 *
 * The page for a buyer who searched "rose delivery" with no country in mind. Its job is to get the
 * destination chosen, so the block order the artboard draws is **countries first, then products**
 * (§13 Q4, resolved): breadcrumb · `h1` + the authored intro · the destination picker with the
 * one sentence that says why there is no price · the unpriced product grid.
 *
 * **No money, and the type is what guarantees it** (§2, §8, §14 **A3**). This page reads
 * `view.hubItems` — `HubCardView`, which is `ProductCardView` with `price` and `priceLabelKey`
 * omitted — so there is nothing here to render an amount *from*. `ListingViewSchema` refuses a view
 * that carries both arrays, which is why "a hub shows no money" holds at the parse exit rather than
 * at a reviewer's discretion, and why the empty `view.items` below is not a branch anyone has to
 * remember. The one sentence AC-7 requires (`shop.hub.noMoney`) stands above the picker, where the
 * artboard puts it and where it answers the question the picker is about to ask; each card repeats
 * the short form of it in the place a price would be.
 *
 * **Empty is impossible** (§5.3 row 3): the existence rule requires ≥1 product in ≥1 published
 * country, so a hub with no products has no URL. There is therefore no empty state here and none
 * is drawn — a category that loses its last product loses its hub at the next build.
 *
 * **The country list.** Every **published** destination is named; the ones whose country page
 * exists are the ones that are links, and the rest are named in words with the honest reason
 * (`docs/design/wireframes/category-hub-desktop.dc.html`, "Six of the seven destinations are text,
 * not links"). `listingView()` decided which is which; this component decides only the **order**,
 * which is `collator(locale)` — the label is a message key and only a rendering component can
 * resolve it, so the collation cannot happen in the view model (§7).
 *
 * Server Component: no island, no state, no fetch (§5.4). `BreadcrumbList` and `ItemList` are
 * TASK-115's; the slot is here and empty.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { sortBy } from "@/modules/i18n";
import { Container, ListingGrid, assertSinglePriority } from "@/modules/ui";

import type { ListingDestinationLink, ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import {
  HubDestinations,
  ListingIntro,
  ListingSubsection,
} from "./ListingChrome";
import { localeCode, registryLabel } from "./labels";

export interface CategoryHubPageProps {
  readonly view: ListingView;
}

export function CategoryHubPage({ view }: CategoryHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("categoryHub");
  const shop = useTranslations("shop");
  const code = localeCode(view.locale);
  const entity = view.entity?.name ?? "";

  // AC-24's nomination, made where it is made on every listing: the first card of the one grid.
  const lcp = view.hubItems[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  const named = (destination: ListingDestinationLink): string =>
    registryLabel(t, destination.nameKey);
  const linked = sortBy(
    view.links.destinations.filter((d) => d.href !== undefined),
    code,
    named,
  );
  const unlinked = sortBy(
    view.links.destinations.filter((d) => d.href === undefined),
    code,
    named,
  );

  return (
    <Container
      as="main"
      id="main"
      data-fo-hub="category"
      data-fo-hub-entity={view.entity?.key ?? ""}
    >
      <div className="pb-(--section-fluid)">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        {/* v2 `.shop-intro`: the subject as the eyebrow and in the poppy italic, and the authored
            intro (40–120 words, human-written, gated by `seed:check`) as the lede. An intro that
            is not yet `reviewed` leaves the page `noindex` rather than unpublished (§6, §5.3). */}
        <ListingIntro
          emphasis={entity}
          eyebrow={entity}
          heading={hub("h1", { entity })}
          {...(view.intro === undefined ? {} : { lede: view.intro })}
        />

        {/* Countries first: the hub's job is the destination (§13 Q4). */}
        <HubDestinations
          eyebrow={hub("destinationsEyebrow")}
          heading={hub("destinationsHeading")}
          id="hub-destinations-heading"
          noMoney={shop("hub.noMoney")}
          rows={[...linked, ...unlinked].map((destination) => ({
            iso2: destination.iso2,
            name: named(destination),
            ...(destination.href === undefined
              ? { pending: hub("destinationPending") }
              : {
                  href: destination.href,
                  count: hub("destinationCount", { count: destination.count }),
                  link: hub("destinationLink", {
                    country: named(destination),
                  }),
                }),
          }))}
        />

        {/* Then what we make: names and photographs, no price and no tier. This is the only page
            type on the site permitted to show a product without a price, and it is permitted only
            because the sentence above says why there is none. */}
        <ListingSubsection
          dataHook={{ "data-fo-hub-products": true }}
          emphasis={entity}
          eyebrow={hub("productsEyebrow")}
          heading={hub("productsHeading", { entity })}
          id="hub-products-heading"
        >
          <ListingGrid cards={view.hubItems} locale={code} priority />
        </ListingSubsection>
      </div>
    </Container>
  );
}
