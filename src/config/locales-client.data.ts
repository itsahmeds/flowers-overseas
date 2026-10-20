/**
 * The few locale values the browser needs, and nothing else (spec 003 §14 A-founder-2026-10-19f,
 * AC-52; TASK-182 escalation E5).
 *
 * Two client paths need a locale: the 500 documents (`src/modules/i18n/error-document.ts`, read
 * by `src/app/global-error.tsx` and `src/app/[locale]/error.tsx`, whose chunk Next attaches to
 * every document) and the language popup island (`src/modules/i18n/hints.ts`). They used to
 * import `src/config/locales.data.ts`, and a bundler keeps the whole exported row array when one
 * field of one row is read, so every locale's names, currencies, aliases and path segments
 * shipped to every visitor. Spec 041's six trust-page segments pushed that over the script
 * budget (468 B Brotli over 131 072 B on every audited URL, CI run 39211395643).
 *
 * So this module holds only what those two paths read: the x-default locale's `code`, `bcp47`
 * and `dir`, and the launch locale codes in registry order. It has **no import at all**, so it
 * reaches no zod and no row. It is a **mirror**, not a source: `locales.data.ts` stays the one
 * authored file, and `tests/unit/locales-data.test.ts` (T-52) fails, naming the field, when the
 * two disagree. Adding a launch locale or changing the x-default row is therefore two edits in
 * one PR; a `shown` flip is still one, because nothing here carries `shown`.
 */

/** The two text directions, restated so this module needs no import. */
export type ClientTextDirection = "ltr" | "rtl";

/** The x-default locale: what the 500 document renders and where its "Home" action points. */
export const X_DEFAULT_CLIENT_LOCALE: {
  readonly code: string;
  readonly bcp47: string;
  readonly dir: ClientTextDirection;
} = { code: "en", bcp47: "en", dir: "ltr" };

/** The launch locale codes, in registry order. */
export const LAUNCH_LOCALE_CODES_CLIENT: readonly string[] = [
  "en",
  "en-gb",
  "de",
  "pl",
];

/** True when the string is one of the launch locale codes, exactly and case-sensitively. */
export function isLaunchLocaleCodeClient(code: string): boolean {
  return LAUNCH_LOCALE_CODES_CLIENT.includes(code);
}
