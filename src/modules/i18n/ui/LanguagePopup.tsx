/**
 * The language popup, server half (spec 003 §14 A14 Shape as amended by A16; spec 004 §14 A23
 * AC-38, AC-39; TASK-119).
 *
 * A Server Component with no JavaScript of its own. It projects the locale registry into what the
 * island needs, builds every link with `localePath()` (the only URL builder, AC-13), decides the
 * "Beta" tags with `localeBetaTag()` and resolves every string with `useTranslations`, so the
 * browser receives text, links and booleans, never the registry or the catalogue. A locale added
 * to `src/config/locales.ts` appears in the popup with no edit here (AC-5, AC-31; T-05 renders it
 * with a fake five-locale registry).
 *
 * **Links go to the same page in each locale.** The layout that renders the popup does not know
 * the page, and reading the path would make every document per-request, so the links built here
 * are the locale homes. Each route renders `LanguageAlternates` with the per-locale paths its
 * hreflang cluster already uses, and the island swaps them in from the DOM. A locale with no such
 * page (and the product page, which has no alternates builder yet) keeps the home.
 */
import { useTranslations } from "next-intl";

import { type PopupCandidate } from "../hints.ts";
import { documentFallbackLocale } from "../registry.ts";
import { localeBetaTag } from "../review.ts";
import { type PageType, launchLocales, localePath } from "../routing.ts";

import { LanguagePopupLoader } from "./LanguagePopupLoader.tsx";
import { languagePopupCopy } from "./languagePopupCopy.ts";

export interface LanguagePopupProps {
  /** The locale of the page, from the URL segment and nothing else. */
  locale: string;
  /** That locale's BCP 47 tag, for the dialog's marks. */
  pageLang: string;
  /** The page the options link to, in each locale's own path segments. Defaults to the home. */
  pageType?: PageType;
}

/** The registry projection that crosses into the browser. */
export function popupCandidates(
  pageType: PageType = "home",
): readonly PopupCandidate[] {
  return launchLocales().map((locale) => ({
    code: locale.code,
    bcp47: locale.bcp47,
    hreflangAliases: locale.hreflangAliases,
    nativeName: locale.nativeName,
    href: localePath(locale.code, pageType),
    beta: localeBetaTag(locale.code),
  }));
}

export function LanguagePopup({
  locale,
  pageLang,
  pageType = "home",
}: LanguagePopupProps) {
  const popup = useTranslations("languagePopup");
  const a11y = useTranslations("a11y");
  const common = useTranslations("common");
  return (
    <LanguagePopupLoader
      candidates={popupCandidates(pageType)}
      copy={languagePopupCopy({
        popup: (key) => popup(key),
        a11y: (key) => a11y(key),
        common: (key) => common(key),
      })}
      defaultLocale={documentFallbackLocale().code}
      locale={locale}
      pageLang={pageLang}
    />
  );
}
