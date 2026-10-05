/**
 * The returning visitor's recorded language choice, seeded for every browser suite (spec 003 §14
 * A14 Shape as amended by A16; TASK-119).
 *
 * Since A16 the language popup is a **modal** `<dialog>` that opens after hydration on any
 * localised page while the browser holds no valid `fo_locale`, and the page behind it is inert
 * until the visitor answers. Every suite that clicks, tabs, scans or screenshots a page would
 * otherwise be testing the page under the popup, or racing its mount.
 *
 * So `playwright.config.ts` starts every context in the state a returning visitor is in: one
 * first-party `fo_locale=en` cookie. That changes nothing else: the cookie never varies a response,
 * never redirects and is not read by the server (AC-9, AC-12, ADR-0006). The popup's own suites
 * (`tests/e2e/language-popup.spec.ts`, the popup cases in `tests/a11y/shell.spec.ts` and the
 * visual specs) start from `NO_LOCALE_CHOICE` instead, which is a first visit.
 */

/** Playwright's `storageState` shape, restated so this file imports no runtime. */
export interface SeededState {
  readonly cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax";
  }[];
  readonly origins: never[];
}

/** A first visit: no cookie of any kind. */
export const NO_LOCALE_CHOICE: SeededState = { cookies: [], origins: [] };

/** `fo_locale=en` on the host under test, with the attributes the popup itself writes. */
export function recordedLocaleChoice(baseURL: string): SeededState {
  const url = new URL(baseURL);
  return {
    cookies: [
      {
        name: "fo_locale",
        value: "en",
        domain: url.hostname,
        path: "/",
        // A year out, as `Max-Age=31536000` would land it.
        expires: Math.floor(Date.now() / 1000) + 31_536_000,
        httpOnly: false,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
}
