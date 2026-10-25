/**
 * `memoryEngine`: spec 045's one `SearchEngine`, an index held in the web process (§2.9, §5.2,
 * §5.4; AC-31; TASK-401).
 *
 * **Freshness.** The index is built lazily on the first search and rebuilt on the next search
 * after it goes stale: when `invalidate()` names a `catalog:*`, `product:*` or `country:*` tag (one
 * in-process listener, `onInvalidate` in `src/lib/cache.ts`), or when it is older than
 * `indexMaxAgeSeconds` (300). So a price change reaches search when it reaches the listings (§5.4).
 * Concurrent searches share one build; an invalidation that lands during a build marks the new
 * index stale again, so no change is lost to a race.
 *
 * **The destination** is the country the words name, else `to`, else none (§2.4, §14
 * A-orchestrator-2026-10-24 item 1). There is no default destination and nothing here names a
 * country. The query, the destination and the date are the only inputs; nothing about the visitor
 * is (ADR-0006).
 *
 * Every dependency is injected (the source, the clock, the invalidation subscription, the
 * logger), so the unit suite runs it on the static catalogue with no database URL and an
 * injected clock (AC-31). `src/modules/search/default-engine.ts` wires the process's one instance.
 */
import type { LocaleCode } from "@/config/locales";
import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";
import { collator } from "@/modules/i18n";

import { buildIndex } from "./build";
import { didYouMean } from "./did-you-mean";
import { type Match, matchDocuments, matchHubs } from "./match";
import { type DestinationWords, destinationPhrase, parseQuery } from "./query";
import { rankSearchResults } from "./rank";
import {
  type PageLink,
  type SearchRequest,
  SearchRequestSchema,
  type SearchResultView,
  SearchResultViewSchema,
  type SearchState,
} from "./schemas";
import type {
  DestinationIndex,
  IndexedDocument,
  LocaleIndex,
  SearchIndex,
  SearchSource,
} from "./types";

/** The tag prefixes whose invalidation makes the index stale (spec 012b §5.4). */
export const SEARCH_STALE_TAG_PREFIXES = [
  "catalog:",
  "product:",
  "country:",
] as const;

export type IndexTrigger = "initial" | "invalidate" | "ttl";

/** What one search returns: the view for the page, and the numbers its log line needs (§11). */
export interface SearchOutcome {
  readonly view: SearchResultView;
  /** Results per match tier, 1 to 5 (never a band, never a margin). */
  readonly tierCounts: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
  /** Which build of the index answered. */
  readonly generation: number;
}

export interface SearchEngine {
  search(request: SearchRequest): Promise<SearchOutcome>;
}

export interface SearchIndexStats {
  /** Seconds since the current index was built, or `null` before the first build. */
  readonly ageSeconds: number | null;
  readonly documents: number;
  readonly generation: number;
}

export interface MemoryEngine extends SearchEngine {
  stats(): SearchIndexStats;
}

interface IndexLog {
  info(fields: Record<string, unknown>, msg?: string): void;
}

export interface MemoryEngineDeps {
  /**
   * The source, or a factory called once per build (production passes `catalogSearchSource`, so
   * each build reads the catalogue afresh through a source with an empty memo).
   */
  readonly source: SearchSource | (() => SearchSource);
  /** Milliseconds since the epoch. Default `Date.now`. */
  readonly now?: () => number;
  /** Register the invalidation listener (`onInvalidate` from `src/lib/cache.ts` in production). */
  readonly subscribe?: (listener: (tags: readonly string[]) => void) => unknown;
  readonly log?: IndexLog;
  readonly config?: SearchConfig;
}

interface BuiltIndex {
  readonly index: SearchIndex;
  readonly builtAt: number;
  readonly generation: number;
  /** Per locale, the words that name each destination. */
  readonly words: ReadonlyMap<LocaleCode, readonly DestinationWords[]>;
}

function truncateCodePoints(text: string, max: number): string {
  const points = [...text];
  return points.length > max ? points.slice(0, max).join("") : text;
}

/** NFC, control characters removed, trimmed, at most `max` code points (§5.2's `q` rule). */
export function cleanQuery(raw: string, max: number): string {
  let cleaned = "";
  for (const char of raw.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || (code >= 0x7f && code < 0xa0) ? " " : char;
  }
  return truncateCodePoints(cleaned.trim(), max).trim();
}

function wordsFor(locale: LocaleIndex): DestinationWords[] {
  return [...locale.destinations.values()].map((destination) => ({
    iso2: destination.iso2,
    phrases: destination.words
      .map((word) => destinationPhrase(word))
      .filter((phrase) => phrase.length > 0),
  }));
}

/** "Our selection": the destination's default order (band, photograph, curation, SKU). */
function selectionOrder(index: DestinationIndex): IndexedDocument[] {
  return [...index.documents].sort(
    (left, right) =>
      right.marginBand - left.marginBand ||
      (left.hasPhoto === right.hasPhoto ? 0 : left.hasPhoto ? -1 : 1) ||
      left.curationIndex - right.curationIndex ||
      (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0),
  );
}

function rankMatches(matches: readonly Match[]): Match[] {
  return rankSearchResults(
    matches.map((match) => ({
      sku: match.sku,
      tier: match.tier,
      band: match.band,
      marginBand: match.document.marginBand,
      saleable: match.document.saleable,
      hasPhoto: match.document.hasPhoto,
      curationIndex: match.document.curationIndex,
      match,
    })),
  ).map((entry) => entry.match);
}

function emptyTierCounts(): Record<1 | 2 | 3 | 4 | 5, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

export function memoryEngine(deps: MemoryEngineDeps): MemoryEngine {
  const config = deps.config ?? SEARCH_CONFIG;
  const now = deps.now ?? Date.now;
  let current: BuiltIndex | undefined;
  let building: Promise<BuiltIndex> | undefined;
  let stale = false;
  let generation = 0;

  deps.subscribe?.((tags) => {
    if (
      tags.some((tag) =>
        SEARCH_STALE_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix)),
      )
    ) {
      stale = true;
    }
  });

  async function build(trigger: IndexTrigger): Promise<BuiltIndex> {
    stale = false;
    const started = now();
    const index = await buildIndex(sourceNow());
    const words = new Map<LocaleCode, readonly DestinationWords[]>();
    for (const [locale, entry] of index.locales)
      words.set(locale, wordsFor(entry));
    generation += 1;
    const built: BuiltIndex = {
      index,
      builtAt: now(),
      generation,
      words,
    };
    // §11: documents, locales, duration and trigger; never a query, a band or a money value.
    deps.log?.info(
      {
        event: "search.index_built",
        documents: index.documents,
        locales: index.locales.size,
        duration_ms: built.builtAt - started,
        trigger,
        generation,
      },
      "search index built",
    );
    return built;
  }

  function freshIndex(): Promise<BuiltIndex> {
    if (building !== undefined) return building;
    let trigger: IndexTrigger | undefined;
    if (current === undefined) trigger = "initial";
    else if (stale) trigger = "invalidate";
    else if (now() - current.builtAt > config.indexMaxAgeSeconds * 1000) {
      trigger = "ttl";
    }
    if (trigger === undefined && current !== undefined) {
      return Promise.resolve(current);
    }
    building = build(trigger ?? "ttl").then(
      (built) => {
        current = built;
        building = undefined;
        return built;
      },
      (error: unknown) => {
        building = undefined;
        throw error;
      },
    );
    return building;
  }

  function sourceNow(): SearchSource {
    return typeof deps.source === "function" ? deps.source() : deps.source;
  }

  async function cards(
    locale: LocaleCode,
    iso2: string,
    documents: readonly IndexedDocument[],
  ): Promise<SearchResultView["cards"]> {
    if (documents.length === 0) return [];
    return sourceNow().cards(
      locale,
      iso2,
      documents.map((document) => document.sku),
    );
  }

  /**
   * The Pages block's hub links (§2.3): matched hubs, occasions before categories, then by label in
   * the locale's collation, each resolved to a page that exists, until the block is full.
   */
  async function addHubLinks(
    pages: PageLink[],
    locale: LocaleCode,
    iso2: string,
    shop: DestinationIndex,
    tokens: readonly string[],
  ): Promise<void> {
    const compare = collator(locale);
    const ordered = matchHubs(shop.hubs, tokens, config)
      .map(({ hub }) => hub)
      .sort(
        (left, right) =>
          (left.kind === right.kind ? 0 : left.kind === "occasion" ? -1 : 1) ||
          compare.compare(left.label, right.label),
      );
    const source = sourceNow();
    for (const hub of ordered) {
      if (pages.length >= config.pagesBlockMax) return;
      const href = await source.hubHref(locale, iso2, hub);
      if (href === undefined) continue;
      if (pages.some((existing) => existing.href === href)) continue;
      pages.push({ kind: hub.kind, label: hub.label, href });
    }
  }

  async function search(request: SearchRequest): Promise<SearchOutcome> {
    const parsedRequest = SearchRequestSchema.parse(request);
    const locale = parsedRequest.locale as LocaleCode;
    const { page } = parsedRequest;
    const built = await freshIndex();
    const localeIndex = built.index.locales.get(locale);
    const query = cleanQuery(parsedRequest.query, config.maxQueryChars);
    const parsed = parseQuery(
      query,
      locale,
      built.words.get(locale) ?? [],
      config,
    );

    // Words, then `to`, then none (§2.4). `to` counts only when it is a destination we know.
    const fromTo =
      parsedRequest.to !== undefined &&
      localeIndex?.destinations.has(parsedRequest.to) === true
        ? parsedRequest.to
        : undefined;
    const destination = parsed.destination ?? fromTo;
    const shop =
      destination === undefined
        ? undefined
        : localeIndex?.shops.get(destination);

    const pages: PageLink[] = [];
    if (parsed.destination !== undefined) {
      const named = localeIndex?.destinations.get(parsed.destination);
      if (named?.shopHref !== undefined) {
        pages.push({ kind: "shop", href: named.shopHref });
      } else if (named?.corridorHref !== undefined) {
        pages.push({ kind: "corridor", href: named.corridorHref });
      }
    }

    const tierCounts = emptyTierCounts();
    const outcome = (
      fields: Pick<
        SearchResultView,
        "pages" | "cards" | "selection" | "count" | "pageCount" | "state"
      > & { readonly didYouMean?: string | null },
    ): SearchOutcome => ({
      view: SearchResultViewSchema.parse({
        query,
        destination: destination ?? null,
        dateApplied: null,
        hiddenByDate: 0,
        page,
        didYouMean: null,
        ...fields,
      }),
      tierCounts,
      generation: built.generation,
    });
    const selection = async (): Promise<SearchResultView["selection"]> =>
      shop === undefined || destination === undefined
        ? []
        : cards(
            locale,
            destination,
            selectionOrder(shop).slice(0, config.pageSize),
          );

    // No destination: the country-less state (§2.7, frame 3). Its core-range cards are the
    // results route's, with the chooser (TASK-402); the engine names the state and stops.
    if (destination === undefined) {
      return outcome({
        pages,
        cards: [],
        selection: [],
        count: 0,
        pageCount: 0,
        state: "noDestination",
      });
    }

    let early: SearchState | undefined;
    if (query === "") early = "empty";
    else if (parsed.letters < config.minQueryLetters) early = "tooShort";
    else if (parsed.tokens.length === 0) early = "empty";
    else if (shop === undefined) early = "noResults";
    if (early !== undefined || shop === undefined) {
      return outcome({
        pages,
        cards: [],
        selection: await selection(),
        count: 0,
        pageCount: 0,
        state: early ?? "noResults",
      });
    }

    await addHubLinks(pages, locale, destination, shop, parsed.tokens);
    const linked = pages.slice(0, config.pagesBlockMax);

    const ranked = rankMatches(matchDocuments(shop, parsed.tokens, config));
    for (const match of ranked) tierCounts[match.tier] += 1;

    if (ranked.length === 0) {
      return outcome({
        pages: linked,
        cards: [],
        selection: await selection(),
        count: 0,
        pageCount: 0,
        didYouMean: didYouMean(shop, parsed.tokens, locale, config),
        state: "noResults",
      });
    }

    const pageCount = Math.min(
      Math.ceil(ranked.length / config.pageSize),
      config.maxPages,
    );
    if (page > pageCount) {
      return outcome({
        pages: linked,
        cards: [],
        selection: [],
        count: ranked.length,
        pageCount,
        state: "outOfRange",
      });
    }
    const slice = ranked
      .slice((page - 1) * config.pageSize, page * config.pageSize)
      .map((match) => match.document);
    return outcome({
      pages: linked,
      cards: await cards(locale, destination, slice),
      selection: [],
      count: ranked.length,
      pageCount,
      state: "results",
    });
  }

  return {
    search,
    stats(): SearchIndexStats {
      if (current === undefined) {
        return { ageSeconds: null, documents: 0, generation };
      }
      return {
        ageSeconds: Math.max(0, Math.floor((now() - current.builtAt) / 1000)),
        documents: current.index.documents,
        generation: current.generation,
      };
    },
  };
}
