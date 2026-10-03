/**
 * **v2** (spec 004 §14 A21; TASK-177; `home-*.dc.html` `.dest-chips`): the intro beside a wrap of
 * chips. The delivering destination is the poppy chip and links to its **shop root** where that
 * exists (`shopHref`, from the page), else to its guide; every other destination is a neutral
 * chip to its guide with its state in words. A destination with neither page is a chip-shaped
 * label with no link (never a dead control, A20).
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
 *  - **Poland**, spanning the row on mobile as the artboard draws it, with the state word
 *    *Delivering now* and its five cities as text (`destinations.pl.cities`). Only a `live`
 *    destination may name cities — `countries.ts` refuses the combination for anything else, so
 *    naming a town we cannot deliver to is a failed parse rather than a copy review (`plan/10`
 *    §3).
 *  - **The six guide destinations**, each with *Guide · not delivering yet*. The state is a **word, not
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
import { Display, Eyebrow } from "../primitives/typography.tsx";

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
   * page), or `undefined` → its chip links to its guide instead.
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
  const source = provider ?? getDestinationStatusProvider();
  const destinations = [...source.list(locale, (nameKey) => t(nameKey))].sort(
    (a, b) => Number(b.delivering) - Number(a.delivering),
  );

  return (
    <section
      className={`${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-destinations
      id={DESTINATIONS_ANCHOR}
    >
      <div className="md:gap-2xl grid grid-cols-1 items-center gap-[32px] md:grid-cols-[5fr_6fr]">
        <div>
          <Eyebrow className="mb-[14px]">
            {home("destinations.eyebrow")}
          </Eyebrow>
          <Display as={headingLevel} id={HEADING_ID} size="display-s">
            {t("destinationsHub.h1")}
          </Display>
          <p className="text-ink-muted text-body mt-[18px] max-w-[40ch] leading-[1.5] md:text-[21px]">
            {home("destinations.body")}
          </p>
        </div>
        <ul className="flex flex-wrap gap-[10px]">
          {destinations.map((destination) => {
            const href =
              destination.delivering && shopHref !== undefined
                ? shopHref
                : destination.href;
            return (
              <li key={destination.iso2} data-fo-destination={destination.iso2}>
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
