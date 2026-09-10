/**
 * The suggestion banner's strings, as they cross into the browser (spec 004 §13 Q13 option (b),
 * §14 A1 addendum; TASK-085).
 *
 * Types only — no runtime import, no value, nothing to bundle. The banner island used to read
 * `banner.*` with `useTranslations`, which is why `banner` was in
 * `namespacesFor("localeDocument")` and why `NextIntlClientProvider` was mounted on every locale
 * document: 10 705 B Brotli of provider and message payload in the initial script set, for four
 * strings. They are resolved on the server by `suggestionCopy()` and handed over as plain text
 * instead, exactly as `consentTypes.ts` does for the consent sheet.
 *
 * `headline` and `switchLabel` are per **target** locale because both take the target language's
 * `nativeName` as an ICU argument, and which locale the island will offer is decided in the
 * browser from `navigator.languages`. Resolving all of them up front — one small object per launch
 * locale — is what keeps the ICU formatter on the server: the island renders a string it was
 * given, and never formats one.
 */

/** The two strings that name a target language. Already ICU-resolved; the island does no work. */
export interface SuggestionTargetCopy {
  /** `banner.headline` with `{language}` filled in. */
  readonly headline: string;
  /** `banner.switch` with `{language}` filled in — the accessible name of the `<a href>`. */
  readonly switchLabel: string;
}

/** Every string the island renders: two fixed, and one pair per launch locale it may offer. */
export interface SuggestionCopy {
  /** `banner.stay`. */
  readonly stay: string;
  /** `banner.dismiss` — the dismiss button's accessible name (its glyph is `aria-hidden`). */
  readonly dismiss: string;
  /**
   * Keyed by locale `code`, in registry order. The island looks the decided target up here and
   * renders nothing if it is missing, for the same fail-closed reason its `useState` initialiser
   * catches: a suggestion is an optional courtesy and must never replace the page with an error.
   */
  readonly targets: Readonly<Record<string, SuggestionTargetCopy>>;
}
