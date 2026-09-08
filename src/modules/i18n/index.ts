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
 * Later spec-003 tasks extend the list: `formatAddressBlock` (TASK-037),
 * `unreviewedShare`/`isLocaleIndexable` (TASK-039), `alternatesFor` (TASK-039),
 * `parseAcceptLanguage`/`preferredLocale` (TASK-041) and `pseudoCatalogue` (TASK-042).
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
  parseLocaleFromPath,
  type ParsedPath,
} from "./routing.ts";

export {
  type MessageCatalogue,
  type MessageNamespace,
  type Messages,
  type MessageSource,
  type RouteKind,
  fallbackChain,
  loadMessages,
  namespacesFor,
} from "./messages.ts";

export {
  LocaleSwitcher,
  type LocaleSwitcherProps,
} from "./ui/LocaleSwitcher.tsx";

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
} from "./format.ts";

export { collator, sortBy } from "./collate.ts";
