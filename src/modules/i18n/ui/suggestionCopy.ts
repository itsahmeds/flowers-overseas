/**
 * The server-side copy projection the locale suggestion dialog renders (spec 003 §14 A14; spec 004
 * §13 Q13 option (b), §14 A1 addendum; TASK-085, TASK-119).
 *
 * Everything that needs a catalogue or an ICU formatter happens here, on the server, once per
 * document — the same shape `consentView()` has for the consent sheet, and for the same reason:
 * the browser receives **text**, never the catalogue and never the formatter.
 *
 * TASK-119 moved one thing: the copy is resolved **in the locale being offered**, not in the
 * locale of the page. §14 A14 asks for "copy in the suggested locale's language with the current
 * locale's line beneath", so this file builds one translator per launch locale with
 * `createTranslator` over `loadMessages()` — the same ICU formatter `useTranslations` uses,
 * without a request — and resolves the current locale's `stay` line through a fourth. Nothing
 * here reads the request, so the result depends only on `(currentLocale, candidates)` and the
 * repository's catalogues, which is what makes it a unit test rather than a browser test.
 *
 * Pure, and deliberately not memoised: it is four `createTranslator` calls and ~14 ICU
 * resolutions per document render, which is noise beside the render itself, and a cache here
 * would be a second place a catalogue edit has to be invalidated.
 */
import { createTranslator } from "next-intl";

import {
  localeForMappedCountry,
  suggestionCountries,
} from "../../../config/country-locale.ts";
import { formatCountryName } from "../format.ts";
import { loadMessages } from "../messages.ts";
import type { LocaleCode } from "../registry.ts";
import type { SuggestionCandidate } from "../hints.ts";

import type {
  SuggestionCopy,
  SuggestionTargetCopy,
} from "./suggestionTypes.ts";

/**
 * A translator bound to the `suggestion` namespace. Declared structurally rather than imported
 * from next-intl so a test can pass a plain function and so nothing in this file's *type* surface
 * reaches a client graph.
 */
export type SuggestionTranslate = (
  key: "headline" | "headlineInCountry" | "continue" | "stay",
  values?: Record<string, string>,
) => string;

/** One locale's `suggestion` namespace, through the real ICU formatter and no request context. */
export function suggestionTranslator(locale: string): SuggestionTranslate {
  return createTranslator({
    locale,
    messages: loadMessages(locale, ["suggestion"]),
    // The namespace is spelled out rather than referenced: `pnpm i18n:check`'s usage scan pairs a
    // literal namespace with the key literals in the same file, and that pairing is what proves
    // `suggestion.headline`, `suggestion.headlineInCountry`, `suggestion.continue` and
    // `suggestion.stay` have a consumer (check 2, "unused `en` keys").
    namespace: "suggestion",
  }) as SuggestionTranslate;
}

/**
 * Every string the island can render, resolved for every locale it can offer and every country it
 * can name.
 *
 * `translatorFor` is a parameter so the unit suite can substitute a spy and so a future
 * `dbMessageOverlay` (spec 012) can be handed in without this file learning about it; the default
 * is the repository catalogue through `createTranslator`.
 */
export function suggestionCopy(
  currentLocale: string,
  candidates: readonly SuggestionCandidate[],
  translatorFor: (locale: string) => SuggestionTranslate = suggestionTranslator,
): SuggestionCopy {
  const targets: Record<string, SuggestionTargetCopy> = {};
  for (const candidate of candidates) {
    const t = translatorFor(candidate.code);
    const language = candidate.nativeName;
    const headlineByCountry: Record<string, string> = {};
    for (const country of suggestionCountries()) {
      if (localeForMappedCountry(country) !== candidate.code) continue;
      headlineByCountry[country] = t("headlineInCountry", {
        // The country's exonym in the language being offered: "Deutschland" in `de`, "Niemcy" in
        // `pl`. CLDR data through the one file allowed to construct an `Intl` formatter.
        country: formatCountryName(country, candidate.code as LocaleCode),
        language,
      });
    }
    targets[candidate.code] = {
      headline: t("headline", { language }),
      headlineByCountry,
      continueLabel: t("continue", { language }),
    };
  }

  const current = candidates.find(
    (candidate) => candidate.code === currentLocale,
  );
  return {
    // Resolved in the **current** locale, naming the current locale: "Stay in English" on `/en`,
    // and the German sentence on `/de`. A visitor who did not mean to switch reads this line in
    // the language they are already looking at.
    stay: translatorFor(currentLocale)("stay", {
      language: current?.nativeName ?? currentLocale,
    }),
    targets,
  };
}
