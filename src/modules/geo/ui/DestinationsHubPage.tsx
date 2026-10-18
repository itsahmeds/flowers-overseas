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
  Eyebrow,
  Icon,
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

/** The guide state's key: the one state a destination with no delivery has (spec 007 R6). */
const GUIDE_STATE_KEY = "destinations.state.guideNotDelivering";

/**
 * The first screen's pills (spec 004 §14 A23 **R6**, A24 clause 2; TASK-188): the same list as the
 * page below, in the same order, with the same links (spec 007 AC-7, AC-17, AC-20) — a link where
 * the guide exists, plain text where it does not. Each pill names the country and, in the fine
 * line, its region (`all-destinations-desktop`) or, for a live destination, its live state.
 */
function DestinationPill({
  destination,
  country,
  detail,
}: {
  readonly destination: HubDestinationView;
  readonly country: string;
  readonly detail: string | undefined;
}): ReactElement {
  const pill =
    "inline-flex min-h-(--target-min) flex-none items-baseline gap-[8px] whitespace-nowrap rounded-full bg-card px-[16px] py-[10px] text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-rule)]";
  const body = (
    <>
      <span className="font-bold">{country}</span>
      {detail === undefined ? null : (
        <span className="text-ink-subtle text-xs">{detail}</span>
      )}
    </>
  );
  return destination.href === undefined ? (
    <span className={pill} data-fo-hub-pill={destination.iso2}>
      {body}
    </span>
  ) : (
    <a
      className={`${pill} hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]`}
      data-fo-hub-pill={destination.iso2}
      href={destination.href}
    >
      {body}
    </a>
  );
}

/** The state as one quiet text line (R6; the round-2 `.state-q`): a dot and the words. */
function StateLine({
  text,
  live,
  hook,
}: {
  readonly text: string;
  readonly live: boolean;
  readonly hook?: Readonly<Record<`data-${string}`, string>>;
}): ReactElement {
  return (
    <span
      className="text-ink-muted inline-flex items-center gap-[8px] text-sm"
      {...(hook ?? {})}
    >
      <span
        aria-hidden="true"
        className={`size-[8px] flex-none rounded-full ${live ? "bg-success" : "bg-ink-subtle"}`}
      />
      {text}
    </span>
  );
}

export function DestinationsHubPage({
  locale,
}: DestinationsHubPageProps): ReactElement {
  const t = useTranslations();
  const hub = useTranslations("destinationsHub");
  const footer = useTranslations("footer");
  const view = hubView(locale, (nameKey) => registryLabel(t, nameKey));
  const named = (destination: HubDestinationView): string =>
    countryName(t, destination.nameKey);
  // R6: while any destination is a guide, the first screen says so in real text; when none is,
  // no guide-state line renders (and a live one never reads as a guide, or the reverse).
  const anyGuide = view.destinations.some(
    (destination) => destination.stateKey === GUIDE_STATE_KEY,
  );
  const regionOf = (destination: HubDestinationView): string | undefined => {
    const region = view.regions.find((entry) =>
      entry.destinations.some((member) => member.iso2 === destination.iso2),
    );
    return region === undefined
      ? undefined
      : registryLabel(t, region.headingKey);
  };

  return (
    <Container as="main" id="main" data-fo-destinations-hub={view.locale}>
      <div className="pb-(--section-fluid)">
        {/* The first screen (spec 004 §14 A23 R6, A24 clause 2; `all-destinations-*`; TASK-188).
            From `md` up: on the cream band, one white card holding the eyebrow, the `<h1>` and the
            state line, with the destinations as pills on its end side. Below `md`: the back link,
            the `<h1>`, P4's one line and the destinations as ruled rows, each with its own state
            line. No photograph: the LCP element is the `<h1>` (A23 clause 7). */}
        <section
          aria-labelledby="destinations-h1"
          className="md:bg-paper-2 flow-root md:pb-[20px] md:shadow-[0_0_0_100vmax_var(--color-paper-2)] md:[clip-path:inset(0_-100vmax)]"
          data-fo-hub-band
          data-register="cream"
        >
          <CorridorBreadcrumb crumbs={view.breadcrumb} />
          <div className="md:bg-card md:rounded-letter md:shadow-letter grid grid-cols-1 items-start gap-[8px] pt-[8px] md:mt-[28px] md:grid-cols-12 md:gap-x-[32px] md:px-[52px] md:pt-[48px] md:pb-[40px]">
            <div className="grid justify-items-start gap-[8px] md:col-span-6 md:gap-[18px]">
              <Eyebrow className="max-md:hidden">
                {footer("link.destinations")}
              </Eyebrow>
              <Display as="h1" id="destinations-h1" size="display">
                {/* The value marks the home heading's italic phrase (spec 004 §14
                    A-founder-2026-10-14d; TASK-231). This page's heading is not on that list, so
                    the marker renders as plain words here. */}
                {hub.rich("h1", { em: (chunks) => chunks })}
              </Display>
              {anyGuide ? (
                <span className="max-md:hidden" data-fo-hub-guide-state>
                  <StateLine live={false} text={t(GUIDE_STATE_KEY)} />
                </span>
              ) : null}
              <Text as="p" size="sm" tone="subtle" className="md:hidden">
                {hub("phoneIntro")}
              </Text>
            </div>
            {view.empty ? null : (
              <ul
                aria-label={footer("link.destinations")}
                className="hidden list-none flex-wrap gap-[8px] p-0 md:col-span-6 md:flex"
                data-fo-hub-pills
              >
                {view.destinations.map((destination) => (
                  <li key={destination.iso2}>
                    <DestinationPill
                      country={named(destination)}
                      destination={destination}
                      detail={
                        destination.stateKey === GUIDE_STATE_KEY
                          ? regionOf(destination)
                          : registryLabel(t, destination.stateKey)
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {view.empty ? null : (
            <ul
              aria-label={footer("link.destinations")}
              className="border-rule mt-[16px] list-none border-t p-0 md:hidden"
              data-fo-hub-phone-rows
            >
              {view.destinations.map((destination) => {
                const state = registryLabel(t, destination.stateKey);
                const live = destination.stateKey !== GUIDE_STATE_KEY;
                const row = (
                  <>
                    <Display as="span" size="xl" className="text-[21px]">
                      {named(destination)}
                    </Display>
                    <StateLine live={live} text={state} />
                  </>
                );
                return (
                  <li className="border-rule border-b" key={destination.iso2}>
                    {destination.href === undefined ? (
                      <div className="grid gap-[2px] py-[14px]">{row}</div>
                    ) : (
                      <a
                        className="text-ink relative grid min-h-(--target-min) gap-[2px] py-[14px] pe-[28px] [text-decoration:none]"
                        data-fo-hub-row={destination.iso2}
                        href={destination.href}
                      >
                        {row}
                        <Icon
                          className="text-ink-subtle absolute end-[4px] top-1/2 -translate-y-1/2"
                          name="chevron-end"
                          size={18}
                        />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* The lede, directly under the first screen (A24 clause 2: over two lines, it moves). */}
        <div className="pt-[32px] max-md:hidden md:pt-[28px]" data-fo-hub-lede>
          <Text size="lg" tone="muted" className="max-w-(--measure-lede)">
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
            className={`max-md:hidden ${index === 0 ? "pt-[56px]" : "pt-[48px] md:pt-(--section-fluid)"}`}
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
