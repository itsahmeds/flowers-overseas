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
import { Chip, Container, Display, Eyebrow, Text } from "../../ui/index.ts";
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
  // v2 `.dest` (the all-destinations artboards): one ruled row per destination — the country in
  // the display face on the start side (220 px from `md` up), the state chip and the teaser in
  // the middle, the cornflower "Read the guide" on the end side; one column on a phone.
  const row =
    "border-rule grid grid-cols-1 items-baseline gap-[6px] border-b py-[20px] md:grid-cols-[220px_minmax(0,1fr)_auto] md:gap-x-[32px] md:py-lg";
  if (destination.href === undefined) {
    return (
      <li
        className={row}
        data-fo-hub-destination={destination.iso2}
        data-fo-hub-linked="false"
      >
        <Display as="span" size="xl" className="text-ink-muted md:text-[30px]">
          {country}
        </Display>
        <Text as="span" size="md" tone="muted">
          {noGuide}
        </Text>
      </li>
    );
  }
  const nameId = `hub-destination-${destination.iso2.toLowerCase()}`;
  return (
    <li data-fo-hub-destination={destination.iso2} data-fo-hub-linked="true">
      <a
        aria-labelledby={nameId}
        className={`${row} group text-ink [text-decoration:none]`}
        href={destination.href}
      >
        <Display
          as="span"
          id={nameId}
          size="xl"
          className="decoration-1 underline-offset-[5px] group-hover:underline md:text-[30px] md:leading-[1.1]"
        >
          {country}
        </Display>
        <span className="gap-sm grid">
          <Chip className="self-start justify-self-start" tone="muted">
            {state}
          </Chip>
          {destination.teaser === undefined ? null : (
            <Text as="span" size="md" tone="muted">
              {destination.teaser}
            </Text>
          )}
        </span>
        <span className="link whitespace-nowrap">{readGuide}</span>
      </a>
    </li>
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
      <div className="pb-2xl">
        <CorridorBreadcrumb crumbs={view.breadcrumb} />

        {/* v2 `.shop-intro`: the one `<h1>` and the lede. */}
        <div className="pt-lg md:pt-xl pb-[36px] md:pb-[56px]">
          <Display as="h1" size="display">
            {hub("h1")}
          </Display>
          <Text
            size="lg"
            tone="muted"
            className="mt-[18px] max-w-(--measure-lede)"
          >
            {hub("intro")}
          </Text>
        </div>

        {/* The whole-page empty state: every destination as text, named in one sentence and then
            listed with its state line. It is a page, not a 404 — the URL is in the locale's own
            navigation (the artboards' "Empty states" block). */}
        {view.empty ? (
          <section data-fo-hub-empty>
            <Text measure>
              {hub("emptyBody", {
                destinations: formatList(
                  view.destinations.map(named),
                  localeCode(view.locale),
                ),
              })}
            </Text>
            <ul className="border-rule mt-lg list-none border-t p-0">
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
            </ul>
          </section>
        ) : null}

        {view.regions.map((region, index) => (
          <section
            aria-labelledby={`hub-region-${region.region}`}
            className={index === 0 ? "" : "md:pt-2xl pt-[48px]"}
            data-fo-hub-region={region.region}
            key={region.region}
          >
            <Eyebrow className="mb-[14px]">
              {hub("regionLabel", {
                region: registryLabel(t, region.headingKey),
              })}
            </Eyebrow>
            <Display
              as="h2"
              size="2xl"
              id={`hub-region-${region.region}`}
              className="mb-lg"
            >
              {registryLabel(t, region.headingKey)}
            </Display>
            <ul className="border-rule list-none border-t p-0">
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
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
