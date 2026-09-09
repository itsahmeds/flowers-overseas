/**
 * The props that cross into the browser (spec 004 §13 Q13 option (b), §14 A1; TASK-051).
 *
 * Types only — no runtime import, no value, nothing to bundle. Everything the two islands render
 * is resolved on the server by `consentView()` and handed over as plain data: the copy from the
 * message catalogue, the categories and their cookies from `src/config/cookies.ts`, the lifetimes
 * and the policy version from the same register. Two consequences, both deliberate:
 *
 *  - the islands import **neither** `next-intl`'s client hooks **nor** the cookie register, so
 *    they add no message payload and no zod to the client bundle — §14 A1 leaves 1 434 B of
 *    Brotli headroom on a locale document and that is the whole reason this file exists;
 *  - the register cannot be reconfigured from a client chunk (the objection spec 003 AC-3 raised
 *    about the locale registry), because it never travels as code, only as rendered text.
 */

/** `src/config/cookies.ts`'s `cookieCategories`, restated for the client with no zod import. */
export type ConsentCategoryKey = "essential" | "analytics" | "marketing";

/** One register row as the settings panel shows it: name, purpose, how long it is kept. */
export interface ConsentCookieView {
  /** The cookie or storage key, verbatim (`_ga_*` keeps its wildcard). */
  readonly name: string;
  /** Resolved from the row's `purposeKey` (§7). */
  readonly purpose: string;
  /** Already formatted through ICU (`consent.lifetime.*`); the island does no formatting. */
  readonly lifetime: string;
}

/** One category with its rows. `locked` is the essential group: always on, with the reason. */
export interface ConsentCategoryView {
  readonly key: ConsentCategoryKey;
  readonly name: string;
  readonly purpose: string;
  /** True for `essential` only: no consent to ask for, so no control to offer (§8). */
  readonly locked: boolean;
  /** Why it is locked. Present exactly when `locked` is true. */
  readonly lockedReason?: string;
  readonly cookies: readonly ConsentCookieView[];
  /** Shown instead of an empty list: a category we disclose before we use it. */
  readonly emptyNote?: string;
}

/** Every string the two islands render. */
export interface ConsentStrings {
  readonly headline: string;
  readonly body: string;
  readonly reject: string;
  readonly settings: string;
  readonly accept: string;
  readonly settingsHeadline: string;
  readonly save: string;
  readonly saved: string;
  readonly close: string;
}

/** The non-copy facts: where to record a decision, and how long to keep it. */
export interface ConsentConfig {
  readonly cookieName: string;
  readonly policyVersion: number;
  readonly acceptMaxAgeSeconds: number;
  readonly rejectMaxAgeSeconds: number;
  readonly endpoint: string;
  /**
   * `SiteFooter`'s `CONSENT_REOPEN_ATTRIBUTE`, handed over as data rather than imported: the
   * island binds a delegated listener to it, and importing the footer would drag the footer, the
   * link registry and zod into the island's chunk.
   */
  readonly reopenAttribute: string;
}

/** What the Server Component hands to the loader, and the loader to the island. */
export interface ConsentView {
  readonly strings: ConsentStrings;
  readonly config: ConsentConfig;
  /** Register order, essential first — the order the disclosure reads in. */
  readonly categories: readonly ConsentCategoryView[];
}
