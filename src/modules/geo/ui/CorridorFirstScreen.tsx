/**
 * The guide's first screen (spec 007 §14 A11 (b), A12 (a); AC-31; spec 004 §14 A23 clause 10,
 * A24 clause 2, AC-45; `docs/design/wireframes/corridor-country-{desktop,mobile}.dc.html`, round 2;
 * TASK-189).
 *
 * It replaces the empty "Photo slot · {country}" box (audit finding 6) with what is true about the
 * destination today: the `<h1>`, the guide state as **one quiet text line** (A12 (a): no postmark,
 * no stamp, no chip), and the **next three dated rows of the page's own calendar** beside it,
 * then the authored intro. Three rules hold whatever the artboard draws:
 *
 *  - **one source.** The cards are `view.occasions.slice(0, 3)`: the very rows the calendar table
 *    prints (`CorridorCalendar`, `corridorView()`'s twelve-month window), in the same order, each
 *    spelled by `formatDateParts`, the parts of the one `formatDate(…, "calendarDate")` value the
 *    table prints. The first screen cannot read a different window from the table, because it
 *    reads no window at all. Fewer than three rows shows what there is; none shows the state
 *    line alone.
 *  - **no image.** No `<img>`, no placeholder box and no preload: there is no photograph of any
 *    destination, so the LCP element is the `<h1>`.
 *  - **the `<h1>` first.** It is the first element of the band in DOM order; the state line, the
 *    dates and the intro follow, which is also the phone's reading order (the artboard's phone
 *    puts the dates above the intro, so they stay in the first viewport at 390 × 844). From `md`
 *    up the band is the 12-column hero: the copy on columns 1–6, the dates on 8–12 beside it.
 *
 * From `md` up the band keeps no bottom padding: the facts section's own `--section-fluid` is the
 * gap under the intro, which keeps the first viewport's largest empty band under AC-45's 120 px
 * (56 px more was a 160 px band at 1440 × 900).
 *
 * The dates are three equal columns at every width. The phone artboard draws 132 px cards in a
 * row that runs off the screen; three equal columns keep all three wholly inside the first
 * viewport, which AC-31 measures. Each card carries its ISO date (`data-fo-first-date`) so the
 * suites compare it with the table's row (`data-fo-calendar-date`), and its day and month carry
 * `data-fo-date-face`, which the visual suites' `dated-blocks.css` takes out of a baseline.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { interactions } from "../../../config/interactions.ts";
import { formatDateParts } from "../../i18n/index.ts";
import { TextLink } from "../../ui/index.ts";
import type { CorridorOccasionView, CorridorView } from "../corridor.ts";

import { CorridorRouteLine } from "./CorridorRouteLine.tsx";
import { localeCode, registryLabel } from "./labels.ts";

/** How many of the calendar's rows the first screen shows (A11 (b)). */
export const FIRST_SCREEN_DATES = 3;

/** Midday UTC: the hour that is the same calendar date in every European zone (`CorridorCalendar`). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface CorridorFirstScreenProps {
  readonly view: CorridorView;
  /** The destination's name in the reader's language. */
  readonly country: string;
}

export function CorridorFirstScreen({
  view,
  country,
}: CorridorFirstScreenProps): ReactElement {
  const t = useTranslations();
  const c = useTranslations("corridor");
  const live = view.state === "live";
  const dates: readonly CorridorOccasionView[] =
    view.occasions?.slice(0, FIRST_SCREEN_DATES) ?? [];
  const code = localeCode(view.locale);

  return (
    <div
      className="relative grid grid-cols-[minmax(0,1fr)] items-start gap-y-[18px] pt-[24px] pb-[36px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)] md:gap-y-[20px] md:pt-[40px] md:pb-0"
      data-fo-corridor-first-screen
    >
      <div className="grid min-w-0 justify-items-start gap-[12px] md:col-span-6 md:row-start-1 md:gap-[20px]">
        <h1 className="display text-display-fluid m-0">{view.h1}</h1>
        <p
          className="text-ink-muted m-0 inline-flex items-center gap-[8px] text-sm"
          data-fo-corridor-state-line
        >
          <span
            aria-hidden="true"
            className={`size-[8px] flex-none rounded-full ${live ? "bg-success" : "bg-ink-subtle"}`}
          />
          {registryLabel(t, view.stateKey)}
        </p>
      </div>

      {dates.length === 0 ? null : (
        <section
          aria-labelledby="corridor-first-dates"
          className="grid w-full min-w-0 justify-items-start gap-[12px] pt-[6px] md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1 md:max-w-[470px] md:gap-[18px] md:justify-self-end md:pt-0"
        >
          <h2
            className="max-md:display max-md:text-md md:eyebrow m-0"
            id="corridor-first-dates"
          >
            {c("calendar.eyebrow", { country })}
          </h2>
          <ol
            className="m-0 grid w-full list-none grid-cols-3 gap-[8px] p-0 md:gap-[14px]"
            data-fo-corridor-first-dates={dates.length}
          >
            {dates.map((occasion) => {
              const parts = formatDateParts(
                instantOf(occasion.date),
                code,
                "UTC",
              );
              return (
                <li
                  className="bg-card rounded-photo-s grid min-h-[120px] min-w-0 content-start gap-[2px] p-[10px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:p-[14px]"
                  data-fo-first-date={occasion.date}
                  key={`${occasion.occasionKey}-${occasion.date}`}
                >
                  <span
                    className="display text-ink text-[34px] leading-none md:text-[44px]"
                    data-fo-date-face
                  >
                    {parts.day}
                  </span>
                  <span
                    className="text-ink-subtle text-xs font-bold tracking-[0.04em] [overflow-wrap:anywhere] uppercase md:tracking-[0.08em]"
                    data-fo-date-face
                  >
                    {parts.month}
                    <span className="max-md:hidden">
                      {" · "}
                      {parts.weekday}
                    </span>
                  </span>
                  <span className="text-ink md:font-display mt-[6px] text-sm leading-[1.25] md:text-[17px] md:leading-[1.2]">
                    {registryLabel(t, occasion.labelKey)}
                  </span>
                </li>
              );
            })}
          </ol>
          <TextLink
            arrow
            className="max-md:hidden md:min-h-[24px]"
            href="#corridor-calendar"
          >
            {c("calendar.heading", { country })}
          </TextLink>
        </section>
      )}

      <p className="text-ink-muted text-body-s m-0 max-w-prose md:col-span-6 md:row-start-2 md:text-[19px]">
        {view.intro}
      </p>

      {/* Spec 042 idea 6 (TASK-311): out of flow, so this band is the same with it or without
          it; `relative` above makes this grid its containing block, and `globals.css` centres it
          in the gap between column 6 and the dates. Hidden below `md`. */}
      {interactions.routeLine ? <CorridorRouteLine /> : null}
    </div>
  );
}
