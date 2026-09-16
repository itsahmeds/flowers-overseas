/** Public barrel for `i18n` (locale config, message loading, formatters). Owned by: spec 003. */

/**
 * The only import path for the i18n module (spec 003 §5.2, AC-3; TASK-034).
 *
 * Functions and types only — not even a constant array. No provider instance
 * (`staticLocaleRegistry`, `repoMessageSource`), no injection hook (`withLocaleRegistry`,
 * `withMessageSource`) and no `messages/` path leaves this file: those are the seam, and a caller
 * that could reach them could also reconfigure the locale set at runtime — which is what AC-3's
 * "no provider instance and no config object with a setter" forbids, and what would break spec
 * 002/012's promise of hydrating from Postgres with zero caller changes (AC-5). `tests/unit/i18n-barrel.test.ts` pins this list (T-03).
 *
 * `LocaleSwitcher` is the one component the barrel exports (TASK-035). It belongs to the module
 * rather than to a route because every localised page from spec 004 onward renders it from its
 * header, and `plan/01` §5 keeps `app/` to routes only; it is a Server Component with no state, so
 * exporting it adds no client JavaScript and no way to reconfigure the locale set.
 *
 * `MoneySchema` (TASK-036) is the one non-function value in the list, and it is here on purpose:
 * money crosses every API, form and job boundary outside this module, and `plan/12` §2's "zod at
 * every boundary" would otherwise be satisfied by a second, hand-written money schema per caller.
 * A zod schema is not the thing AC-3 forbids — it carries no locale set, no provider and no
 * setter, and swapping the registry for a Postgres-backed one does not touch it — so
 * `tests/unit/i18n-barrel.test.ts` pins it by name as a schema rather than loosening its
 * "functions only" assertion.
 *
 * `MessagesSchema`, `MessageMetaSchema` and `MessageMetaManifestSchema` (TASK-038) are in the
 * list for the same reason and with the same limits: spec 012's translation admin accepts an
 * edited message and an edited review record over HTTP, and spec 017's email renderer loads a
 * catalogue, so both cross a boundary outside this module and `plan/12` §2 would otherwise be met
 * by a hand-written copy of each. `MESSAGE_META_COLUMNS` — the `message_catalog` column mapping
 * AC-4 pins — deliberately stays *inside* the module: it is a schema-to-table fact for spec 012's
 * mirror, not a caller API, and exporting a constant object is what AC-3 forbids.
 *
 * `AddressInputSchema` (TASK-037) is the second schema in the list, for the same reason as
 * `MoneySchema`: an address crosses the checkout form, the order API and the florist brief, and
 * `plan/12` §2 would otherwise be met by a hand-written address schema per caller. It carries no
 * country list — the formats stay in `src/config/address-formats.ts` and reach callers only
 * through `formatAddressBlock` — so AC-3's ban on exported configuration is untouched.
 *
 * The review gate and the hreflang generator (TASK-039) add four functions and no data:
 * `unreviewedShare`, `localeBetaTag`, `isLocaleIndexable` and `alternatesFor`. Their thresholds
 * and their caches stay inside the module — `UNREVIEWED_SHARE_THRESHOLD` is a constant and
 * `resetReviewCache()` is a test hook, so both are in `FORBIDDEN_EXPORTS` for the same reason
 * `withLocaleRegistry` is: a caller able to reach them could move the indexability answer at
 * runtime.
 *
 * TASK-042 adds three functions and no data: `routableLocale`/`routableLocaleCodes` — the
 * launch locales plus the pseudo-locales when `ENABLE_PSEUDO_LOCALES` is on, which is what the
 * `[locale]` segment resolves and prerenders — and `pseudoCatalogue`, the pure `en → en-XA/ar-XB`
 * derivation. The flag itself is read in one place (`src/config/locales.ts`) and no export lets a
 * caller move it, so AC-3 holds unchanged.
 *
 * The suggestion banner (TASK-041) adds two functions, one component and one schema.
 * `parseAcceptLanguage` and `preferredLocale` are pure functions over a string and a plain locale
 * list — the second argument is structural (`LocaleConfig[]` satisfies it), which is what lets the
 * client island decide from props instead of importing the registry into the browser.
 * `LocaleSuggestionBanner` is a Server Component like `LocaleSwitcher`, and it is the *only* entry
 * to the island: the `next/dynamic` boundary and the `"use client"` files stay inside the module,
 * so `app/` renders one element and nothing under `src/app/` knows how the banner is code-split.
 * `LocaleCookieSchema` joins the pinned schemas for the `MoneySchema` reason — `fo_locale` is read
 * back from `document.cookie`, and spec 004's currency UI and spec 007's alternates will both want
 * "is this a locale code the application offers?" without hand-writing the enum again. The
 * decision function (`decideSuggestion`), the cookie serialiser and `suggestionCandidates()` stay
 * module-internal: they are the island's own seams, not a caller API.
 */
export {
  type LocaleConfig,
  type LocaleRegistryProvider,
  documentFallbackLocale,
  getLocaleRegistry,
} from "./registry.ts";

export {
  type PageType,
  isLaunchLocale,
  launchLocale,
  launchLocaleCodes,
  launchLocales,
  localePath,
  type LocalePathParts,
  parseLocaleFromPath,
  type ParsedPath,
  routableLocale,
  routableLocaleCodes,
} from "./routing.ts";

// The six listing URLs of spec 008 §2 and the PDP pattern spec 009 owns (TASK-105). They are
// `localePath()` compositions, not new builders: one place still knows that a path is
// `/{locale}` plus the locale's own authored segments, so a listing URL cannot drift from a
// corridor URL (spec 003 §6, AC-13).
export {
  LISTING_PAGE_TYPES,
  type ListingPageType,
  type ListingTarget,
  listingPath,
  productPath,
} from "./routing.ts";

export {
  type MessageMeta,
  type MessageMetaManifest,
  MessageMetaManifestSchema,
  MessageMetaSchema,
  type MessageSourceKind,
  type MessageTree,
  MessagesSchema,
} from "./schemas.ts";

export {
  type MessageCatalogue,
  type MessageNamespace,
  type Messages,
  type MessageSource,
  type RouteKind,
  fallbackChain,
  loadMessages,
  namespacesFor,
  pseudoCatalogue,
} from "./messages.ts";

export {
  LocaleSwitcher,
  type LocaleSwitcherProps,
} from "./ui/LocaleSwitcher.tsx";

export {
  LocaleSuggestionBanner,
  type LocaleSuggestionBannerProps,
} from "./ui/LocaleSuggestionBanner.tsx";

export {
  type LanguagePreference,
  type LocaleHint,
  parseAcceptLanguage,
  preferredLocale,
} from "./hints.ts";

export { LocaleCookieSchema } from "./schemas.ts";

export {
  type DateStyle,
  type FormatMoneyOptions,
  type FormatNumberOptions,
  type FormatTimeInZoneOptions,
  type ListType,
  type Money,
  MoneySchema,
  type ZoneNameStyle,
  formatDate,
  formatList,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
  formatRange,
  formatRelativeTime,
  formatTimeInZone,
  moneyDecimalString,
} from "./format.ts";

export { collator, sortBy } from "./collate.ts";

export { isLocaleIndexable, localeBetaTag, unreviewedShare } from "./review.ts";

export {
  type AlternatesOptions,
  type AlternatesPageTarget,
  type AlternatesPathTarget,
  type AlternatesTarget,
  type HreflangAlternate,
  type HreflangPage,
  alternatesFor,
} from "./alternates.ts";

export {
  type AddressInput,
  AddressInputSchema,
  type PostcodeRejection,
  type PostcodeResult,
  formatAddressBlock,
  normalisePostcode,
  postcodeRegex,
} from "./address.ts";
