/**
 * Registry and catalogue keys held as data, resolved with the page's own translator (the cast
 * `src/modules/geo/ui/labels.ts` documents: next-intl types `t()` against the literal key union,
 * which a dotted key held as data is not). TASK-182.
 */
import type { useTranslations } from "next-intl";

import type { LocaleCode } from "@/config/locales";

export type Translator = ReturnType<typeof useTranslations>;

type LabelTranslator = (
  key: string,
  values?: Readonly<Record<string, string>>,
) => string;

export function label(
  t: Translator,
  key: string,
  values?: Readonly<Record<string, string>>,
): string {
  return (t as unknown as LabelTranslator)(key, values);
}

/** Every locale that reaches a page has passed the routing gate. */
export function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}
