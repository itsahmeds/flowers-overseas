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
 * Later spec-003 tasks extend the list: formatters and `collator` (TASK-036), `formatAddressBlock`
 * (TASK-037), `unreviewedShare`/`isLocaleIndexable` (TASK-039), `alternatesFor` (TASK-039),
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
