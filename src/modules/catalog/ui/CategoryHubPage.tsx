/**
 * The destination-less **category hub** `/{locale}/{shopCategory}/{category}` (spec 008 §2 row 10,
 * §5.3 row 3, **AC-7** as amended, **AC-88**, **AC-89**; spec 004 §14 A-founder-2026-10-24a items
 * 2, 3 and 6, **AC-82**; `docs/design/wireframes/category-hub-desktop.dc.html` and
 * `-mobile.dc.html`, the 2026-10-24a section; TASK-112, TASK-388).
 *
 * **Products first** (the founder, in A-founder-2026-10-24a: "on birthday, why do the product names only show?
 * ... Why aren't they clickable"): breadcrumb, eyebrow, H1, the one-sentence lede,
 * `shop.hub.noMoney` once, the country picker (`next` = this hub's key), the count and the grid's
 * one example label, the hub's **core** products as country-less cards (photograph, name,
 * `shop.price.choose`, `shop.cta.chooseCountry`, one `nofollow` link through the chooser), then
 * the authored long copy and the destination rows, each a direct link to that country's version
 * of the hub (`HubProductsFirst.tsx`).
 *
 * **No money, and the type is what guarantees it** (§2, §8, §14 **A3**): the page reads
 * `view.hubItems`, `HubCardView`s with no `price` field, and `ListingViewSchema` refuses a view
 * carrying both arrays. A hub with no core product renders no grid and no count line.
 *
 * Server Component: no island, no state, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { sortBy } from "@/modules/i18n";
import { Container, Display, Eyebrow } from "@/modules/ui";

import type { ListingDestinationLink, ListingView } from "../listing";

import { HubCoreGrid, HubDestinationRows, HubHead } from "./HubProductsFirst";
import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { ListingProse } from "./ListingChrome";
import { localeCode, registryLabel } from "./labels";

export interface CategoryHubPageProps {
  readonly view: ListingView;
}

export function CategoryHubPage({ view }: CategoryHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("categoryHub");
  const code = localeCode(view.locale);
  const entity = view.entity?.name ?? "";

  const named = (destination: ListingDestinationLink): string =>
    registryLabel(t, destination.nameKey);
  // The destination rows: every country whose version of this hub exists, a direct link each.
  const linked = sortBy(
    view.links.destinations.filter((d) => d.href !== undefined),
    code,
    named,
  );
  const deck =
    view.hubDeck === undefined
      ? undefined
      : "key" in view.hubDeck
        ? registryLabel(t, view.hubDeck.key)
        : view.hubDeck.sentence;
  const parent = view.breadcrumb.at(-2);
  const heading = hub("h1", { entity });

  return (
    <Container
      as="main"
      id="main"
      data-fo-hub="category"
      data-fo-hub-entity={view.entity?.key ?? ""}
    >
      <div className="pb-(--section-fluid)">
        <HubHead
          breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
          deck={deck}
          eyebrow={
            parent === undefined
              ? entity
              : registryLabel(
                  t,
                  parent.labelKey,
                  parent.labelValue === undefined
                    ? undefined
                    : { name: parent.labelValue },
                )
          }
          heading={heading}
          headingId="hub-h1"
          picker={view.hubPicker}
        />

        <HubCoreGrid
          cards={view.hubItems}
          label={hub("productsHeading", { entity })}
          locale={code}
          resultCount={view.resultCount}
        />

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

        <HubDestinationRows
          eyebrow={hub("destinationsEyebrow")}
          heading={hub("destinationsHeading")}
          headingId="hub-destinations-heading"
          rows={linked.flatMap((destination) =>
            destination.href === undefined
              ? []
              : [
                  {
                    key: destination.iso2,
                    name: named(destination),
                    href: destination.href,
                    label: hub("destinationLink", {
                      country: named(destination),
                    }),
                  },
                ],
          )}
        />
      </div>
    </Container>
  );
}
