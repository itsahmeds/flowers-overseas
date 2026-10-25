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
} from "./query";
export { buildIndex } from "./build";
export { type Match, matchDocuments, matchHubs } from "./match";
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
  cleanQuery,
  memoryEngine,
} from "./engine";
export { searchEngine, searchIndexStats } from "./default-engine";
export { catalogSearchSource } from "./source";
export {
  type PageLink,
  PageLinkSchema,
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
  SearchLabel,
  SearchProduct,
  SearchSource,
} from "./types";
