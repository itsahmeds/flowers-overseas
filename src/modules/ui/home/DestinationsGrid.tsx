/**
 * `DestinationsGrid` — the artboards' destinations grid (spec 004 §13's 2026-09-08 resolution
 * note "destinations grid with live/guide status", §5.3 `DestinationPicker`, §14 A5, **AC-11**,
 * **AC-14**; TASK-054; `docs/design/homepage-v1/homepage-desktop.dc.html`,
 * `homepage-mobile.dc.html`).
 *
 * It replaces TASK-052's `DestinationList` stand-in and **inherits its id** (`DESTINATIONS_ANCHOR`
 * — the target the finder's `Continue` submits to and the id the country field's summary refers
 * to), so the finder keeps working with no edit to `finder-model.ts`.
 *
 * What the grid draws, from `DestinationStatusProvider` and nothing else:
 *
 *  - **Poland**, spanning the row on mobile as the artboard draws it, with the state word
 *    *Delivering now* and its five cities as text (`destinations.pl.cities`). Only a `live`
 *    destination may name cities — `countries.ts` refuses the combination for anything else, so
 *    naming a town we cannot deliver to is a failed parse rather than a copy review (`plan/10`
 *    §3).
 *  - **The six guide destinations**, each with *Guide · waiting list*. The state is a **word, not
 *    a colour** (§5.3), which is also why nothing here carries a status dot.
 *  - **"Somewhere else?"** as the last cell: copy only. A waiting-list email field is a new
 *    personal-data flow and a RoPA row (010/016 own it), and an inert input that collects nothing
 *    is a dark pattern, so the cell says what is true — we open a country when we have florists
 *    there — and asks the reader for nothing. The canvas's "Tell us where you need us next" is
 *    deliberately not shipped: there is no channel behind it yet (recorded in the PR body).
 *
 * **Nothing in here is a link while every corridor page is unpublished**, which is the half of
 * AC-14 this section owns. The `href` can only come from `isCorridorPagePublished()` through the
 * provider, so spec 007 flipping the flag turns the same loop into navigation with no template
 * edit — AC-11's "a country is data" proof.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Grid, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { DESTINATIONS_ANCHOR } from "./finder-model.ts";
import {
  type DestinationStatusProvider,
  getDestinationStatusProvider,
} from "./destination-status-provider.ts";
import { HOME_BLEED } from "./HomeHero.tsx";

/** See `SiteHeader`'s twin: the registries hold dotted keys, not typed literals. */
type Translator = ReturnType<typeof useTranslations>;
type LabelTranslator = (key: string) => string;

/** Resolve a registry key (`destinations.pl.cities`). The one cast in this file. */
function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

const HEADING_ID = "destinations-heading";

export interface DestinationsGridProps {
  readonly locale: string;
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
  /** The gallery's populated state — see `TrendingRow`'s twin for why it is a prop. */
  readonly provider?: DestinationStatusProvider;
}

export function DestinationsGrid({
  locale,
  headingLevel = "h2",
  provider,
}: DestinationsGridProps): ReactElement {
  const t = useTranslations();
  const home = useTranslations("home");
  const source = provider ?? getDestinationStatusProvider();
  const destinations = source.list(locale, (nameKey) =>
    registryLabel(t, nameKey),
  );

  return (
    <Grid
      as="section"
      columns="1-aside"
      gap="2xl"
      className={`border-rule py-2xl border-t ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-destinations
      id={DESTINATIONS_ANCHOR}
    >
      <Stack gap="md">
        <Label>{home("destinations.eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="2xl">
          {home("destinations.heading")}
        </Display>
        <Text measure size="sm" tone="muted">
          {home("destinations.body")}
        </Text>
      </Stack>
      {/* The artboard's rule-bounded cells: the grid draws its own block-start and inline-start
          rules and every cell closes itself, so the table of countries needs no table. */}
      <Grid
        as="ul"
        columns="2-3"
        gap="none"
        className="border-rule border-s border-t"
      >
        {destinations.map((destination) => (
          <Stack
            as="li"
            gap="xs"
            key={destination.iso2}
            className={[
              "border-rule p-lg border-e border-b",
              // Poland spans the row on the mobile artboard, because it is the one destination
              // with cities to name and they do not fit in half a 390 px viewport.
              destination.delivering ? "col-span-2 md:col-span-1" : "",
              destination.delivering ? "bg-surface-muted" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-fo-destination={destination.iso2}
          >
            {destination.href === undefined ? (
              <Display as="span" size="xl">
                {registryLabel(t, destination.nameKey)}
              </Display>
            ) : (
              // The published branch: a link, from the same loop, with no template edit — the
              // "a country is data" proof of AC-11.
              <a
                className="underline underline-offset-4"
                href={destination.href}
              >
                <Display as="span" size="xl">
                  {registryLabel(t, destination.nameKey)}
                </Display>
              </a>
            )}
            <Text
              as="span"
              size="sm"
              tone={destination.delivering ? "accent" : "subtle"}
              className={destination.delivering ? "font-medium" : ""}
            >
              {registryLabel(t, destination.stateKey)}
            </Text>
            {destination.citiesKey === undefined ? null : (
              <Text as="span" size="xs" tone="subtle">
                {registryLabel(t, destination.citiesKey)}
              </Text>
            )}
          </Stack>
        ))}
        {/* Copy only: no field, no button, nothing to submit. */}
        <Stack
          as="li"
          gap="xs"
          className="border-rule p-lg col-span-2 justify-center border-e border-b"
          data-fo-destinations-elsewhere
        >
          <Text as="span" size="sm" className="font-medium">
            {home("destinations.elsewhere.title")}
          </Text>
          <Text as="span" size="sm" tone="subtle">
            {home("destinations.elsewhere.body")}
          </Text>
        </Stack>
      </Grid>
    </Grid>
  );
}
