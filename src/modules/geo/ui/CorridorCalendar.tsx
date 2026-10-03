/**
 * The occasion calendar (spec 007 §5.3 "Occasion calendar", AC-22, T-23;
 * `docs/design/system/components.dc.html` "Occasion calendar"; TASK-091).
 *
 * A captioned `<table>` with a column scope on every header and a row header on every occasion —
 * "because a calendar read by a screen reader is a table", as the artboard puts it — and three
 * columns: the occasion, its date, and the `plan/03` §9 rule the date was computed from.
 *
 * **No date is typed anywhere.** Every row's date is `occasionDate(rule, year)`'s answer for the
 * destination, rendered by spec 003's `formatDate` in the page's locale, so "Sunday 1 November
 * 2026" in `en` is "Sonntag, 1. November 2026" in `de` with no second implementation and no
 * literal in a message. The instant is midday UTC, `occasion-model.ts`'s rule: a `YYYY-MM-DD` is
 * a calendar date rather than an instant, and midday is the hour that lands on the same date in
 * every European zone.
 *
 * Two empty branches, both drawn: a destination with **no rows renders no block at all** (the
 * caller passes `undefined` and nothing — heading, caption, table — is in the document), and an
 * occasion whose rule is `none` is named in the "also kept here" sentence, never in a row with a
 * guessed date.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDate, formatList } from "../../i18n/index.ts";
import type {
  CorridorOccasionView,
  CorridorUndatedOccasionView,
} from "../corridor.ts";

import { CorridorSection } from "./CorridorSection.tsx";
import { localeCode, registryLabel } from "./labels.ts";

/** Midday UTC: the hour that is the same calendar date in every European zone. */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface CorridorCalendarProps {
  readonly locale: string;
  readonly country: string;
  readonly occasions: readonly CorridorOccasionView[];
  readonly undated: readonly CorridorUndatedOccasionView[] | undefined;
}

export function CorridorCalendar({
  locale,
  country,
  occasions,
  undated,
}: CorridorCalendarProps): ReactElement {
  const t = useTranslations();
  const c = useTranslations("corridor");
  const code = localeCode(locale);

  const cell =
    "border-rule border-b py-[14px] pe-[12px] text-start align-baseline";
  return (
    <CorridorSection
      eyebrow={c("calendar.eyebrow", { country })}
      heading={c("calendar.heading", { country })}
      id="corridor-calendar"
      marker="data-fo-corridor-calendar"
      note={c("calendar.intro", { country })}
    >
      <table className="text-ui w-full border-collapse">
        <caption className="text-ink-subtle pb-[12px] text-start text-sm">
          {c("calendar.caption", { country })}
        </caption>
        <thead>
          <tr>
            {[
              c("calendar.occasion"),
              c("calendar.date"),
              c("calendar.rule"),
            ].map((label) => (
              <th
                className={`${cell} text-ink-subtle text-xs font-bold tracking-[0.12em] uppercase`}
                key={label}
                scope="col"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {occasions.map((occasion) => (
            <tr key={`${occasion.occasionKey}-${occasion.date}`}>
              <th
                className={`${cell} display text-[19px] font-normal`}
                scope="row"
              >
                {registryLabel(t, occasion.labelKey)}
              </th>
              <td className={`${cell} num text-ink-muted`}>
                {formatDate(
                  instantOf(occasion.date),
                  code,
                  "calendarDate",
                  "UTC",
                )}
              </td>
              <td className={`${cell} text-ink-subtle text-sm`}>
                <code className="font-body">{occasion.ruleKind}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {undated === undefined ? null : (
        <p className="text-fine text-ink-subtle m-0 mt-[12px]">
          {c("calendar.undated", {
            occasions: formatList(
              undated.map((occasion) => registryLabel(t, occasion.labelKey)),
              code,
            ),
          })}
        </p>
      )}
    </CorridorSection>
  );
}
