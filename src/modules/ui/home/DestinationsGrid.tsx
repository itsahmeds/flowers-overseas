/**
 * **v3** (spec 004 §14 A-founder-2026-10-24a items 4.7 and 13; TASK-387; `home-*.dc.html`,
 * `.dest-chips`): the eyebrow, the heading and the line, then a wrap of chips (one sideways row on
 * a phone). Every destination by the same rule, from the registry: each chip links its own
 * country's guide where one exists in this locale (the visitor's choice made by clicking it, so a
 * direct link, item 3), in the one country order (`sortWeight`, then the name). No destination is
 * special-cased: the "featured destination's shop root" fallback and its "Poland first" order left
 * with the commerce structure (AC-73). Only a destination taking delivery dates
 * (`deliveryDatesOpen()`) is poppy and says "Delivering now"; a destination with no page is a
 * chip-shaped label with no link (never a dead control, A20).
 *
 * The id is `DESTINATIONS_ANCHOR`, the target older links into the home name.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Chip } from "../primitives/Chip.tsx";
import { Display, Eyebrow, HEADING_EM } from "../primitives/typography.tsx";

import {
  type DestinationStatusProvider,
  getDestinationStatusProvider,
} from "./destination-status-provider.ts";
import { HOME_BLEED, HOME_V3_SECTION } from "./HomeHero.tsx";

type LabelTranslator = (key: string) => string;

/** The id of the locale home's destinations section (the hub of every "where" question). */
export const DESTINATIONS_ANCHOR = "destinations";

const HEADING_ID = "destinations-heading";

export interface DestinationsGridProps {
  readonly locale: string;
  readonly headingLevel?: "h2" | "h3";
  readonly provider?: DestinationStatusProvider;
}

export function DestinationsGrid({
  locale,
  headingLevel = "h2",
  provider,
}: DestinationsGridProps): ReactElement {
  const t = useTranslations() as unknown as LabelTranslator;
  const home = useTranslations("home");
  const hub = useTranslations("destinationsHub");
  const source = provider ?? getDestinationStatusProvider();
  // The provider owns the order (the one country order); the grid does not re-sort.
  const destinations = source.list(locale, (nameKey) => t(nameKey));

  return (
    <section
      className={`bg-surface-raised ${HOME_V3_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-destinations
      id={DESTINATIONS_ANCHOR}
    >
      <Eyebrow className="mb-[8px] text-xs">
        {home("destinations.eyebrow")}
      </Eyebrow>
      <Display as={headingLevel} id={HEADING_ID} size="2xl" className="m-0">
        {hub.rich("h1", HEADING_EM)}
      </Display>
      <p className="text-ink-muted m-0 mt-[6px] max-w-[70ch] text-sm">
        {home("destinations.body")}
      </p>
      {/* The phone draws one row that scrolls (`.M .dest-chips`, spec 004 AC-49; TASK-232, QA-3
          D-12), named by the heading; from `md` the chips wrap. With no chip a link, the row
          takes the focus itself so the keyboard can scroll it. */}
      <ul
        aria-labelledby={HEADING_ID}
        className="m-0 mt-[18px] flex list-none gap-[10px] p-0 max-md:-mx-(--gutter-s) max-md:snap-x max-md:scroll-px-(--gutter-s) max-md:[scrollbar-width:none] max-md:overflow-x-auto max-md:overscroll-x-contain max-md:px-(--gutter-s) md:flex-wrap"
        data-fo-destination-chips
        {...(destinations.some((destination) => destination.href !== undefined)
          ? {}
          : { tabIndex: 0 })}
      >
        {destinations.map((destination) => (
          <li
            key={destination.iso2}
            className="flex-none snap-start"
            data-fo-destination={destination.iso2}
          >
            <Chip
              tone={destination.delivering ? "accent" : "neutral"}
              {...(destination.href === undefined
                ? {}
                : { href: destination.href })}
            >
              {t(destination.nameKey)}
              <small
                className={[
                  "text-fine font-normal",
                  destination.delivering ? "text-on-accent" : "text-ink-subtle",
                ].join(" ")}
              >
                {t(destination.stateKey)}
              </small>
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}
