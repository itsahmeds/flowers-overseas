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
 * **v2: Poland's dates as stamps** (spec 004 §14 A21; TASK-177; `home-*.dc.html` `.stamps`). Each
 * date is a perforated stamp on its tint — a big day numeral (decorative: the formatted date
 * under it says the same thing to a screen reader), the date, the name and the fact or cutoff.
 * A stamp whose occasion has a hub that exists is **one link** ending in a cornflower arrow; one
 * without (Andrzejki) is a `<div>` with no arrow and no hover (A20). The mobile artboard's
 * 232 px rail is a horizontal scroll. The artboard's fifth "name days" stamp and the dates lede
 * are new copy and wait for the founder's batch (the brief's `## Result`).
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { anyDeliveryDatesOpen } from "../../../config/countries.ts";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import { HOME_BLEED, HOME_SECTION } from "./HomeHero.tsx";
import { type OccasionDateView, occasionDateViews } from "./occasion-model.ts";

type LabelTranslator = (key: string, values?: Record<string, string>) => string;

/** The destination whose calendar the band prints: Poland, the one live destination. */
const DATED_DESTINATION = "PL";

const HEADING_ID = "occasion-dates-heading";

/** The four stamp tints, in the artboard's order (leaf, butter, blush, sage). */
const STAMP_TINTS = [
  "bg-leaf-wash",
  "bg-butter",
  "bg-blush",
  "bg-sage-wash",
] as const;

/** The stamp's perforated edge: the artboard's `.stamp` mask, a radial bite every 18 px. */
const PERFORATION =
  "[mask:linear-gradient(black_0_0)_content-box,radial-gradient(circle,transparent_5px,black_5.5px)_-9px_-9px/18px_18px_round]";

export interface OccasionDatesProps {
  readonly locale: string;
  readonly headingLevel?: "h2" | "h3";
  /**
   * Catalogue occasion key → its hub's URL in this locale, for the hubs that exist and may be
   * linked (from the page; `src/modules/ui` may not read the catalogue). A stamp whose occasion
   * has no entry is information, not a control (spec 004 §14 A20).
   */
  readonly hubHrefs?: Readonly<Record<string, string>>;
}

function StampFace({
  date,
  tint,
  linked,
  children,
}: {
  readonly date: OccasionDateView;
  readonly tint: string;
  readonly linked: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className={`border-rule flex flex-1 flex-col gap-[4px] border px-[18px] pt-[18px] pb-[16px] ${tint}`}
    >
      <span
        aria-hidden="true"
        className="display text-stamp leading-[0.9] tracking-(--tracking-hero) [font-variation-settings:var(--font-variation-display-hero)]"
      >
        {date.day}
      </span>
      <span className="label text-ink-muted">{date.date}</span>
      {children}
      {linked ? (
        <span
          aria-hidden="true"
          className="text-link mt-auto pt-[16px] font-bold after:content-['→'] rtl:after:content-['←']"
        />
      ) : null}
    </div>
  );
}

export function OccasionDates({
  locale,
  headingLevel = "h2",
  hubHrefs = {},
}: OccasionDatesProps): ReactElement {
  const t = useTranslations() as unknown as LabelTranslator;
  const home = useTranslations("home");
  const datesOpen = anyDeliveryDatesOpen();
  const dates = occasionDateViews(locale, DATED_DESTINATION);
  const NameHeading = headingLevel === "h2" ? "h3" : "h4";

  return (
    <section
      className={`bg-surface-raised ${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-occasion-dates
      id="dates"
    >
      <div className="mb-[28px] md:mb-[48px]">
        <Eyebrow className="mb-[14px]">{home("dates.eyebrow")}</Eyebrow>
        <Display as={headingLevel} id={HEADING_ID} size="display-s">
          {home("dates.heading")}
        </Display>
      </div>
      <ul className="-mx-[20px] grid auto-cols-[232px] grid-flow-col gap-[20px] overflow-x-auto px-[20px] md:mx-0 md:grid-flow-row md:grid-cols-5 md:overflow-visible md:px-0">
        {dates.map((date, index) => {
          const href =
            date.occasionKey === undefined
              ? undefined
              : hubHrefs[date.occasionKey];
          const tint = STAMP_TINTS[index % STAMP_TINTS.length] ?? "bg-blush";
          const face = (
            <StampFace date={date} tint={tint} linked={href !== undefined}>
              <NameHeading className="display text-md mt-[18px]">
                {t(date.nameKey)}
              </NameHeading>
              {date.orderBy === undefined || !datesOpen ? (
                date.noteKey === undefined ? null : (
                  <span className="text-ink-muted mt-[8px] text-sm leading-(--line-height-tight)">
                    {t(date.noteKey)}
                  </span>
                )
              ) : (
                <span className="text-ink-muted mt-[8px] text-sm leading-(--line-height-tight)">
                  {home("dates.orderBy", {
                    date: date.orderBy.date,
                    time: date.orderBy.time,
                  })}
                </span>
              )}
            </StampFace>
          );
          const stamp = `bg-surface-card text-ink flex h-full flex-col p-[12px] no-underline ${PERFORATION}`;
          return (
            <li
              key={date.id}
              className="drop-shadow-[0_8px_14px_var(--color-shade)]"
              data-fo-occasion-date={date.id}
            >
              {href === undefined ? (
                <div className={stamp}>{face}</div>
              ) : (
                <a className={`${stamp} group`} href={href}>
                  {face}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
