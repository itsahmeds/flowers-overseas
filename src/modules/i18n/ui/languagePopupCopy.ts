/**
 * The server-side projection the language popup island renders (spec 003 §14 A14 Shape as amended
 * by A16; spec 004 §14 A23 clause 6; TASK-119).
 *
 * Every string the island can show is resolved here, on the server, once per document, so the
 * browser receives text and never the catalogue or a formatter (spec 004 §13 Q13 option (b)).
 * Pure: the same translators give the same object, which is what lets
 * `tests/unit/i18n-language-popup.test.tsx` assert the shipped copy without a browser.
 */
import type { LanguagePopupCopy } from "./languagePopupTypes.ts";

/** The popup's own keys, `languagePopup.*`. Declared here so no next-intl type reaches a client. */
export type LanguagePopupKey =
  | "heading"
  | "current"
  | "default"
  | "browserMatch"
  | "browserMatchShort"
  | "close"
  | "foot";

export interface LanguagePopupTranslators {
  readonly popup: (key: LanguagePopupKey) => string;
  readonly a11y: (key: "localeChooser") => string;
  readonly common: (key: "beta") => string;
}

export function languagePopupCopy({
  popup,
  a11y,
  common,
}: LanguagePopupTranslators): LanguagePopupCopy {
  return {
    heading: popup("heading"),
    current: popup("current"),
    default: popup("default"),
    browserMatch: popup("browserMatch"),
    browserMatchShort: popup("browserMatchShort"),
    close: popup("close"),
    foot: popup("foot"),
    listLabel: a11y("localeChooser"),
    beta: common("beta"),
  };
}
