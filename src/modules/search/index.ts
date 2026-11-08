/**
 * The only import path into the search module: site search's text core, its in-process engine
 * and the engine's boundary schemas (spec 045 §2.3, §2.5, §2.9, §5.2; TASK-400, TASK-401).
 *
 * A `plan/01` §2 component ("search row") that `plan/01` §5's module list did not name, so it is
 * registered in the layout manifest (`scripts/check-layout.ts`) and `docs/architecture.md` §3 in
 * the same PR. It reads the catalogue, geo and i18n through their barrels only (the boundary lint,
 * AC-31), reads no database (`pnpm check:no-db` scans the directory), and names no country (spec
 * 004 AC-73): destinations are the registry's data.
 *
 * Owned by: spec 045.
 *
 * @spec 045
 */
export {
  damerauLevenshtein,
  normaliseForSearch,
  searchLanguage,
  stem,
  tokenise,
  typoAllowance,
} from "./text";
export {
  type DestinationWords,
  type ParsedQuery,
  destinationPhrase,
  parseQuery,
  withoutDestinationWords,
} from "./query";
export { buildIndex } from "./build";
export {
  type LinkMatch,
  type Match,
  matchCountries,
  matchDocuments,
  matchHubs,
  matchInfoPages,
} from "./match";
export { type RankInput, compareRankInputs, rankSearchResults } from "./rank";
export { didYouMean } from "./did-you-mean";
export {
  type IndexTrigger,
  type MemoryEngine,
  type MemoryEngineDeps,
  type SearchEngine,
  type SearchIndexStats,
  type SearchOutcome,
  SEARCH_STALE_TAG_PREFIXES,
  SUGGEST_PRODUCTS_MAX,
  cleanQuery,
  memoryEngine,
} from "./engine";
export { searchEngine, searchIndexStats } from "./default-engine";
export { catalogSearchSource } from "./source";
export {
  NO_GROUPS,
  type PageLink,
  PageLinkSchema,
  type SearchGroupKind,
  type SearchGroups,
  SearchGroupsSchema,
  type SuggestItem,
  SuggestItemSchema,
  type SuggestKind,
  type SuggestRequest,
  SuggestRequestSchema,
  SuggestResponseSchema,
  searchGroupKinds,
  suggestKinds,
  type SearchRequest,
  SearchRequestSchema,
  type SearchResultView,
  SearchResultViewSchema,
  type SearchState,
  searchStates,
} from "./schemas";
export type {
  DestinationIndex,
  SearchDestination,
  SearchHub,
  SearchIndex,
  SearchInfoPage,
  SearchLabel,
  SearchProduct,
  SearchSource,
} from "./types";
// The results page (spec 045 §2.2, §2.7, §5.3; TASK-402): the URL's parameters at the boundary,
// the page's view around one search, and its Server Components.
export {
  type SearchParams,
  type SearchParamsContext,
  cleanSearchQuery,
  searchParamsSchema,
} from "./params";
export {
  type SearchCountryOption,
  type SearchOccasionLink,
  type SearchPageDeps,
  type SearchPageOutcome,
  type SearchPageView,
  type SearchRouteOptions,
  SLOW_SEARCH_COUNT,
  SLOW_SEARCH_MS,
  SLOW_SEARCH_WINDOW_MS,
  headerSearchValue,
  rateLimitedSearchPage,
  searchPage,
  searchPath,
  searchRoutePage,
  slowSearchMonitor,
} from "./page";
// Abuse protection (spec 045 §2.8, AC-26; TASK-403). The proxy imports `./gate` directly, not
// through this barrel, so its bundle carries none of the page's components.
export {
  type Admission,
  CLIENT_ADDRESS_HEADER,
  CONCURRENCY_RETRY_AFTER_SECONDS,
  RATE_WINDOW_MS,
  type RateLimiter,
  type RefusalReason,
  type SearchRouteKind,
  clientAddress,
  installSearchGate,
  rateLimiter,
  searchGate,
} from "./gate";
export {
  SUGGEST_HEADERS,
  type SuggestRouteDeps,
  suggestMethodNotAllowed,
  suggestRoute,
} from "./suggest";
export {
  SearchResultsPage,
  type SearchResultsPageProps,
} from "./ui/SearchResultsPage";
