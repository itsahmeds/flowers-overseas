/**
 * The all-destinations hub (spec 007 §5.3's hub row, AC-17, AC-19, AC-20, AC-24;
 * `docs/design/wireframes/all-destinations-desktop.dc.html` and `-mobile`; TASK-092).
 *
 * The artboards' block order, top to bottom: breadcrumb · `h1` · intro · one section per region
 * that has something to link to, each a heading and a grid of destinations · and, in a locale
 * where no destination has a page, the whole-page empty state instead of the region sections.
 *
 * Two states per destination, and nothing between them:
 *
 *  - **with a page** — a link to its corridor, its state chip, the guide's own authored teaser
 *    (`seoDescription`, so the hub never describes a country in words nobody reviewed) and the
 *    read-the-guide line;
 *  - **without a page in this locale** — plain text with one state line. No `<a>`, no `href`, no
 *    disabled link, no "coming soon" (spec 004 AC-14 extended to this page).
 *
 * Which of the two a destination is in is `hubView()`'s answer, not this component's, so a
 * `guidePublished` flip moves a destination between them with no template edit (AC-7).
 *
 * What is deliberately absent: no price (§13 Q2), no count of countries, no map, no flag, no
 * photo, no "featured" section (founder ruling 2026-09-15 (c)), no waiting-list field (§13 Q4)
 * and no client island — the page renders with JavaScript disabled (AC-24).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatList } from "../../i18n/index.ts";
import {
  Chip,
  Container,
  Display,
  Grid,
  Label,
  Stack,
  Text,
} from "../../ui/index.ts";
import { type HubDestinationView, hubView } from "../hub.ts";

import { CorridorBreadcrumb } from "./CorridorBreadcrumb.tsx";
import { countryName, localeCode, registryLabel } from "./labels.ts";

export interface DestinationsHubPageProps {
  /** The locale the URL names. The view model is built here, from the catalogue this component
   * already holds — `DestinationsGrid`'s shape, so the route stays thin (`plan/01` §5). */
  readonly locale: string;
}

/** The two destination states of §5.3, drawn from one loop so they cannot drift apart. */
function Destination({
  destination,
  country,
  noGuide,
  readGuide,
  state,
}: {
  readonly destination: HubDestinationView;
  readonly country: string;
  /** The one state line a destination without a page carries — same words on every row. */
  readonly noGuide: string;
  readonly readGuide: string;
  readonly state: string;
}): ReactElement {
  if (destination.href === undefined) {
    return (
      <Stack
        as="li"
        className="border-rule p-md border border-dashed"
        data-fo-hub-destination={destination.iso2}
        data-fo-hub-linked="false"
        gap="xs"
      >
        <Display as="span" size="xl" className="text-ink-muted">
          {country}
        </Display>
        <Text as="span" size="sm" tone="muted">
          {noGuide}
        </Text>
      </Stack>
    );
  }
  return (
    <Stack
      as="li"
      className="border-rule p-md border"
      data-fo-hub-destination={destination.iso2}
      data-fo-hub-linked="true"
      gap="xs"
    >
      <a className="underline underline-offset-4" href={destination.href}>
        <Display as="span" size="xl">
          {country}
        </Display>
      </a>
      <Chip className="self-start" tone="muted">
        {state}
      </Chip>
      {destination.teaser === undefined ? null : (
        <Text as="span" size="sm" tone="muted">
          {destination.teaser}
        </Text>
      )}
      <Text as="span" size="xs" tone="accent">
        {readGuide}
      </Text>
    </Stack>
  );
}

export function DestinationsHubPage({
  locale,
}: DestinationsHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("destinationsHub");
  const view = hubView(locale, (nameKey) => registryLabel(t, nameKey));
  const named = (destination: HubDestinationView): string =>
    countryName(t, destination.nameKey);

  return (
    <Container as="main" id="main" data-fo-destinations-hub={view.locale}>
      <Stack gap="xl" className="py-xl">
        <CorridorBreadcrumb crumbs={view.breadcrumb} />

        <Stack gap="md">
          <Display as="h1" size="display-s">
            {hub("h1")}
          </Display>
          <Text measure>{hub("intro")}</Text>
        </Stack>

        {/* The whole-page empty state: every destination as text, named in one sentence and then
            listed with its state line. It is a page, not a 404 — the URL is in the locale's own
            navigation (the artboards' "Empty states" block). */}
        {view.empty ? (
          <Stack as="section" gap="md" data-fo-hub-empty>
            <Text measure>
              {hub("emptyBody", {
                destinations: formatList(
                  view.destinations.map(named),
                  localeCode(view.locale),
                ),
              })}
            </Text>
            <Grid as="ul" columns="1-3" gap="md" className="list-none p-0">
              {view.destinations.map((destination) => (
                <Destination
                  country={named(destination)}
                  destination={destination}
                  key={destination.iso2}
                  noGuide={hub("noGuide", { country: named(destination) })}
                  readGuide={hub("readGuide")}
                  state={registryLabel(t, destination.stateKey)}
                />
              ))}
            </Grid>
          </Stack>
        ) : null}

        {view.regions.map((region) => (
          <Stack
            as="section"
            data-fo-hub-region={region.region}
            gap="md"
            key={region.region}
          >
            <Stack gap="xs">
              <Label>
                {hub("regionLabel", {
                  region: registryLabel(t, region.headingKey),
                })}
              </Label>
              <Display as="h2" size="2xl">
                {registryLabel(t, region.headingKey)}
              </Display>
            </Stack>
            <Grid as="ul" columns="1-3" gap="md" className="list-none p-0">
              {region.destinations.map((destination) => (
                <Destination
                  country={named(destination)}
                  destination={destination}
                  key={destination.iso2}
                  noGuide={hub("noGuide", { country: named(destination) })}
                  readGuide={hub("readGuide")}
                  state={registryLabel(t, destination.stateKey)}
                />
              ))}
            </Grid>
          </Stack>
        ))}
      </Stack>
    </Container>
  );
}
