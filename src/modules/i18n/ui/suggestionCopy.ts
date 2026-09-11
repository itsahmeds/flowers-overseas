/**
 * The server-side projection the suggestion banner island renders (spec 003 §2 "Suggestion
 * banner", AC-28; spec 004 §13 Q13 option (b), §14 A1 addendum; TASK-085).
 *
 * Everything that needs the message catalogue or an ICU formatter happens here, on the server,
 * once per document — the same shape `consentView()` has for the consent sheet, and for the same
 * reason: the browser receives **text**, never the catalogue and never the formatter. Removing the
 * island's `useTranslations` is what let `NextIntlClientProvider` and the `localeDocument` message
 * payload leave every locale document (10 705 B Brotli of the 131 072 B budget of §14 A1).
 *
 * Pure: the same translator and the same candidate list give the same object, which is what makes
 * `tests/unit/i18n-suggestion-banner.test.tsx` able to assert the shipped copy without a browser
 * and without a provider.
 */
import type { SuggestionCandidate } from "../hints.ts";

import type {
  SuggestionCopy,
  SuggestionTargetCopy,
} from "./suggestionTypes.ts";

/**
 * A translator bound to the `banner` namespace — `useTranslations("banner")` in the Server
 * Component, or the same function shape in a test. Declared here rather than imported from
 * next-intl so that nothing in this file's type surface reaches a client graph.
 */
export type BannerTranslate = (
  key: "headline" | "switch" | "stay" | "dismiss",
  values?: Record<string, string>,
) => string;

/**
 * Every string the island can render, resolved for every candidate it can offer.
 *
 * `headline` and `switch` are formatted once per launch locale because the target is decided in
 * the browser (`navigator.languages`), so the server cannot know which one will be shown — and
 * four small objects are cheaper, in bytes and in machinery, than the formatter that would let the
 * island fill in one `{language}` itself.
 */
export function suggestionCopy(
  translate: BannerTranslate,
  candidates: readonly SuggestionCandidate[],
): SuggestionCopy {
  const targets: Record<string, SuggestionTargetCopy> = {};
  for (const candidate of candidates) {
    targets[candidate.code] = {
      headline: translate("headline", { language: candidate.nativeName }),
      switchLabel: translate("switch", { language: candidate.nativeName }),
    };
  }
  return {
    stay: translate("stay"),
    dismiss: translate("dismiss"),
    targets,
  };
}
