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
import {
  Container,
  Display,
  Grid,
  Label,
  ListingGrid,
  Stack,
  Text,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingDestinationLink, ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
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
      <Stack gap="xl" className="py-xl">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        <Stack gap="md">
          <Display as="h1" size="display-s">
            {hub("h1", { entity })}
          </Display>
          {/* The authored intro: 40–120 words, human-written, gated by `seed:check`. An intro that
              is not yet `reviewed` leaves the page `noindex` rather than unpublished — the page
              renders in full either way (§6, §5.3). */}
          {view.intro === undefined ? null : <Text measure>{view.intro}</Text>}
        </Stack>

        {/* Countries first: the hub's job is the destination (§13 Q4). */}
        <Stack as="section" gap="md" data-fo-hub-destinations>
          <Stack gap="xs">
            <Label>{hub("destinationsEyebrow")}</Label>
            <Display as="h2" size="2xl">
              {hub("destinationsHeading")}
            </Display>
          </Stack>
          {/* AC-7's one sentence. A cross-country minimum converted at today's rate is a price no
              configuration matches, which is the shape the Price Indication Directive and the
              drip-pricing ban exist to prevent — so the hub shows no money at all and says why,
              rather than showing a "from" it cannot honour (§8, 005 §13 Q10). */}
          <Text measure tone="muted">
            {shop("hub.noMoney")}
          </Text>
          <Grid as="ul" columns="1-3" gap="lg" className="list-none">
            {[...linked, ...unlinked].map((destination) => (
              <li key={destination.iso2}>
                <Stack
                  as="article"
                  gap="xs"
                  className="border-rule p-md border"
                  data-fo-hub-destination={destination.iso2}
                  data-fo-hub-destination-kind={
                    destination.href === undefined ? "text" : "link"
                  }
                >
                  <Display as="h3" size="lg">
                    {named(destination)}
                  </Display>
                  {destination.href === undefined ? (
                    /* No page there, so no link there. The sentence says what is true — we are
                       choosing florists — instead of padding the list back out with a destination
                       we cannot serve (spec 004 AC-14). */
                    <Text as="span" size="sm" tone="muted">
                      {hub("destinationPending")}
                    </Text>
                  ) : (
                    <>
                      <Text as="span" size="sm" tone="muted">
                        {hub("destinationCount", { count: destination.count })}
                      </Text>
                      <a className="hover:text-accent" href={destination.href}>
                        {hub("destinationLink", {
                          country: named(destination),
                        })}
                      </a>
                    </>
                  )}
                </Stack>
              </li>
            ))}
          </Grid>
        </Stack>

        {/* Then what we make: names and photographs, no price and no tier. This is the only page
            type on the site permitted to show a product without a price, and it is permitted only
            because the sentence above says why there is none. */}
        <Stack as="section" gap="md" data-fo-hub-products>
          <Stack gap="xs">
            <Label>{hub("productsEyebrow")}</Label>
            <Display as="h2" size="2xl">
              {hub("productsHeading", { entity })}
            </Display>
          </Stack>
          <ListingGrid cards={view.hubItems} locale={code} priority />
        </Stack>
      </Stack>
    </Container>
  );
}
