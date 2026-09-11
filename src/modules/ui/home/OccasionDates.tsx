/**
 * `OccasionDates` — the artboards' "Coming up in Poland" strip (design round 6, spec 004 §13's
 * 2026-09-08 resolution note, `plan/03` §7; TASK-053).
 *
 * Four dates the destination actually keeps — All Saints, Andrzejki, Wigilia, Women's Day — each
 * with the order-by cutoff the founder's design prints, on the paper-2 band between the priced
 * rows and the occasion grid. It is the section the benchmark study found on 1-800-Flowers and
 * nowhere in the European field: a destination's own calendar, printed in the buyer's language.
 *
 * **Every date and every cutoff is data** (`src/config/occasions.ts`), and every label is
 * formatted by spec 003's formatters in the **recipient's** zone: "Sun, 1 Nov" is the calendar
 * date in Warsaw and "14:00 CET" is the wall clock in Warsaw, named, which is `plan/03` §7's rule
 * and the thing that makes a cutoff honest for a buyer reading it in Madrid. Nothing is computed:
 * no "days left", no "next occasion", no clock — this document is ISR-cached, and a countdown
 * rendered at revalidation time is a wrong number served for an hour (the reasoning
 * `FinderCard`'s date field records).
 *
 * Two things the artboards draw that are deliberately not here:
 *
 *  - **the rows are not links.** They point at occasion pages spec 008 has not published, and the
 *    "unpublished target renders as text" rule holds here as everywhere else (AC-14);
 *  - **the mobile artboard's shortened names.** It prints "All Saints' Day" where the desktop one
 *    prints "All Saints' Day · Wszystkich Świętych". Rendering both and hiding one would put the
 *    string in the accessibility tree twice; one name is rendered, and the endonym stays in it,
 *    because the endonym is the half a Polish recipient's family would use.
 *
 * The band is the desktop artboard's two-column shape — a 300 px "Coming up in Poland" heading
 * column beside the 4-up date grid, vertically centred (`Grid columns="1-aside"`, the width
 * written once in the primitive) — and the mobile artboard's stack of the same two parts, 2-up
 * (`/review 53` required change 2).
 *
 * The cutoff line itself is hidden below the `md` breakpoint, exactly as the mobile artboard
 * omits it — the one responsive difference in this section, and it removes no information the
 * page does not carry elsewhere (the finder prints the standing cutoff above it).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Grid, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";
import { occasionDateViews } from "./occasion-model.ts";

/** See `SiteHeader`'s twin: the registries hold dotted keys, not typed literals. */
type Translator = ReturnType<typeof useTranslations>;
type LabelTranslator = (key: string) => string;

function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

/**
 * The destination whose calendar the Phase-0 home prints. One country is live
 * (`src/config/countries.ts`), so one calendar is honest; spec 007 gives each corridor page its
 * own strip from the same projection.
 */
const DATED_DESTINATION = "PL";

const HEADING_ID = "occasion-dates-heading";

export interface OccasionDatesProps {
  readonly locale: string;
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
}

export function OccasionDates({
  locale,
  headingLevel = "h2",
}: OccasionDatesProps): ReactElement {
  const t = useTranslations();
  const home = useTranslations("home");
  const dates = occasionDateViews(locale, DATED_DESTINATION);

  return (
    <Grid
      as="section"
      columns="1-aside"
      gap="md"
      className={`bg-surface-raised border-rule py-lg md:gap-xl border-y md:items-center ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-occasion-dates
    >
      <Stack gap="xs">
        <Label>{home("dates.eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="xl">
          {home("dates.heading")}
        </Display>
      </Stack>
      <Grid as="ul" columns="2-4" gap="md">
        {dates.map((date) => (
          <Stack
            as="li"
            gap="none"
            key={date.id}
            className="border-rule ps-md border-s"
            data-fo-occasion-date={date.id}
          >
            <Text as="span" size="sm" className="font-semibold">
              {date.date}
            </Text>
            <Text as="span" size="sm" tone="muted">
              {registryLabel(t, date.nameKey)}
            </Text>
            {date.orderBy === undefined ? (
              // The schema guarantees exactly one of the two, so the note is present here; the
              // guard is the type system's, not a fallback that could print an empty line.
              date.noteKey === undefined ? null : (
                <Text as="span" size="xs" tone="subtle">
                  {registryLabel(t, date.noteKey)}
                </Text>
              )
            ) : (
              // The artboards print the cutoff on the desktop band only; the mobile band is two
              // lines per date. Hidden rather than omitted so the two breakpoints render the same
              // component and the same data.
              <Text
                as="span"
                size="xs"
                tone="subtle"
                className="hidden md:block"
              >
                {home("dates.orderBy", {
                  date: date.orderBy.date,
                  time: date.orderBy.time,
                })}
              </Text>
            )}
          </Stack>
        ))}
      </Grid>
    </Grid>
  );
}
