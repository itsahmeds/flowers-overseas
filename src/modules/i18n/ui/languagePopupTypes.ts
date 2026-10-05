/**
 * The language popup's strings, as they cross into the browser (spec 003 §14 A14 Shape as amended
 * by A16; spec 004 §14 A23 clause 6, AC-38 L1, L3–L6; TASK-119).
 *
 * Types only: no runtime import, no value, nothing to bundle. The island imports no translator,
 * for the reason TASK-085 removed `NextIntlClientProvider` from every locale document (spec 004
 * §13 Q13 option (b)): the Server Component resolves each string with `useTranslations` and hands
 * the island plain text, exactly as `consentTypes.ts` does for the consent sheet.
 */
export interface LanguagePopupCopy {
  /** L1, `languagePopup.heading`: the dialog's `<h2>` and its accessible name. */
  readonly heading: string;
  /** L3, `languagePopup.current`: the mark on the URL's locale (A16 Reading 1). */
  readonly current: string;
  /** `languagePopup.default`: the mark on the x-default locale (copy pending the founder). */
  readonly default: string;
  /** L4 at desktop widths, `languagePopup.browserMatch`. */
  readonly browserMatch: string;
  /** L4 at phone widths, `languagePopup.browserMatchShort`. */
  readonly browserMatchShort: string;
  /** L5, `languagePopup.close`: the close button's accessible name (its glyph is `aria-hidden`). */
  readonly close: string;
  /** L6, `languagePopup.foot`. */
  readonly foot: string;
  /** `a11y.localeChooser`: the accessible name of the option list. */
  readonly listLabel: string;
  /** `common.beta`: the machine-drafted locale tag the header switcher shows too. */
  readonly beta: string;
}
