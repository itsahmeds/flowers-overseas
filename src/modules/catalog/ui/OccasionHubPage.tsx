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
 * all, and carries AC-7's one sentence above the grid.
 *
 * **The first screen, round 2** (spec 004 §14 A23 R1–R3, clause 5; A24 clauses 2 (c) and 5;
 * TASK-188): from `md` up, the register's band (the registry's ground) holds the trail, the
 * eyebrow, the `<h1>`, the deck, the no-money note, the way to a price (the country pills, or a
 * dated occasion's per-country date cards, R3) and R2's lead figure, the page's one priority image
 * there. Below `md` it is the phone shop list: the back link, the `<h1>`, the note as one muted
 * line, one chip row and the two-column grid, whose first card is the priority image there. The
 * authored intro moves under the grid, in the about block (A23 clause 6, A4).
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
  HubDateCards,
  HubDeck,
  HubHeading,
  HubLeadFigure,
  HubNote,
  HubPills,
} from "./HubHero";
import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { ListingProse, OccasionDatesTable, emphasise } from "./ListingChrome";
import { localeCode, registryLabel } from "./labels";

export interface OccasionHubPageProps {
  readonly view: ListingView;
}

/** The part of the `<h1>` after the entity ("country by country"), set in the italic. */
function headingTail(heading: string, entity: string): string {
  return entity !== "" && heading.startsWith(entity)
    ? heading.slice(entity.length).replace(/^[,\s]+/u, "")
    : "";
}

export function OccasionHubPage({ view }: OccasionHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("occasionHub");
  const shop = useTranslations("shop");
  const index = useTranslations("occasionsIndex");
  const code = localeCode(view.locale);
  const entity = view.entity?.name ?? "";
  const register = view.entity?.register ?? "warm";
  const lead = view.hubLead;

  // One priority image per width (A24 clause 5): R2's lead figure from `md` up, and the first
  // grid card below `md`. Each width nominates exactly one.
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

  const heading = hub("h1", { entity });
  // R3: a dated hub's per-country dates, in the table's own order, where the country keeps it.
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

  return (
    <Container
      as="main"
      id="main"
      data-fo-hub="occasion"
      data-fo-hub-entity={view.entity?.key ?? ""}
    >
      <div className="pb-(--section-fluid)">
        <HubBand
          after={
            dates.length === 0 ? undefined : (
              <div data-fo-hub-first-dates={dates.length}>
                <HubDateCards
                  cards={dates.map((row) => ({
                    key: row.iso2,
                    name: registryLabel(t, row.nameKey),
                    date: row.date,
                    alsoDates: row.alsoDates,
                    href: row.href,
                    hook: { "data-fo-hub-first-date": row.iso2 },
                  }))}
                  columns={7}
                  cta={hub("productsEyebrow")}
                  label={hub("datesCaption", { entity })}
                  locale={code}
                  unknownDate={hub("dateUnknown")}
                />
              </div>
            )
          }
          aside={
            lead === undefined ? undefined : (
              <HubLeadFigure
                lead={lead}
                locale={code}
                register={register}
                small={dates.length > 0}
              />
            )
          }
          breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
          flip={register === "quiet"}
          labelledBy="hub-h1"
          register={register}
        >
          <HubHeading eyebrow={index("h1")} id="hub-h1">
            {emphasise(heading, headingTail(heading, entity))}
          </HubHeading>
          {deck === undefined ? null : (
            <HubDeck register={register}>{deck}</HubDeck>
          )}
          {/* AC-7's one sentence, in the first screen (A23 clause 5): the flat P.S. from `md` up,
              one muted line on a phone. */}
          <HubNote
            label={shop("note.label")}
            mark={shop("note.mark")}
            register={register}
          >
            {shop("hub.noMoney")}
          </HubNote>
          {dates.length > 0 ? null : (
            <HubPills
              heading={hub("destinationsHeading")}
              label={hub("destinationsHeading")}
              pills={destinations.map((destination) => ({
                key: destination.iso2,
                name: named(destination),
                href: destination.href,
                label: hub("destinationLink", {
                  country: named(destination),
                  entity,
                }),
                hook: { "data-fo-hub-destination": destination.iso2 },
              }))}
            />
          )}
        </HubBand>

        <section
          aria-labelledby="hub-products-heading"
          className="pt-[16px] md:pt-(--section-fluid)"
          data-fo-hub-products
        >
          {/* The phone draws the grid straight under the chip row: the heading stays for the
              outline and is shown from `md` up. */}
          {/* The grid's heading row: the heading on the start side (shown from `md` up) and the
              grid's one example label on the end side (spec 004 §14 A-founder-2026-10-19b
              clause 3; the hub artboards' item 7A). Below `md` the label is the line between the
              destination chips and the first row. */}
          <div className="md:mb-[48px] md:flex md:flex-wrap md:items-end md:justify-between md:gap-x-[40px] md:gap-y-[16px]">
            <div className="max-md:sr-only">
              <Eyebrow className="mb-[14px]">{hub("productsEyebrow")}</Eyebrow>
              <Display as="h2" id="hub-products-heading" size="2xl">
                {emphasise(productsHeading, entity)}
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
      </div>
    </Container>
  );
}
