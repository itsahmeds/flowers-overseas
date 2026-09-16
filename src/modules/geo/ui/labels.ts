/**
 * The two shared helpers of the corridor blocks (spec 007 §5.3, §7; TASK-091).
 *
 * `registryLabel` is `SiteHeader`'s and `OccasionDates`' cast, for the same reason: the
 * registries (`countries.ts`, `site-links.ts`, the catalogue's occasions) hold **dotted message
 * keys as data**, and next-intl types `t()` against the literal key union of the catalogue. A
 * registry key is not a literal, so the call is cast once, here, with the reason written down,
 * rather than at each of the seven call sites.
 *
 * `countryName` is the only way a corridor block names a country: through the registry's
 * `nameKey`, never by concatenation and never from a slug (§7 "Country and city names come from
 * message keys").
 */
import type { useTranslations } from "next-intl";

import type { LocaleCode } from "../../../config/locales.ts";

type Translator = ReturnType<typeof useTranslations>;
type LabelTranslator = (key: string) => string;

/** Resolve a dotted key held as registry data. See the header for the cast. */
export function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

/** The destination's name in the reader's language, from `countries.ts`'s `nameKey`. */
export function countryName(t: Translator, nameKey: string): string {
  return registryLabel(t, nameKey);
}

/**
 * The one cast in the corridor blocks, and `occasion-model.ts`'s: the locale set is
 * provider-backed data (spec 003 AC-31), so narrowing to the static union here would make a fifth
 * locale a code change. Every code that reaches a block has already passed the routing gate
 * (`dynamicParams = false` on the `[locale]` layout and on the route itself).
 */
export function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}
