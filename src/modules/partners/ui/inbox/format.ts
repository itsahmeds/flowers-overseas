/**
 * How the inbox screens print the view model's data (spec 011 §7 "Locale formatting"; TASK-210).
 *
 * Dates through `formatDate(…, "deliveryDate", zone)` ("Thu 8 Oct"), the answer-by instant
 * through `formatTimeInZone` in the destination's IANA zone (which is also the florist's), money
 * through `formatMoney`. The zone always comes from the view, never from the server or the
 * browser, so a florist in Warsaw reads Warsaw time on any machine. `fo/no-adhoc-intl` holds.
 */
import type { useTranslations } from "next-intl";

import type { LocaleCode } from "@/config/locales";
import {
  MoneySchema,
  formatDate,
  formatMoney,
  formatTimeInZone,
} from "@/modules/i18n";

export type Translator = ReturnType<typeof useTranslations>;

type LabelTranslator = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

/**
 * A key held as data (a tier's `labelKey`, an add-on's `nameKey`), resolved with the screen's own
 * translator: the cast `src/modules/geo/ui/labels.ts` documents.
 */
export function label(
  t: Translator,
  key: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  return (t as unknown as LabelTranslator)(key, values);
}

/** Every locale that reaches a screen has passed the routing gate or the florist's language. */
export function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/** `2026-10-08` in `Europe/Warsaw` → "Thu 8 Oct" (noon, so no zone puts it on another day). */
export function deliveryDateLabel(
  isoDate: string,
  locale: string,
  timeZone: string,
): string {
  return formatDate(
    new Date(`${isoDate}T12:00:00Z`),
    localeCode(locale),
    "deliveryDate",
    timeZone,
  );
}

/** The answer-by instant as a wall-clock time in the destination's zone, the zone named. */
export function answerByLabel(
  instant: string,
  locale: string,
  timeZone: string,
): string {
  return formatTimeInZone(new Date(instant), localeCode(locale), timeZone, {
    zoneName: "short",
  });
}

export function moneyLabel(
  money: { readonly amountMinor: number; readonly currency: string },
  locale: string,
): string {
  return formatMoney(MoneySchema.parse(money), localeCode(locale));
}

/** "15 stems": the tier's catalogue label with its count. */
export function tierLabel(
  t: Translator,
  tier: { readonly labelKey: string; readonly stems: number | null },
): string {
  return label(
    t,
    tier.labelKey,
    tier.stems === null ? {} : { count: tier.stems },
  );
}
