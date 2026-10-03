/**
 * The product page's two small helpers (spec 009 §5.3; TASK-126).
 *
 * `messageFor` resolves a dotted key that arrives as **data** — a tier's `labelKey`, a date's
 * `reasonKey`, an add-on's `nameKey`, an occasion's `labelKey`. next-intl types `t()` against the
 * catalogue's literal key union, and a key read off a view model is not a literal, so the cast is
 * made once, here, with the reason written down (the `modules/*\/ui/labels.ts` precedent).
 * `pnpm i18n:check` proves every such key exists.
 *
 * `instantOf` turns a calendar date the view model already decided (`YYYY-MM-DD`) into the
 * instant `formatDate` asks for: midday UTC is the same calendar date in every European zone, so
 * formatting it in `UTC` prints the date the calendar meant. It is formatting plumbing, not date
 * arithmetic — no day is added, compared or chosen here (spec 007 `CorridorCalendar`'s rule).
 */
import type { useTranslations } from "next-intl";

import type { LocaleCode } from "@/config/locales";

type Translator = ReturnType<typeof useTranslations>;
type Values = Readonly<Record<string, string | number>>;
type DataTranslator = (key: string, values?: Values) => string;

export function messageFor(
  t: Translator,
  key: string,
  values?: Values,
): string {
  return (t as unknown as DataTranslator)(key, values);
}

/** Midday UTC on an ISO calendar date — formatted in `UTC`, it is that date everywhere. */
export function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/**
 * The city an IANA zone is named after — `Europe/Warsaw` → `Warsaw` — which is what the approved
 * cutoff copy prints ("Order by 14:00 in Warsaw"). It is the zone database's own exemplar city,
 * read off the identifier the view model carries (`ProductView.delivery.timeZone`), so the city
 * printed and the zone the calendar computed in cannot disagree. A string reading, not a lookup:
 * no city is invented for a zone, and no clock is read.
 */
export function zoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

/** The view model's locale, as the formatters type it. `productView()` parsed it already. */
export function localeOf(locale: string): LocaleCode {
  return locale as LocaleCode;
}
