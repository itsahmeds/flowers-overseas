/**
 * The locale suggestion dialog's strings, as they cross into the browser (spec 003 §14 A14; spec
 * 004 §13 Q13 option (b), §14 A1 addendum; TASK-085, TASK-119).
 *
 * Types only — no runtime import, no value, nothing to bundle. The island renders strings it was
 * handed; it owns no translator, no catalogue and no formatter, which is what keeps
 * `NextIntlClientProvider` and the message payload out of every locale document (10 705 B Brotli
 * when they were last in it) and what keeps the dialog inside §14 A14's +3 KB Brotli budget.
 *
 * Two things about the shape are the dialog's design, not an implementation detail:
 *
 *  - **The offer is written in the language it offers.** Every string under `targets[code]` is
 *    resolved from **that locale's** catalogue: a German visitor reads a German sentence and a
 *    German button, with the current locale's "Stay in English" line beneath it. Which locale will
 *    be offered is decided in the browser, so the server resolves all four — four small objects,
 *    cheaper in bytes and in machinery than shipping an ICU formatter to fill in one argument.
 *  - **The country headline is per country, not per locale.** "You seem to be in {country}" needs
 *    the country's exonym in the target language ("Deutschland", "Niemcy"), which `Intl` knows and
 *    the catalogue does not. The server resolves one headline per country the table maps
 *    (`src/config/country-locale.data.ts`), keyed by the ISO code `GET /api/geo` answers with, so
 *    the island looks its answer up instead of formatting anything.
 */

/** The strings that name one target language, already ICU-resolved in that language. */
export interface SuggestionTargetCopy {
  /**
   * `suggestion.headline` with `{language}` filled in — the wording used when the hint was the
   * visitor's own `navigator.languages` and there is no country to name.
   */
  readonly headline: string;
  /**
   * `suggestion.headlineInCountry`, one per country that maps to this locale, keyed by ISO
   * 3166-1 alpha-2 — the wording used when the hint came from `GET /api/geo`.
   */
  readonly headlineByCountry: Readonly<Record<string, string>>;
  /** `suggestion.continue` with `{language}` filled in — the primary action, in that language. */
  readonly continueLabel: string;
}

/** Every string the island can render: the current locale's "stay" line, and one set per target. */
export interface SuggestionCopy {
  /**
   * `suggestion.stay` with the **current** locale's own name, resolved in the **current** locale:
   * the one line of the dialog that stays in the language of the page behind it, so a visitor who
   * did not mean to switch can read their way out (§14 A14 "the current locale's line beneath").
   */
  readonly stay: string;
  /**
   * Keyed by locale `code`, in registry order. The island looks the decided target up here and
   * renders nothing if it is missing, for the same fail-closed reason its `useState` initialiser
   * catches: a suggestion is an optional courtesy and must never replace the page with an error.
   */
  readonly targets: Readonly<Record<string, SuggestionTargetCopy>>;
}
