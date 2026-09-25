/**
 * The **occasions index** `/{locale}/{occasions}` (spec 008 §2 row 14, **AC-20**, §14 design round
 * **Q3** and **Q4**; `docs/design/wireframes/occasions-index-desktop.dc.html` and its mobile
 * artboard, canvas id `wf-occasions-index`; TASK-113).
 *
 * One page listing **every occasion hub that exists in this locale**, and nothing else. It is the
 * page that makes twenty-eight hubs reachable in two clicks from anywhere on the site: the footer
 * links here, this page links to each hub, and each hub links to the country pages of its own
 * occasion — spec 008 §2's "crawl depth from any locale home to any page in this spec is ≤3"
 * (AC-21) closes through this file.
 *
 * **Three groups, because there are three honest states and not two** (the artboard's "States"
 * block):
 *
 *  - *dated* — an occasion that falls on a day, with a day we can compute: the table, with the
 *    **next date in the destination the dates are computed in** (the first published destination
 *    whose registry status is `live`: Poland). The caption names that country out loud, and it
 *    names it from the same `occasionsDateCountryKey` the dates were computed from (§14 **Q4**),
 *    so the page cannot quote Poland's calendar under another country's name. **It says nothing
 *    else about the data** (`/review 98`): §14 Q4's "the one published destination" stopped being
 *    true when TASK-091 published all seven guides, and a caption that counts destinations in
 *    prose is false the day the count moves. Both
 *    groups are in `collator(locale)` order and **not** in date order: a Polish reader gets a
 *    different sequence from an English one, and neither is sorted by how soon the day falls.
 *  - *observed, no date* — Name day, whose rule names no day at all; Sant Jordi, Grandmothers' Day
 *    in France and the May Day lily of the valley, whose days belong to another country's calendar
 *    (Spain's, France's). They are **named, linked and explained** — never a row with a blank date, never an
 *    em dash, never the Western date quietly reused (§14 **Q6**). An occasion with a hub but no
 *    row here would be a page nothing links to, which is the orphan this whole task exists to end.
 *  - *everyday* — an evergreen occasion (birthday, sympathy, wedding…), which carries no date
 *    because it has none: "not a blank, not an em dash, not 'all year' dressed up as a date".
 *
 * **Every date is `listingView()`'s** — `nextOccasions()` over the destination's own rules, from
 * spec 007's calendar, formatted by spec 003's `formatDate` in this page's locale. Not one date is
 * typed in this component or in a message string (**AC-11**), and the grouping reads `kind` and
 * `nextDate` off the view model rather than deciding anything about a calendar.
 *
 * **Every entry is a link, because every entry is a hub that exists.** `occasionEntries()` skips
 * an occasion with no hub and an occasion with no authored slug in this locale, so there is no
 * text-only state to draw here and none is drawn (spec 004 AC-14).
 *
 * **No money and no product grid.** The index lists pages, not bouquets; there is no price field
 * on a `ListingOccasionEntry` to render one from (§2, §8).
 *
 * Server Component: no island, no state, no fetch (§5.4). `BreadcrumbList` and `ItemList` are
 * TASK-115's; the slot is here and empty.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDate } from "@/modules/i18n";
import { Container, Display, Label, Stack, Text } from "@/modules/ui";

import type { ListingOccasionEntry, ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { localeCode, registryLabel } from "./labels";

/** Midday UTC: the hour that is the same calendar date in every European zone (spec 007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface OccasionsIndexPageProps {
  readonly view: ListingView;
}

/**
 * One occasion, as a link. The list is `<ul>`/`<li>` rather than a run of anchors because it *is*
 * a list, and a screen reader is told how many there are before it walks them (§5.3).
 */
function EntryLink({ entry }: { readonly entry: ListingOccasionEntry }) {
  return (
    <li>
      <a
        className="hover:text-accent"
        data-fo-occasion={entry.key}
        href={entry.href}
      >
        {entry.name}
      </a>
    </li>
  );
}

export function OccasionsIndexPage({
  view,
}: OccasionsIndexPageProps): ReactElement {
  const t = useTranslations();
  const index = useTranslations("occasionsIndex");
  const code = localeCode(view.locale);

  const entries = view.occasions ?? [];
  // `kind` and `nextDate` are the view model's two facts about an entry; the three groups are the
  // three combinations that exist. Nothing here consults a calendar.
  const dated = entries.filter(
    (entry) => entry.kind === "seasonal" && entry.nextDate !== null,
  );
  const undated = entries.filter(
    (entry) => entry.kind === "seasonal" && entry.nextDate === null,
  );
  const everyday = entries.filter((entry) => entry.kind === "evergreen");

  // The destination the dates were computed in, named by its own registry key — the same key the
  // dates came from, which is what stops the caption and the table from disagreeing (§14 Q4).
  // Absent when no destination is live, in which case `dated` is empty and neither renders.
  const dateCountry =
    view.occasionsDateCountryKey === undefined
      ? undefined
      : registryLabel(t, view.occasionsDateCountryKey);

  return (
    <Container as="main" id="main" data-fo-occasions-index>
      <Stack gap="xl" className="py-xl">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        <Stack gap="md">
          <Display as="h1" size="display-s">
            {index("h1")}
          </Display>
          <Text measure>{index("intro")}</Text>
        </Stack>

        {dated.length === 0 || dateCountry === undefined ? null : (
          <Stack as="section" gap="md" data-fo-occasions-dated={dated.length}>
            <Stack gap="xs">
              <Label>{index("datedEyebrow")}</Label>
              <Display as="h2" size="2xl">
                {index("datedHeading")}
              </Display>
            </Stack>
            <table className="w-full border-collapse text-sm">
              <caption className="label text-ink-subtle pb-sm text-start">
                {index("datedCaption", { country: dateCountry })}
              </caption>
              <thead>
                <tr>
                  <th
                    className="border-rule py-sm pe-md text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                    scope="col"
                  >
                    {index("occasionColumn")}
                  </th>
                  <th
                    className="border-rule py-sm text-ink-subtle border-b text-start text-xs font-semibold uppercase"
                    scope="col"
                  >
                    {index("dateColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dated.map((entry) => (
                  <tr key={entry.key}>
                    <th
                      className="border-rule py-sm pe-md border-b text-start font-semibold"
                      scope="row"
                    >
                      <a
                        className="hover:text-accent"
                        data-fo-occasion={entry.key}
                        href={entry.href}
                      >
                        {entry.name}
                      </a>
                    </th>
                    <td className="border-rule py-sm border-b">
                      {/* `nextDate` is non-null for every member of this group by construction;
                          the guard is the type's, not a second rule about dates. */}
                      {entry.nextDate === null
                        ? null
                        : formatDate(
                            instantOf(entry.nextDate),
                            code,
                            "calendarDate",
                            "UTC",
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Text measure size="sm" tone="subtle">
              {index("dateSource")}
            </Text>
          </Stack>
        )}

        {undated.length === 0 ? null : (
          <Stack
            as="section"
            gap="md"
            data-fo-occasions-undated={undated.length}
          >
            <Display as="h2" size="2xl">
              {index("undatedHeading")}
            </Display>
            {dateCountry === undefined ? null : (
              <Text measure tone="muted">
                {index("undatedNote", { country: dateCountry })}
              </Text>
            )}
            <ul className="gap-sm flex list-none flex-wrap p-0">
              {undated.map((entry) => (
                <EntryLink entry={entry} key={entry.key} />
              ))}
            </ul>
          </Stack>
        )}

        {everyday.length === 0 ? null : (
          <Stack
            as="section"
            gap="md"
            data-fo-occasions-everyday={everyday.length}
          >
            <Stack gap="xs">
              <Label>{index("everydayEyebrow")}</Label>
              <Display as="h2" size="2xl">
                {index("everydayHeading")}
              </Display>
            </Stack>
            <Text measure tone="muted">
              {index("everydayNote")}
            </Text>
            <ul className="gap-sm flex list-none flex-wrap p-0">
              {everyday.map((entry) => (
                <EntryLink entry={entry} key={entry.key} />
              ))}
            </ul>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
