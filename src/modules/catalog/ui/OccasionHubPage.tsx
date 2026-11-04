/**
 * The destination-less **occasion hub** `/{locale}/{occasions}/{occasion}` (spec 008 §2 row 13,
 * §5.3 row 4, **AC-7**, **AC-11**, §14 **A1** and **A10**;
 * `docs/design/wireframes/occasion-hub-desktop.dc.html` and `-mobile.dc.html`, canvas id
 * `wf-occasion-hub`; TASK-112).
 *
 * The answer to "when is Mother's Day in Germany?", computed rather than copied, for every
 * destination on the site. The **date table is the reason the page deserves to rank** (`plan/02`
 * §6) and it is the one thing a country page cannot carry: breadcrumb · `h1` + the authored intro
 * · the per-country date table · the unpriced product grid · the country pages that exist.
 *
 * **Every date is `occasionDate(rule, year)`'s** (AC-11), carried on `listingView()` from spec
 * 007's calendar and printed by spec 003's `formatDate` in the page's locale: seven countries,
 * seven rules, and not one date typed in a component or in a message string. A captioned table
 * with row headers, because this is a reference a screen reader has to be able to walk.
 *
 * **The two blanks a date table can have are different facts**, and the drawing renders them
 * differently:
 *
 *  - *not observed* — a destination with no rule for the occasion is **not** a row with an empty
 *    date, it is **absent**: "the Netherlands keeps no All Saints' Day" is not a missing date. An
 *    **evergreen** occasion (§14 **A1**: birthday, sympathy, wedding …) is observed nowhere by
 *    design, so its hub renders **no table at all** rather than seven blank rows — a column that
 *    could only ever say "no" is not information (§14 A10's reasoning, applied to a row);
 *  - *observed, but no date computes* — Romania's Orthodox Easter, which the committed rule set
 *    cannot express yet (`plan/13` B15) — **is** a row, with the date omitted **and said to be
 *    omitted** (§14 design-round Q6). Never a guess, and never the Western date quietly reused.
 *
 * **The third column is TASK-111's** (§14 **A10**): "which of these is a link" arrives with the
 * country-occasion pages it would link to. Until then the table has two columns and no
 * placeholder, and the country pages that *do* exist are named in their own block at the foot of
 * the page, where the artboard draws them ("Out of this page").
 *
 * **No money** (§2, §8, §14 **A3**): the page reads `view.hubItems`, which has no price field at
 * all, and says `shop.hub.noMoney` once.
 *
 * **Products first** (spec 008 §14 A-founder-2026-10-24a "Hubs", AC-7 as amended, AC-88, AC-89;
 * spec 004 §14 A-founder-2026-10-24a items 2, 3 and 6, AC-82; the 2026-10-24a section of
 * `occasion-hub-*`; TASK-388): breadcrumb, eyebrow, H1, lede, `shop.hub.noMoney`, the picker
 * (`next` = this hub's key), the count and the grid of the hub's core products as country-less
 * cards, then the dates (the table for a dated occasion, "Any day of the year" for an evergreen
 * one), the long copy and the destination rows, each a direct link (`HubProductsFirst.tsx`). A hub
 * with no core product (Mother's Day today) renders no grid and no count line, and keeps the
 * picker and the dates.
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
import { ListingProse, OccasionDatesTable } from "./ListingChrome";
import { localeCode, registryLabel } from "./labels";

export interface OccasionHubPageProps {
  readonly view: ListingView;
}

export function OccasionHubPage({ view }: OccasionHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("occasionHub");
  const index = useTranslations("occasionsIndex");
  const code = localeCode(view.locale);
  const entity = view.entity?.name ?? "";

  const heading = hub("h1", { entity });
  // The dates, in the table's own order, where the country keeps the occasion.
  const dates = (view.occasionDates ?? []).filter((row) => row.observed);
  const named = (destination: ListingDestinationLink): string =>
    registryLabel(t, destination.nameKey);
  const destinations = sortBy(
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
  const productsHeading =
    view.hubAbout?.plainProductsHeading === true
      ? hub("productsHeadingPlain", { entity })
      : hub("productsHeading", { entity });
  const parent = view.breadcrumb.at(-2);

  return (
    <Container
      as="main"
      id="main"
      data-fo-hub="occasion"
      data-fo-hub-entity={view.entity?.key ?? ""}
    >
      <div className="pb-(--section-fluid)">
        <HubHead
          breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
          deck={deck}
          eyebrow={
            parent === undefined
              ? index("h1")
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
          label={productsHeading}
          locale={code}
          resultCount={view.resultCount}
        />

        {dates.length === 0 ? (
          /* An evergreen occasion has no date to compute (§14 A1): the boards' "The dates · Any
             day of the year", in the dates' place (AC-89's order). */
          <section
            aria-labelledby="hub-dates-heading"
            className="grid gap-[10px] pt-[48px] md:pt-(--section-fluid)"
            data-fo-hub-dates="0"
          >
            <Eyebrow>{hub("datesEyebrow")}</Eyebrow>
            <Display as="h2" size="2xl" id="hub-dates-heading">
              {index("everydayHeading")}
            </Display>
          </section>
        ) : null}

        {dates.length === 0 ? null : (
          <section
            aria-labelledby="hub-dates-heading"
            className="gap-lg md:gap-2xl grid grid-cols-1 items-start pt-[48px] md:grid-cols-[4fr_7fr] md:pt-(--section-fluid)"
            data-fo-hub-dates={dates.length}
            data-fo-reveal=""
          >
            <div>
              <Eyebrow className="mb-[14px]">{hub("datesEyebrow")}</Eyebrow>
              <Display as="h2" size="2xl" id="hub-dates-heading">
                {hub("datesHeading")}
              </Display>
            </div>
            <OccasionDatesTable
              caption={hub("datesCaption", { entity })}
              columns={[hub("countryColumn"), hub("dateColumn")]}
              locale={code}
              rows={dates.map((row) => ({
                key: row.iso2,
                name: registryLabel(t, row.nameKey),
                nameKey: row.nameKey,
                date: row.date,
                alsoDates: row.alsoDates,
                hook: { "data-fo-hub-date": row.iso2 },
              }))}
              unknownDate={hub("dateUnknown")}
            />
          </section>
        )}

        {view.intro === undefined ? null : (
          /* The authored intro, under the grid (A23 clause 6): A4's eyebrow where it is approved
             (Birthday), "What people send" on every occasion hub (open item (iii)). */
          <section
            aria-labelledby="hub-about-heading"
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
              <Display as="h2" size="2xl" id="hub-about-heading">
                {hub("aboutHeading")}
              </Display>
            </div>
            <ListingProse>{view.intro}</ListingProse>
          </section>
        )}

        <HubDestinationRows
          heading={hub("destinationsHeading")}
          headingId="hub-destinations-heading"
          rows={destinations.flatMap((destination) =>
            destination.href === undefined
              ? []
              : [
                  {
                    key: destination.iso2,
                    name: named(destination),
                    href: destination.href,
                    label: hub("destinationLink", {
                      country: named(destination),
                      entity,
                    }),
                  },
                ],
          )}
        />
      </div>
    </Container>
  );
}
