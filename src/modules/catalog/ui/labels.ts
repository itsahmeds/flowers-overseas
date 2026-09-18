/**
 * The two casts every listing block needs (spec 008 §7; the `modules/geo/ui/labels.ts` precedent;
 * TASK-109).
 *
 * `countries.ts`, `site-links.ts` and the catalogue's occasions hold **dotted message keys as
 * data**, and next-intl types `t()` against the literal key union of the catalogue. A key read
 * from a registry is not a literal, so the cast is made once, here, with the reason written down,
 * rather than at every call site that renders a country or an occasion name.
 *
 * It is a cast and not a lookup: `pnpm i18n:check` proves the keys exist (a registry key with no
 * message is a failure there), and nothing in this directory composes a key from parts.
 */
import type { useTranslations } from "next-intl";

import type { LocaleCode } from "@/config/locales";

type Translator = ReturnType<typeof useTranslations>;
type LabelTranslator = (key: string, values?: Record<string, string>) => string;

/** Resolve a dotted key held as registry data. See the header for the cast. */
export function registryLabel(
  t: Translator,
  key: string,
  values?: Record<string, string>,
): string {
  return values === undefined
    ? (t as unknown as LabelTranslator)(key)
    : (t as unknown as LabelTranslator)(key, values);
}

/**
 * The locale set is provider-backed data (spec 003 AC-31), so narrowing to the static union here
 * would make a fifth locale a code change. Every code that reaches a block has already passed the
 * routing gate (`dynamicParams = false` on the route and on the `[locale]` layout).
 */
export function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}
