/**
 * Locale suggestion dialog, server half (spec 003 §2 "Suggestion banner" as amended by §14 A14,
 * §5.3, §6 "URL pattern", AC-28; TASK-041, TASK-119).
 *
 * A Server Component — no `"use client"`, no state, no JavaScript of its own. Its whole job is the
 * two projections the island needs:
 *
 *  - **the locales**, as `code`/`bcp47`/`hreflangAliases`/`nativeName` plus a URL built by
 *    `localePath()`, which is the only URL builder in the application (§6, AC-13). The island
 *    therefore never concatenates a path, and a locale added to `src/config/locales.ts` appears in
 *    the dialog with no edit here and none under `src/app/` (AC-31);
 *  - **the copy**, resolved by `suggestionCopy()` in the locale being *offered* — §14 A14's "copy
 *    in the suggested locale's language with the current locale's line beneath". No translator, no
 *    catalogue and no formatter crosses into the browser (spec 004 §14 A1 addendum).
 *
 * Rendered once by `src/app/[locale]/layout.tsx`, so every localised page inherits it exactly as
 * every localised page inherits the switcher. `pageType` defaults to the locale home (§5.3
 * "falling back to the locale home"); a page that passes its own makes "Continue in Deutsch" land
 * on the same page in German rather than on the German home.
 *
 * The `hreflangAliases` come along because they are what makes `en-GB` resolve to `en-gb` and
 * `de-AT` to `de` in `preferredLocale()` — `plan/02` §3's alias column, reused rather than
 * restated as a lookup table in the island.
 */
import { type SuggestionCandidate } from "../hints.ts";
import { type PageType, launchLocales, localePath } from "../routing.ts";

import { LocaleSuggestionDialogLoader } from "./LocaleSuggestionDialogLoader.tsx";
import { suggestionCopy } from "./suggestionCopy.ts";

export interface LocaleSuggestionDialogProps {
  /** The locale of the page the dialog is rendered on, from the URL segment and nothing else. */
  locale: string;
  /** The page "Continue" links to, in each locale's own path segments. Defaults to the home. */
  pageType?: PageType;
}

/** The registry projection that crosses into the browser: four strings and a URL per locale. */
export function suggestionCandidates(
  pageType: PageType = "home",
): readonly SuggestionCandidate[] {
  return launchLocales().map((locale) => ({
    code: locale.code,
    bcp47: locale.bcp47,
    hreflangAliases: locale.hreflangAliases,
    nativeName: locale.nativeName,
    href: localePath(locale.code, pageType),
  }));
}

export function LocaleSuggestionDialog({
  locale,
  pageType = "home",
}: LocaleSuggestionDialogProps) {
  const candidates = suggestionCandidates(pageType);
  return (
    <LocaleSuggestionDialogLoader
      candidates={candidates}
      copy={suggestionCopy(locale, candidates)}
      locale={locale}
    />
  );
}
