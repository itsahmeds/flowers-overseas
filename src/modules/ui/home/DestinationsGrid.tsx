/**
 * **v2** (spec 004 §14 A21; TASK-177; `home-*.dc.html` `.dest-chips`): the intro beside a wrap of
 * chips. Every chip links to its destination's **guide** (plan/02 §11, spec 004 Q11/A2; PR 174
 * review R2); the guide links the shop root. Where a locale has no guide, the featured destination's
 * (Poland's) chip links its **shop root** (`shopHref`, from the page) instead. Only a
 * destination taking orders (`deliveryDatesOpen()`) is poppy and says "Delivering now"; every
 * other chip, Poland's included until a florist is signed, is neutral and says "Ordering opens
 * soon" (spec 007 §14 A-founder-2026-10-14c clause 2; TASK-239). The state comes from the
 * provider's `stateKey` and `delivering`, never from `country.status` (AC-33). A
 * destination with neither page is a chip-shaped label with no link (never a dead control, A20).
 * The artboard draws Poland's chip to the shop root: recorded in `docs/design/README.md`.
 *
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
 *  - **Poland** first, the featured destination. Only a `live` destination may name cities, and
 *    none is live today — `countries.ts` refuses the combination for anything else, so naming a
 *    town we cannot deliver to is a failed parse rather than a copy review (`plan/10` §3).
 *  - **Every destination** where ordering is not open says *Ordering opens soon*. The state is a **word, not
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

import { Chip } from "../primitives/Chip.tsx";
import { Display, Eyebrow, HEADING_EM } from "../primitives/typography.tsx";

import {
  type DestinationStatusProvider,
  getDestinationStatusProvider,
} from "./destination-status-provider.ts";
import { HOME_BLEED, HOME_SECTION } from "./HomeHero.tsx";

type LabelTranslator = (key: string) => string;

/** The id of the locale home's destinations section (the hub of every "where" question). */
export const DESTINATIONS_ANCHOR = "destinations";

const HEADING_ID = "destinations-heading";

export interface DestinationsGridProps {
  readonly locale: string;
  readonly headingLevel?: "h2" | "h3";
  readonly provider?: DestinationStatusProvider;
  /**
   * The delivering destination's shop root in this locale (`corridorShopEntry()`, from the
   * page), used only where that destination has no guide in this locale.
   */
  readonly shopHref?: string;
}

export function DestinationsGrid({
  locale,
  headingLevel = "h2",
  provider,
  shopHref,
}: DestinationsGridProps): ReactElement {
  const t = useTranslations() as unknown as LabelTranslator;
  const home = useTranslations("home");
  const hub = useTranslations("destinationsHub");
  const source = provider ?? getDestinationStatusProvider();
  // The provider owns the order (featured first, then collated); the grid does not re-sort.
  const destinations = source.list(locale, (nameKey) => t(nameKey));

  return (
    <section
      className={`${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-destinations
      data-fo-reveal=""
      id={DESTINATIONS_ANCHOR}
    >
      <div className="md:gap-2xl grid grid-cols-1 items-center gap-[32px] md:grid-cols-[5fr_6fr]">
        <div>
          <Eyebrow className="mb-[14px]">
            {home("destinations.eyebrow")}
          </Eyebrow>
          <Display as={headingLevel} id={HEADING_ID} size="display-s">
            {hub.rich("h1", HEADING_EM)}
          </Display>
          <p className="text-ink-muted text-body mt-[18px] max-w-[40ch] leading-[1.5] md:text-[21px]">
            {home("destinations.body")}
          </p>
        </div>
        {/* The phone draws one row that scrolls (`.M .dest-chips`, spec 004 AC-49; TASK-232, QA-3
            D-12), named by the heading; from `md` the chips wrap. With no chip a link, the row
            takes the focus itself so the keyboard can scroll it. */}
        <ul
          aria-labelledby={HEADING_ID}
          className="m-0 flex list-none gap-[10px] p-0 max-md:-mx-(--gutter-s) max-md:snap-x max-md:scroll-px-(--gutter-s) max-md:[scrollbar-width:none] max-md:overflow-x-auto max-md:overscroll-x-contain max-md:px-(--gutter-s) md:flex-wrap"
          data-fo-destination-chips
          {...(destinations.some(
            (destination) =>
              (destination.href ??
                (destination.featured ? shopHref : undefined)) !== undefined,
          )
            ? {}
            : { tabIndex: 0 })}
        >
          {destinations.map((destination) => {
            // Every chip leads to its guide (plan/02 §11, spec 004 Q11/A2): the guide is the
            // page that ranks for "send flowers to Poland", and it links the shop root. Only
            // where a locale has no guide does the featured chip (Poland's) go to the shop root.
            const href =
              destination.href ?? (destination.featured ? shopHref : undefined);
            return (
              <li
                key={destination.iso2}
                className="flex-none snap-start"
                data-fo-destination={destination.iso2}
              >
                <Chip
                  tone={destination.delivering ? "accent" : "neutral"}
                  {...(href === undefined ? {} : { href })}
                >
                  {t(destination.nameKey)}
                  <small
                    className={[
                      "text-fine font-normal",
                      destination.delivering
                        ? "text-on-accent"
                        : "text-ink-subtle",
                    ].join(" ")}
                  >
                    {t(destination.stateKey)}
                  </small>
                </Chip>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
