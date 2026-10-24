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
 * **The first screen, round 2** (spec 004 §14 A23 R1, R2, R4, clause 5; A24 clauses 2 (c) and 5;
 * TASK-188): from `md` up the register's band holds the trail, the subject as the eyebrow, the
 * `<h1>` (A2), the deck (A5), R4's destination pills (each one link named by
 * `categoryHub.destinationLink`, its visible text the country and the count), the no-money
 * sentence and R2's lead figure. Below `md`, the phone shop list. The authored intro moves under
 * the grid (A23 clause 6), under A4's pair where it is approved (roses).
 *
 * Server Component: no island, no state, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { sortBy } from "@/modules/i18n";
import {
  GridProvenance,
  Container,
  Display,
  Eyebrow,
  ListingGrid,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingDestinationLink, ListingView } from "../listing";

import {
  HubBand,
  HubDeck,
  HubHeading,
  HubLeadFigure,
  HubNote,
  HubPills,
} from "./HubHero";
import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { ListingProse, emphasise } from "./ListingChrome";
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
  const register = view.entity?.register ?? "cream";
  const lead = view.hubLead;

  // One priority image per width (A24 clause 5): the lead figure from `md` up, the first grid
  // card below `md`.
  assertSinglePriority(
    lead !== undefined && lead.photo.kind === "asset"
      ? [lead.photo.assetId]
      : [],
  );
  const first = view.hubItems[0];
  assertSinglePriority(
    first !== undefined && first.photo.kind === "asset"
      ? [first.photo.assetId]
      : [],
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
  const deck =
    view.hubDeck === undefined
      ? undefined
      : "key" in view.hubDeck
        ? registryLabel(t, view.hubDeck.key)
        : view.hubDeck.sentence;

  return (
    <Container
      as="main"
      id="main"
      data-fo-hub="category"
      data-fo-hub-entity={view.entity?.key ?? ""}
    >
      <div className="pb-(--section-fluid)">
        <HubBand
          aside={
            lead === undefined ? undefined : (
              <HubLeadFigure lead={lead} locale={code} register={register} />
            )
          }
          breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
          labelledBy="hub-h1"
          register={register}
        >
          <HubHeading eyebrow={entity} id="hub-h1">
            {emphasise(hub("h1", { entity }), entity)}
          </HubHeading>
          {deck === undefined ? null : (
            <HubDeck register={register}>{deck}</HubDeck>
          )}
          {/* Countries first (spec 008 §13 Q4), now inside the first screen (R4). A destination
              below the floor is text with the pending sentence, never a link (AC-14). */}
          <HubPills
            heading={`${hub("destinationsEyebrow")} · ${hub("destinationsHeading")}`}
            label={hub("destinationsHeading")}
            pills={[...linked, ...unlinked].map((destination) => ({
              key: destination.iso2,
              name: named(destination),
              ...(destination.href === undefined
                ? {
                    detail: hub("destinationPending"),
                    hook: {
                      "data-fo-hub-destination": destination.iso2,
                      "data-fo-hub-destination-kind": "text",
                    },
                  }
                : {
                    href: destination.href,
                    label: hub("destinationLink", {
                      country: named(destination),
                    }),
                    detail: hub("destinationCount", {
                      count: destination.count,
                    }),
                    hook: {
                      "data-fo-hub-destination": destination.iso2,
                      "data-fo-hub-destination-kind": "link",
                    },
                  }),
            }))}
          />
          <HubNote register={register}>{shop("hub.noMoney")}</HubNote>
        </HubBand>

        {/* Then what we make: names and photographs, no price and no tier. */}
        <section
          aria-labelledby="hub-products-heading"
          className="pt-[16px] md:pt-(--section-fluid)"
          data-fo-hub-products
        >
          {/* The grid's heading row: the heading on the start side (shown from `md` up) and the
              grid's one example label on the end side (spec 004 §14 A-founder-2026-10-19b
              clause 3; the hub artboards' item 7A). Below `md` the label is the line between the
              destination chips and the first row. */}
          <div className="md:mb-[48px] md:flex md:flex-wrap md:items-end md:justify-between md:gap-x-[40px] md:gap-y-[16px]">
            <div className="max-md:sr-only">
              <Eyebrow className="mb-[14px]">{hub("productsEyebrow")}</Eyebrow>
              <Display as="h2" id="hub-products-heading" size="2xl">
                {emphasise(hub("productsHeading", { entity }), entity)}
              </Display>
            </div>
            <GridProvenance
              cards={view.hubItems}
              className="max-md:mb-[14px]"
              locale={code}
            />
          </div>
          <ListingGrid
            cards={view.hubItems}
            locale={code}
            priority
            provenance="grid"
            {...(lead === undefined ? {} : { priorityAt: "below-md" as const })}
          />
        </section>

        {view.intro === undefined ? null : (
          /* The authored intro, under the grid (A23 clause 6): under A4's pair where it is
             approved (roses), with no eyebrow and no heading elsewhere (open item (iii)). */
          <section
            {...(view.hubAbout?.headingKey === undefined
              ? {}
              : { "aria-labelledby": "hub-about-heading" })}
            className="gap-lg md:gap-2xl grid grid-cols-1 items-start pt-[48px] md:grid-cols-[4fr_7fr] md:pt-(--section-fluid)"
            data-fo-hub-about
            data-fo-reveal=""
          >
            <div>
              {view.hubAbout?.eyebrowKey === undefined ? null : (
                <Eyebrow className="mb-[14px]">
                  {registryLabel(t, view.hubAbout.eyebrowKey)}
                </Eyebrow>
              )}
              {view.hubAbout?.headingKey === undefined ? null : (
                <Display as="h2" size="2xl" id="hub-about-heading">
                  {registryLabel(t, view.hubAbout.headingKey)}
                </Display>
              )}
            </div>
            <ListingProse>{view.intro}</ListingProse>
          </section>
        )}
      </div>
    </Container>
  );
}
