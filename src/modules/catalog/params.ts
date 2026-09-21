/**
 * The listing **parameter policy**: what a query string on a listing URL does (spec 008 §2 "Sort,
 * filters, pagination", §5.2 `ListingSearchParamsSchema`, §6 "Crawl efficiency", §13 **Q2**,
 * **Q3**, **Q6**, AC-9, AC-10, AC-15; TASK-114).
 *
 * One function decides everything a route may do with `?…`, so the six page types cannot answer
 * the same query three ways. `ListingSearchParamsSchema` (TASK-105) already *parses* the string
 * and can never fail — every parameter is honoured (`page`, `sort`) or neutralised. What it
 * deliberately left open is the part that needs the rest of the request: the redirect, the
 * canonical and the robots term. That is this file, and it is pure: no `searchParams` read, no
 * `headers()`, no cookie, no clock.
 *
 * ## The decision table (the whole of AC-10 and AC-15)
 *
 * | Query on `/{locale}/{country}/{shopCategory}` | Answer |
 * |---|---|
 * | *(none)* | 200, page 1, curation order, self-canonical, base directive |
 * | `?page=1` | **permanent redirect to the bare URL** — the one redirect on a listing |
 * | `?page=N`, `2 ≤ N ≤ pageCount` | 200, self-canonical **with** `?page=N`, `· Page N` title |
 * | `?page=N`, `N > pageCount` | **404** (`listingView()` answers `undefined`; never an empty grid) |
 * | `?page=0`, `?page=1.5`, `?page=abc` | 200 page 1, and a **neutralised** parameter: `noindex,follow`, canonical to the base |
 * | `?sort=price-asc` (or any valid sort, `default` included) | 200 sorted, `noindex,follow`, canonical to the base |
 * | `?sort=banana`, `?colour=red`, `?utm_source=x` | 200 base content, `noindex,follow`, canonical to the base |
 *
 * **Why a malformed `page` is neutralised rather than redirected** (`/review 72`'s carry-forward,
 * ruled here): `ListingSearchParamsSchema` reads an invalid value as absent, and an absent `page`
 * is not the `page=1` AC-10 names. Redirecting it would invent a second redirect shape for an
 * unbounded set of strings (`?page=0`, `?page=-1`, `?page=1.5`, `?page=٢`), each of which would
 * need its own hop; neutralising it gives every one of them the same answer as `?colour=red` —
 * the base content at a `noindex` URL that canonicals to the page that should be indexed. §6's
 * "no redirect chains (one 301: `?page=1`)" stays literally true, and no parameter shape can
 * produce a URL a crawler both fetches and indexes.
 *
 * **Why `?page=1` drops every other parameter.** AC-10 says "301 to the bare URL", and the bare
 * URL is the one that renders identical content: page 1 of the default order is what a
 * `?page=1&sort=…` request would have rendered had the sort survived, so keeping the sort would
 * hand the crawler a second `noindex` URL instead of the indexable one. One hop, one target, and
 * the target is a 200.
 *
 * **Why a sort parameter beats a page parameter in the canonical.** `?page=2&sort=price-asc` is
 * both, and the two rules disagree (self-canonical vs canonical-to-base). AC-15's is the stronger
 * claim — a sorted URL is a duplicate whatever page it is on — so a parameterised request
 * canonicals to the **base** URL and carries no page. The `· Page N` title suffix still applies,
 * because it describes what the reader is looking at.
 *
 * ## What this module does not do
 *
 * It writes no robots directive: `parameterised` becomes the `unparameterised` **term** of spec
 * 007's `indexability()` (registered there by TASK-114 on the spec 007 §14 A7 precedent), which is
 * the only place in `src/` allowed to turn terms into `noindex,follow` (AC-14). And it builds no
 * URL: the redirect target is the view model's own `path`, and the canonical is `canonicalFor()`'s
 * with `canonicalPage` passed through.
 */
import { ListingSearchParamsSchema } from "./schemas.ts";
import type { ListingSearchParams, ListingSort } from "./types.ts";

/**
 * What one listing request does, in the six values a route needs and no more.
 *
 * It is deliberately **not** a discriminated union with a redirect target: the redirect goes to
 * the listing's own `path`, and §5.2 makes `listingView()` the only source of that string. The
 * route therefore resolves the view first (a `?page=1` request is page 1, which always exists)
 * and then redirects to `view.path` — so no second URL builder can disagree with the canonical,
 * and the carry-forward from `/review 72` ("route code must obtain slugs only through
 * `slugFor()`") has nothing to bite on.
 */
export interface ListingRequest {
  /** 1-based page for `listingView()`; a page past the last makes it answer `undefined` (404). */
  readonly page: number;
  /** The order to render in. A neutralised or absent `sort` is the curation order. */
  readonly sort: ListingSort;
  /**
   * The URL carries a **sort or facet** parameter, so it is a duplicate of the base URL:
   * `noindex,follow` with a canonical to the base (AC-15). `?page=N` alone is *not* parameterised
   * in this sense — it is a page of its own (`plan/02` §7).
   */
  readonly parameterised: boolean;
  /** The page to keep in the canonical URL, or `undefined` for a parameter-free canonical. */
  readonly canonicalPage: number | undefined;
  /** The page for the `· Page N` title suffix, or `undefined` on page 1. */
  readonly titlePage: number | undefined;
  /**
   * `?page=1` was present and honoured: this URL is a duplicate of the bare one and must answer
   * with a **permanent redirect** to it (AC-10). The only redirect a listing URL produces.
   */
  readonly redirectToBare: boolean;
}

/**
 * Decide what one listing request does, from its raw query string.
 *
 * @param searchParams Next's awaited `searchParams` object, a `URLSearchParams`, or nothing.
 */
export function listingRequest(
  searchParams?:
    Record<string, string | string[] | undefined> | URLSearchParams,
): ListingRequest {
  const search = parseSearch(searchParams);

  // `?page=1` names the bare URL, which is where the canonical, the sitemap and every internal
  // link already point (`Pagination` never emits `?page=1`).
  const redirectToBare = search.honoured.includes("page") && search.page === 1;

  const parameterised =
    search.honoured.includes("sort") || search.ignored.length > 0;

  return {
    page: search.page,
    sort: search.sort,
    parameterised,
    canonicalPage: !parameterised && search.page >= 2 ? search.page : undefined,
    titlePage: search.page >= 2 ? search.page : undefined,
    redirectToBare,
  };
}

/**
 * The parsed query. `ListingSearchParamsSchema` never fails — a `GET` form's query is whatever a
 * visitor or a crawler typed, and a page that 500s on `?sort=banana` is a page a crawler can
 * break — so an absent `searchParams` and an unparseable one are the same answer.
 *
 * `ignored` is the set spec 005's `resolveFacets()` takes, and its only contribution there is
 * `indexable: false` (§5.2, §13 Q6). This module carries that contribution as `parameterised`
 * rather than calling the resolver for a boolean the resolver returns unconditionally: no filter
 * ships in Phase 0, so a facet *selection* has no reader, and a call whose result nothing uses is
 * a claim the tests cannot check. The parameter names come from one parser either way.
 */
function parseSearch(
  searchParams:
    Record<string, string | string[] | undefined> | URLSearchParams | undefined,
): ListingSearchParams {
  const raw =
    searchParams instanceof URLSearchParams
      ? Object.fromEntries(
          [...new Set(searchParams.keys())].map((key) => [
            key,
            searchParams.getAll(key),
          ]),
        )
      : (searchParams ?? {});
  return ListingSearchParamsSchema.parse(raw);
}
