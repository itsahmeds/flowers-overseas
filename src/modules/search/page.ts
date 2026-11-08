/**
 * The results page's view (spec 045 §2.2, §2.4, §2.7, §5.3, §11; TASK-402): the URL's
 * parameters through `searchParamsSchema`, one `search()`, and the page's own reads around it,
 * resolved into data the components render. The route file stays thin: it calls `searchPage()`
 * and renders, or answers 404.
 *
 * What it adds to the engine's view, each from data:
 *
 *  - the destination with a shop, its name and whether ordering is open there (the quiet line's
 *    "Ordering opens soon" while it is not: a `demo` destination's state line, as its listing);
 *  - the chip's select options: the shop countries in the locale's collation (§14
 *    A-founder-2026-11-08a item 1, AC-40);
 *  - "Browse by occasion": exactly the occasion links the page's header draws (the header of a
 *    search page is out of context, so the hubs);
 *  - the `search.request` log line, and `alert=search.slow` (§11). Never the query: the line holds
 *    the locale, the destination, the state, the tier counts, the result count, the page, the
 *    duration and the index generation.
 *
 * No header, cookie or IP is read (ADR-0006, AC-14), and no country is named.
 */
import {
  type CountryIso2,
  countryConfig,
  deliveryDatesOpen,
  isCountryIso2,
} from "@/config/countries";
import { type LocaleCode, localeConfig } from "@/config/locales";
import { logger } from "@/lib/logger";
import { raiseLegacyAlert } from "@/modules/ops";
import { type SearchEvent, searchEvent } from "@/modules/analytics";
import {
  countryDisplayName,
  megaMenuModel,
  shopCountries,
} from "@/modules/catalog";
import { collator } from "@/modules/i18n";

import { searchEngine } from "./default-engine";
import type { SearchEngine } from "./engine";
import { type RateLimiter, searchGate } from "./gate";
import { type SearchParams, searchParamsSchema } from "./params";
import { NO_GROUPS, type SearchResultView } from "./schemas";
import { normaliseForSearch, tokenise } from "./text";

/** `/{locale}/{searchSegment}`: the bare search path, the page's canonical (§6). */
export function searchPath(locale: LocaleCode): string {
  return `/${locale}/${localeConfig(locale).pathSegments.search}`;
}

/** One option of the chip's destination select. */
export interface SearchCountryOption {
  /** Lowercase, the form's `to`. */
  readonly code: string;
  readonly name: string;
}

/** One "Browse by occasion" link: the header's own entry. */
export interface SearchOccasionLink {
  readonly id: string;
  readonly href: string;
  /** The hub's own name where the menu prints it, else `labelKey`'s text. */
  readonly label: string | undefined;
  readonly labelKey: string;
}

export interface SearchPageView {
  readonly locale: LocaleCode;
  /** The bare search path: the forms' `action`, the canonical. */
  readonly path: string;
  readonly result: SearchResultView;
  /** The destination searched, with a shop; `null` is the country-less state. */
  readonly destination: {
    readonly code: string;
    readonly name: string;
    /** `deliveryDatesOpen`: false for a `demo` destination, whose quiet line says so. */
    readonly orderingOpen: boolean;
  } | null;
  /** The chip's select: `shopCountries(locale)` in `Intl.Collator(locale)` order (AC-40). */
  readonly destinations: readonly SearchCountryOption[];
  readonly occasions: readonly SearchOccasionLink[];
  /**
   * The GA4 `search` event (§8, AC-23; TASK-403): counts only, never the words; `null` with no
   * words and in the "rate limited" state.
   */
  readonly analytics: SearchEvent | null;
}

/**
 * `rateLimited` (§2.7, AC-26; TASK-403): the proxy refused the request (429 or 503, its status), or
 * the process reached its concurrency cap between the proxy's check and this search. The view has
 * the words and the destination for the form and nothing searched.
 */
export type SearchPageOutcome =
  | { readonly kind: "page"; readonly view: SearchPageView }
  | { readonly kind: "rateLimited"; readonly view: SearchPageView }
  | { readonly kind: "notFound" };

/** `alert=search.slow` (§11): more than 10 requests over 1 000 ms within 5 minutes. */
export const SLOW_SEARCH_MS = 1000;
export const SLOW_SEARCH_COUNT = 10;
export const SLOW_SEARCH_WINDOW_MS = 5 * 60 * 1000;

/**
 * The slow-request counter behind `alert=search.slow`: per process, timestamps only (never a
 * query). Raises the alert once when the count in the window passes `SLOW_SEARCH_COUNT`, and again
 * only after the window has emptied.
 */
export function slowSearchMonitor(raise: (alert: string) => void): {
  record(durationMs: number, at: number): void;
} {
  let slow: number[] = [];
  let raised = false;
  return {
    record(durationMs, at) {
      slow = slow.filter((time) => at - time < SLOW_SEARCH_WINDOW_MS);
      if (slow.length === 0) raised = false;
      if (durationMs <= SLOW_SEARCH_MS) return;
      slow.push(at);
      if (slow.length > SLOW_SEARCH_COUNT && !raised) {
        raised = true;
        raise("search.slow");
      }
    },
  };
}

const slowSearches = slowSearchMonitor((alert) => {
  logger.error({ alert }, "search slow");
  raiseLegacyAlert(alert);
});

interface RequestLog {
  info(fields: Record<string, unknown>, msg?: string): void;
}

export interface SearchPageDeps {
  readonly engine?: SearchEngine;
  readonly now?: () => number;
  readonly log?: RequestLog;
  readonly slow?: { record(durationMs: number, at: number): void };
  /** The shop countries in the one country order (`shopCountries`). */
  readonly shops?: (locale: LocaleCode) => Promise<readonly string[]>;
  readonly takesDates?: (iso2: string) => boolean;
}

function takesDatesFromRegistry(iso2: string): boolean {
  const upper = iso2.toUpperCase();
  return isCountryIso2(upper) && deliveryDatesOpen(upper);
}

function countryOption(
  iso2: CountryIso2,
  locale: LocaleCode,
): SearchCountryOption {
  return {
    code: iso2.toLowerCase(),
    name: countryDisplayName(countryConfig(iso2), locale),
  };
}

/** The chip's options: every shop country, by name in the locale's collation. */
function countryOptions(
  codes: readonly CountryIso2[],
  locale: LocaleCode,
): SearchCountryOption[] {
  const compare = collator(locale);
  return codes
    .map((iso2) => countryOption(iso2, locale))
    .sort((left, right) => compare.compare(left.name, right.name));
}

/** The header's occasion links, out of context: the occasions panel's entries that are links. */
async function occasionLinks(
  locale: LocaleCode,
): Promise<SearchOccasionLink[]> {
  const model = await megaMenuModel(locale, null);
  const panel = model.panels.find((entry) => entry.id === "occasions");
  if (panel === undefined) return [];
  return panel.columns.flatMap((column) =>
    column.entries.flatMap((entry): SearchOccasionLink[] =>
      entry.kind === "link"
        ? [
            {
              id: entry.id,
              href: entry.href,
              label: entry.label,
              labelKey: entry.labelKey,
            },
          ]
        : [],
    ),
  );
}

/**
 * One results page. `raw` is Next's `searchParams` as the route received it. `notFound` for a bad
 * `page` (before the engine) and for a page past the last (`outOfRange`), both spec 008's 404.
 */
export async function searchPage(
  locale: LocaleCode,
  raw: Readonly<Record<string, string | string[] | undefined>>,
  deps: SearchPageDeps = {},
): Promise<SearchPageOutcome> {
  const now = deps.now ?? Date.now;
  const started = now();
  const shopCodes = (await (deps.shops ?? shopCountries)(locale)).filter(
    isCountryIso2,
  );
  const params: SearchParams = searchParamsSchema({
    shops: new Set(shopCodes.map((iso2) => iso2.toLowerCase())),
    takesDates: deps.takesDates ?? takesDatesFromRegistry,
  }).parse(raw);
  if (params.page === "notFound") return { kind: "notFound" };

  const outcome = await (deps.engine ?? searchEngine()).search({
    locale,
    query: params.q,
    ...(params.to === undefined ? {} : { to: params.to }),
    ...(params.date === undefined ? {} : { date: params.date }),
    page: params.page,
  });
  const { view } = outcome;

  const durationMs = now() - started;
  // §11's request line. Never the query, an address, a band or a money value.
  (deps.log ?? logger).info(
    {
      event: "search.request",
      locale,
      destination: view.destination,
      state: view.countryLess?.state ?? view.state,
      tier_counts: outcome.tierCounts,
      results: view.count,
      page: view.page,
      duration_ms: durationMs,
      generation: outcome.generation,
    },
    "search request",
  );
  (deps.slow ?? slowSearches).record(durationMs, now());

  if (view.state === "outOfRange") return { kind: "notFound" };

  const destination =
    view.destination !== null && isCountryIso2(view.destination)
      ? view.destination
      : undefined;

  return {
    kind: "page",
    view: {
      locale,
      path: searchPath(locale),
      result: view,
      destination:
        destination === undefined
          ? null
          : {
              ...countryOption(destination, locale),
              orderingOpen: deliveryDatesOpen(destination),
            },
      destinations: countryOptions(shopCodes, locale),
      occasions: await occasionLinks(locale),
      analytics: searchEvent({
        locale,
        destination: view.destination,
        count: view.count,
        tokens: tokenise(normaliseForSearch(view.query), locale).length,
      }),
    },
  };
}

/** A result with nothing searched: the words for the form, the destination for its select. */
function unsearched(
  query: string,
  destination: string | null,
): SearchResultView {
  return {
    query,
    queryWithoutDestination: query,
    destination,
    dateApplied: null,
    hiddenByDate: 0,
    groups: NO_GROUPS,
    cards: [],
    selection: [],
    count: 0,
    page: 1,
    pageCount: 0,
    didYouMean: null,
    state: "empty",
    countryLess: null,
  };
}

/**
 * The "rate limited" state's view (§2.7, AC-26; TASK-403): the parameters through the same
 * schema, so the form keeps the words and the destination select its country, and **no search**:
 * no engine call, no catalogue list, no request log (the proxy logged `search.rate_limited`).
 */
export async function rateLimitedSearchPage(
  locale: LocaleCode,
  raw: Readonly<Record<string, string | string[] | undefined>>,
  deps: Pick<SearchPageDeps, "shops" | "takesDates"> = {},
): Promise<SearchPageView> {
  const shopCodes = (await (deps.shops ?? shopCountries)(locale)).filter(
    isCountryIso2,
  );
  const params = searchParamsSchema({
    shops: new Set(shopCodes.map((iso2) => iso2.toLowerCase())),
    takesDates: deps.takesDates ?? takesDatesFromRegistry,
  }).parse(raw);
  const to =
    params.to !== undefined && isCountryIso2(params.to.toUpperCase())
      ? (params.to.toUpperCase() as CountryIso2)
      : undefined;
  return {
    locale,
    path: searchPath(locale),
    result: unsearched(params.q, to ?? null),
    destination:
      to === undefined
        ? null
        : {
            ...countryOption(to, locale),
            orderingOpen: deliveryDatesOpen(to),
          },
    destinations: countryOptions(shopCodes, locale),
    occasions: [],
    analytics: null,
  };
}

export interface SearchRouteOptions {
  /** The proxy refused this request and rewrote it to the "rate limited" route. */
  readonly refused: boolean;
  readonly gate?: RateLimiter;
  readonly deps?: SearchPageDeps;
}

/**
 * What the route renders (§2.7, §2.8, AC-26; TASK-403): the "rate limited" view when the proxy
 * refused the request, else one search counted against the process's concurrency cap (`enter()`
 * before, `leave()` after, even when the search throws). A search that finds the cap reached here,
 * after the proxy let it through, renders the "rate limited" state too: the cap is never exceeded.
 */
export async function searchRoutePage(
  locale: LocaleCode,
  raw: Readonly<Record<string, string | string[] | undefined>>,
  options: SearchRouteOptions,
): Promise<SearchPageOutcome> {
  const deps = options.deps ?? {};
  if (options.refused) {
    return {
      kind: "rateLimited",
      view: await rateLimitedSearchPage(locale, raw, deps),
    };
  }
  const gate = options.gate ?? searchGate();
  if (!gate.enter()) {
    return {
      kind: "rateLimited",
      view: await rateLimitedSearchPage(locale, raw, deps),
    };
  }
  try {
    return await searchPage(locale, raw, deps);
  } finally {
    gate.leave();
  }
}

/**
 * What the results page's header field holds (spec 045 §14 A-founder-2026-11-08a item 2, AC-43):
 * the words as the page searched them (`value`) and the destination parameter, checked against
 * the locale's shop countries exactly as the page checks it. Read by the `@header` slot of the
 * results route, which is dynamic; prebuilt pages never call it, so their field has no `value`.
 */
export async function headerSearchValue(
  locale: LocaleCode,
  raw: Readonly<Record<string, string | string[] | undefined>>,
  deps: Pick<SearchPageDeps, "shops" | "takesDates"> = {},
): Promise<{ readonly q: string; readonly to: string | undefined }> {
  const shopCodes = (await (deps.shops ?? shopCountries)(locale)).filter(
    isCountryIso2,
  );
  const params = searchParamsSchema({
    shops: new Set(shopCodes.map((iso2) => iso2.toLowerCase())),
    takesDates: deps.takesDates ?? takesDatesFromRegistry,
  }).parse(raw);
  return { q: params.q, to: params.to };
}
