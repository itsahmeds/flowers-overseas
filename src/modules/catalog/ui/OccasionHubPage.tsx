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
 * Server Component: no island, no state, no fetch (§5.4). `BreadcrumbList` and `ItemList` are
 * TASK-115's; the slot is here and empty.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDate, sortBy } from "@/modules/i18n";
import {
  Container,
  Display,
  Label,
  ListingGrid,
  Stack,
  Text,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingDestinationLink, ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { localeCode, registryLabel } from "./labels";

/** Midday UTC: the hour that is the same calendar date in every European zone (007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface OccasionHubPageProps {
  readonly view: ListingView;
}

export function OccasionHubPage({ view }: OccasionHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("occasionHub");
  const shop = useTranslations("shop");
  const code = localeCode(view.locale);
  const entity = view.entity?.name ?? "";

  const lcp = view.hubItems[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  // Only the destinations that keep this occasion. The registry's order is the artboard's order
  // (Poland first, the published set after it); the *picker* below is the collated one.
  const dates = (view.occasionDates ?? []).filter((row) => row.observed);
  const named = (destination: ListingDestinationLink): string =>
    registryLabel(t, destination.nameKey);
  const destinations = sortBy(
    view.links.destinations.filter((d) => d.href !== undefined),
    code,
    named,
  );

  return (
    <Container
      as="main"
      id="main"
      data-fo-hub="occasion"
      data-fo-hub-entity={view.entity?.key ?? ""}
    >
      <Stack gap="xl" className="py-xl">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        <Stack gap="md">
          <Display as="h1" size="display-s">
            {hub("h1", { entity })}
          </Display>
          {view.intro === undefined ? null : <Text measure>{view.intro}</Text>}
        </Stack>

        {dates.length === 0 ? null : (
          <Stack as="section" gap="md" data-fo-hub-dates={dates.length}>
            <Stack gap="xs">
              <Label>{hub("datesEyebrow")}</Label>
              <Display as="h2" size="2xl">
                {hub("datesHeading")}
              </Display>
            </Stack>
            <table className="w-full border-collapse text-sm">
              <caption className="label text-ink-subtle pb-sm text-start">
                {hub("datesCaption", { entity })}
              </caption>
              <thead>
                <tr>
                  <th
                    className="border-rule py-sm pe-md text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                    scope="col"
                  >
                    {hub("countryColumn")}
                  </th>
                  <th
                    className="border-rule py-sm text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                    scope="col"
                  >
                    {hub("dateColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dates.map((row) => (
                  <tr key={row.iso2} data-fo-hub-date={row.iso2}>
                    <th
                      className="border-rule py-sm pe-md border-b text-start font-semibold"
                      scope="row"
                    >
                      {registryLabel(t, row.nameKey)}
                    </th>
                    <td className="border-rule py-sm border-b">
                      {row.date === null
                        ? hub("dateUnknown")
                        : formatDate(
                            instantOf(row.date),
                            code,
                            "calendarDate",
                            "UTC",
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Stack>
        )}

        <Stack as="section" gap="md" data-fo-hub-products>
          <Stack gap="xs">
            <Label>{hub("productsEyebrow")}</Label>
            <Display as="h2" size="2xl">
              {hub("productsHeading", { entity })}
            </Display>
          </Stack>
          {/* AC-7's one sentence, above the grid it explains — where this artboard draws it. */}
          <Text measure tone="muted">
            {shop("hub.noMoney")}
          </Text>
          <ListingGrid cards={view.hubItems} locale={code} priority />
        </Stack>

        {destinations.length === 0 ? null : (
          /* One link per country page that exists, and nothing where none does: a block whose
             data is missing renders nothing at all (§5.2). */
          <Stack as="section" gap="md" data-fo-hub-destinations>
            <Display as="h2" size="2xl">
              {hub("destinationsHeading")}
            </Display>
            <ul className="gap-sm flex list-none flex-wrap p-0">
              {destinations.map((destination) => (
                <li key={destination.iso2}>
                  <a
                    className="hover:text-accent"
                    data-fo-hub-destination={destination.iso2}
                    href={destination.href}
                  >
                    {hub("destinationLink", {
                      country: named(destination),
                      entity,
                    })}
                  </a>
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
