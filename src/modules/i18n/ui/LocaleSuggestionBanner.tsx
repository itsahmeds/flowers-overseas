/**
 * Suggestion banner, server half (spec 003 §2 "Suggestion banner", §5.3, §6 "URL pattern",
 * AC-28; TASK-041).
 *
 * A Server Component — no `"use client"`, no state, no JavaScript of its own. Its whole job is to
 * project the locale registry into the four facts the island needs and to build each locale's URL
 * with `localePath()`, which is the **only** URL builder in the application (§6, AC-13): the
 * island therefore never concatenates a path, and a locale added to `src/config/locales.ts`
 * appears in the banner with no edit here and none under `src/app/` (AC-31).
 *
 * Rendered once by `src/app/[locale]/layout.tsx`, so every localised page inherits it exactly as
 * every localised page inherits the switcher. `pageType` defaults to the locale home for the same
 * reason the switcher's does (§5.3 "falling back to the locale home"): Phase 0 has one page type,
 * and spec 004's pages pass their own so "Switch" lands on the same page in the other language
 * rather than on its home.
 *
 * The `hreflangAliases` come along because they are what makes `en-GB` resolve to `en-gb` and
 * `de-AT` to `de` in `preferredLocale()` — `plan/02` §3's alias column, reused rather than
 * restated as a lookup table in the island.
 *
 * TASK-085 added the second projection: the **copy**. `useTranslations("banner")` runs here, on
 * the server, and `suggestionCopy()` resolves every string the island can render — including the
 * two ICU messages that take the target language's name, one pair per launch locale, because which
 * locale is offered is decided in the browser. The island therefore imports no translator, which
 * is what let `NextIntlClientProvider` and the `localeDocument` message payload leave every locale
 * document (spec 004 §13 Q13 option (b), §14 A1 addendum). Same register as `ConsentBanner`: the
 * locale for the copy is the request's, published by `setRequestLocale()` in the layout, while the
 * `locale` prop is the URL's — the island compares it against `navigator.languages` and builds no
 * URL of its own.
 */
import { useTranslations } from "next-intl";

import { type SuggestionCandidate } from "../hints.ts";
import { type PageType, launchLocales, localePath } from "../routing.ts";

import { LocaleSuggestionBannerLoader } from "./LocaleSuggestionBannerLoader.tsx";
import { suggestionCopy } from "./suggestionCopy.ts";

export interface LocaleSuggestionBannerProps {
  /** The locale of the page the banner is rendered on, from the URL segment and nothing else. */
  locale: string;
  /** The page "Switch" links to, in each locale's own path segments. Defaults to the home. */
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

export function LocaleSuggestionBanner({
  locale,
  pageType = "home",
}: LocaleSuggestionBannerProps) {
  const t = useTranslations("banner");
  const candidates = suggestionCandidates(pageType);
  return (
    <LocaleSuggestionBannerLoader
      candidates={candidates}
      copy={suggestionCopy(t, candidates)}
      locale={locale}
    />
  );
}
