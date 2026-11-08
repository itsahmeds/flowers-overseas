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
import {
  type Match,
  matchCountries,
  matchDocuments,
  matchHubs,
  matchInfoPages,
} from "./match";
import {
  type DestinationWords,
  type ParsedQuery,
  destinationPhrase,
  parseQuery,
  withoutDestinationWords,
} from "./query";
import { rankSearchResults } from "./rank";
import {
  NO_GROUPS,
  type PageLink,
  type SearchGroups,
  type SearchRequest,
  SearchRequestSchema,
  type SearchResultView,
  SearchResultViewSchema,
  type SearchState,
  type SuggestItem,
  type SuggestRequest,
  SuggestRequestSchema,
  SuggestResponseSchema,
} from "./schemas";
import { tokenise } from "./text";
import type {
  DestinationIndex,
  IndexedDocument,
  LocaleIndex,
  SearchHub,
  SearchIndex,
  SearchSource,
} from "./types";

/** At most this many bouquets among the suggestions (§14 A-founder-2026-11-08a item 3). */
export const SUGGEST_PRODUCTS_MAX = 3;

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
  /** The suggestions island's answer (§14 A-founder-2026-11-08a item 3). */
  suggest(request: SuggestRequest): Promise<SuggestItem[]>;
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
   * The four link groups (§14 A-founder-2026-11-08a item 1): Destinations (registry countries a
   * query word names, before the destination words leave the query), Occasions and Flowers (§2.3's
   * Pages rule split in two, each link the destination's country page where one exists, else the
   * hub, and only a page that answers 200), and Help (spec 041's info pages in the locale). Each
   * at most `pagesBlockMax`, by tier, then the locale's collation (Help: spec 041's page order).
   * The same for every visitor: nothing about the visitor is an input (ADR-0006).
   */
  async function linkGroups(
    locale: LocaleCode,
    localeIndex: LocaleIndex | undefined,
    parsed: ParsedQuery,
    destination: string | undefined,
  ): Promise<SearchGroups> {
    if (localeIndex === undefined) return NO_GROUPS;
    const max = config.pagesBlockMax;
    const compare = collator(locale);

    const destinations: PageLink[] = [];
    const countryWords = tokenise(
      parsed.normalised,
      locale,
      config.maxTokens,
      config,
    );
    const countries = matchCountries(
      localeIndex.countries,
      countryWords,
      config,
    )
      .flatMap((match) => {
        const href = match.item.shopHref ?? match.item.corridorHref;
        const label = match.item.name;
        return href === undefined || label === undefined
          ? []
          : [{ tier: match.tier, label, href }];
      })
      .sort(
        (left, right) =>
          right.tier - left.tier || compare.compare(left.label, right.label),
      );
    for (const country of countries) {
      if (destinations.length >= max) break;
      if (destinations.some((link) => link.href === country.href)) continue;
      destinations.push({ label: country.label, href: country.href });
    }

    const source = sourceNow();
    const hubLinks = async (kind: SearchHub["kind"]): Promise<PageLink[]> => {
      const ordered = matchHubs(localeIndex.hubs, parsed.tokens, config)
        .map(({ hub }) => hub)
        .filter((hub) => hub.kind === kind)
        .sort((left, right) => compare.compare(left.label, right.label));
      const links: PageLink[] = [];
      for (const hub of ordered) {
        if (links.length >= max) break;
        const href = await source.hubHref(locale, destination, hub);
        if (href === undefined) continue;
        if (links.some((link) => link.href === href)) continue;
        links.push({ label: hub.label, href });
      }
      return links;
    };

    const help = matchInfoPages(localeIndex.info, parsed.tokens, config)
      .sort(
        (left, right) =>
          right.tier - left.tier || left.item.order - right.item.order,
      )
      .slice(0, max)
      .map(({ item }) => ({ label: item.title, href: item.href }));

    return {
      destinations,
      occasions: await hubLinks("occasion"),
      categories: await hubLinks("category"),
      help,
    };
  }

  /** The words, the destination and the groups one request resolves to (search and suggest). */
  async function resolve(
    locale: LocaleCode,
    raw: string,
    to: string | undefined,
  ): Promise<{
    readonly built: BuiltIndex;
    readonly localeIndex: LocaleIndex | undefined;
    readonly query: string;
    readonly parsed: ParsedQuery;
    readonly destination: string | undefined;
    readonly searchable: boolean;
    readonly groups: SearchGroups;
    readonly queryWithoutDestination: string;
  }> {
    const built = await freshIndex();
    const localeIndex = built.index.locales.get(locale);
    const query = cleanQuery(raw, config.maxQueryChars);
    const words = built.words.get(locale) ?? [];
    const parsed = parseQuery(query, locale, words, config);
    // Words, then `to`, then none (§2.4). `to` counts only when it is a destination we know.
    const fromTo =
      to !== undefined && localeIndex?.destinations.has(to) === true
        ? to
        : undefined;
    const destination = parsed.destination ?? fromTo;
    const searchable = query !== "" && parsed.letters >= config.minQueryLetters;
    return {
      built,
      localeIndex,
      query,
      parsed,
      destination,
      searchable,
      groups: searchable
        ? await linkGroups(locale, localeIndex, parsed, destination)
        : NO_GROUPS,
      queryWithoutDestination:
        parsed.destination === undefined
          ? query
          : withoutDestinationWords(query, words),
    };
  }

  async function search(request: SearchRequest): Promise<SearchOutcome> {
    const parsedRequest = SearchRequestSchema.parse(request);
    const locale = parsedRequest.locale as LocaleCode;
    const { page } = parsedRequest;
    const resolved = await resolve(
      locale,
      parsedRequest.query,
      parsedRequest.to,
    );
    const { built, localeIndex, query, parsed, destination, groups } = resolved;
    const shop =
      destination === undefined
        ? undefined
        : localeIndex?.shops.get(destination);

    const tierCounts = emptyTierCounts();
    const outcome = (
      fields: Pick<
        SearchResultView,
        "cards" | "selection" | "count" | "pageCount" | "state"
      > &
        Partial<
          Pick<
            SearchResultView,
            "didYouMean" | "countryLess" | "dateApplied" | "hiddenByDate"
          >
        >,
    ): SearchOutcome => ({
      view: SearchResultViewSchema.parse({
        query,
        queryWithoutDestination: resolved.queryWithoutDestination,
        destination: destination ?? null,
        dateApplied: null,
        hiddenByDate: 0,
        groups,
        page,
        didYouMean: null,
        countryLess: null,
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

    // No destination: the country-less bouquets (§14 A-founder-2026-11-08a item 1, group 5). The
    // words are matched among `coreRange(locale)` only, by the same tiers and §2.5's key with
    // every band 0, and drawn as country-less cards: no price anywhere.
    if (destination === undefined) {
      return countryLessOutcome(
        locale,
        localeIndex?.core,
        query,
        parsed,
        page,
        outcome,
      );
    }

    let early: SearchState | undefined;
    if (query === "") early = "empty";
    else if (parsed.letters < config.minQueryLetters) early = "tooShort";
    else if (parsed.tokens.length === 0) early = "empty";
    else if (shop === undefined) early = "noResults";
    if (early !== undefined || shop === undefined) {
      return outcome({
        cards: [],
        selection: await selection(),
        count: 0,
        pageCount: 0,
        state: early ?? "noResults",
      });
    }

    const matched = rankMatches(matchDocuments(shop, parsed.tokens, config));
    // The date (§2.4 "Deliverability"; AC-15): honoured only when the destination takes delivery
    // dates and the date is bookable; what cannot arrive on it leaves the results and is counted.
    const dateApplied =
      parsedRequest.date !== undefined &&
      (await sourceNow().dateOpen?.(destination, parsedRequest.date)) === true
        ? parsedRequest.date
        : null;
    let ranked = matched;
    if (dateApplied !== null) {
      const source = sourceNow();
      const kept: Match[] = [];
      for (const match of matched) {
        if (
          (await source.deliverableOn?.(
            destination,
            match.sku,
            dateApplied,
          )) !== false
        ) {
          kept.push(match);
        }
      }
      ranked = kept;
    }
    const dated = {
      dateApplied,
      hiddenByDate: matched.length - ranked.length,
    };
    for (const match of ranked) tierCounts[match.tier] += 1;

    if (ranked.length === 0) {
      return outcome({
        cards: [],
        selection: await selection(),
        count: 0,
        pageCount: 0,
        // "Did you mean" only when the words matched nothing (not when a date hid them all).
        didYouMean:
          matched.length === 0
            ? didYouMean(shop, parsed.tokens, locale, config)
            : null,
        state: "noResults",
        ...dated,
      });
    }

    const pageCount = Math.min(
      Math.ceil(ranked.length / config.pageSize),
      config.maxPages,
    );
    if (page > pageCount) {
      return outcome({
        cards: [],
        selection: [],
        count: ranked.length,
        pageCount,
        state: "outOfRange",
        ...dated,
      });
    }
    const slice = ranked
      .slice((page - 1) * config.pageSize, page * config.pageSize)
      .map((match) => match.document);
    return outcome({
      cards: await cards(locale, destination, slice),
      selection: [],
      count: ranked.length,
      pageCount,
      state: "results",
      ...dated,
    });
  }

  /**
   * Suggestions as the buyer types (§14 A-founder-2026-11-08a item 3): at most `suggestMax`, at
   * most 3 bouquets first (the destination's listing set, else `coreRange(locale)`), then
   * occasions, flowers, countries and help pages, from the same groups the results page draws.
   * Never a price: a suggestion has a kind, a name and a link.
   */
  async function suggest(request: SuggestRequest): Promise<SuggestItem[]> {
    const parsedRequest = SuggestRequestSchema.parse(request);
    const locale = parsedRequest.locale as LocaleCode;
    const to = parsedRequest.to?.toUpperCase();
    const resolved = await resolve(locale, parsedRequest.q, to);
    if (!resolved.searchable) return [];
    const { localeIndex, parsed, destination, groups } = resolved;
    const items: SuggestItem[] = [];
    if (parsed.tokens.length > 0) {
      const index =
        destination === undefined
          ? localeIndex?.core
          : localeIndex?.shops.get(destination);
      if (index !== undefined) {
        const top = rankMatches(matchDocuments(index, parsed.tokens, config))
          .slice(0, SUGGEST_PRODUCTS_MAX)
          .map((match) => match.document);
        const productCards =
          destination === undefined || index === localeIndex?.core
            ? await countryLessCards(locale, top)
            : await cards(locale, destination, top);
        for (const card of productCards) {
          if (card.href === undefined) continue;
          items.push({ kind: "product", label: card.name, href: card.href });
        }
      }
    }
    const rest: [SuggestItem["kind"], readonly PageLink[]][] = [
      ["occasion", groups.occasions],
      ["category", groups.categories],
      ["destination", groups.destinations],
      ["page", groups.help],
    ];
    for (const [kind, links] of rest) {
      for (const link of links) items.push({ kind, ...link });
    }
    return SuggestResponseSchema.parse(items.slice(0, config.suggestMax));
  }

  async function countryLessCards(
    locale: LocaleCode,
    documents: readonly IndexedDocument[],
  ): Promise<NonNullable<SearchResultView["countryLess"]>["cards"]> {
    if (documents.length === 0) return [];
    return (
      (await sourceNow().countryLessCards?.(
        locale,
        documents.map((document) => document.sku),
      )) ?? []
    );
  }

  /**
   * The country-less bouquets (§14 A-founder-2026-11-08a item 1, group 5): the same steps as a
   * destination's search over `core`, its cards country-less. The link groups are the caller's.
   */
  async function countryLessOutcome(
    locale: LocaleCode,
    core: DestinationIndex | undefined,
    query: string,
    parsed: ParsedQuery,
    page: number,
    outcome: (
      fields: Pick<
        SearchResultView,
        "cards" | "selection" | "count" | "pageCount" | "state"
      > &
        Partial<Pick<SearchResultView, "didYouMean" | "countryLess">>,
    ) => SearchOutcome,
  ): Promise<SearchOutcome> {
    const empty = {
      cards: [],
      selection: [],
      count: 0,
      pageCount: 0,
      state: "noDestination" as const,
    };
    const selection = async (): Promise<
      NonNullable<SearchResultView["countryLess"]>["selection"]
    > =>
      core === undefined
        ? []
        : countryLessCards(
            locale,
            selectionOrder(core).slice(0, config.pageSize),
          );
    let early: "empty" | "tooShort" | undefined;
    if (query === "" || parsed.tokens.length === 0) early = "empty";
    if (query !== "" && parsed.letters < config.minQueryLetters) {
      early = "tooShort";
    }
    if (early !== undefined || core === undefined) {
      return outcome({
        ...empty,
        countryLess: {
          state: early ?? "noResults",
          cards: [],
          selection: await selection(),
        },
      });
    }
    const ranked = rankMatches(matchDocuments(core, parsed.tokens, config));
    if (ranked.length === 0) {
      return outcome({
        ...empty,
        didYouMean: didYouMean(core, parsed.tokens, locale, config),
        countryLess: {
          state: "noResults",
          cards: [],
          selection: await selection(),
        },
      });
    }
    const pageCount = Math.min(
      Math.ceil(ranked.length / config.pageSize),
      config.maxPages,
    );
    if (page > pageCount) {
      return outcome({
        ...empty,
        count: ranked.length,
        pageCount,
        state: "outOfRange",
      });
    }
    return outcome({
      ...empty,
      count: ranked.length,
      pageCount,
      countryLess: {
        state: "results",
        cards: await countryLessCards(
          locale,
          ranked
            .slice((page - 1) * config.pageSize, page * config.pageSize)
            .map((match) => match.document),
        ),
        selection: [],
      },
    });
  }

  return {
    search,
    suggest,
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
