/**
 * The listing parameter policy (spec 008 §2 "Sort, filters, pagination", §6, **AC-9**, **AC-10**,
 * **AC-15**, AC-16; T-09, T-10, T-15; TASK-114).
 *
 * `listingRequest()` is the whole decision — the redirect, the page, the order, the canonical's
 * one permitted parameter, the title suffix and the `parameterised` flag — so this file is the
 * decision table of `src/modules/catalog/params.ts` executed case by case, including the shapes
 * `/review 72` asked to be ruled on explicitly (`?page=0`, `?page=1.5`, `?page=abc`).
 *
 * The three consequences of the flag are asserted where they are produced rather than described:
 * the robots directive through spec 007's `indexability()` (AC-14 — no directive is computed
 * here), the canonical string through `canonicalFor()`, and the page's own verdict through
 * `listingView()` over the real catalogue.
 */
import { describe, expect, it } from "vitest";

import {
  type ListingView,
  listingIndexability,
  listingRequest,
  listingView,
} from "../../src/modules/catalog";
import {
  NOINDEX_FOLLOW,
  canonicalFor,
  indexability,
} from "../../src/modules/seo";

const BASE = "/en/poland/flowers";
const SITE = { baseUrl: "https://flowersoverseas.com" };

/** The terms every listing page of Phase 0 answers `true` to, so one term is the variable. */
const PHASE_0_TERMS = {
  pageTypeIndexable: true,
  exists: true,
  reviewed: true,
  localeIndexable: true,
  indexingEnvironment: true,
  operational: true,
} as const;

describe("`?page=N` (AC-10)", () => {
  it("redirects `?page=1` to the bare URL and nothing else does", () => {
    expect(listingRequest({ page: "1" }).redirectToBare).toBe(true);
    // The honoured value is what redirects, so a sort or a facet riding along redirects too —
    // one hop, to the URL that renders identical content.
    expect(
      listingRequest({ page: "1", sort: "price-asc" }).redirectToBare,
    ).toBe(true);
    expect(listingRequest({ page: "1", colour: "red" }).redirectToBare).toBe(
      true,
    );
    for (const query of [
      {},
      { page: "2" },
      { sort: "price-asc" },
      { colour: "red" },
    ]) {
      expect(listingRequest(query).redirectToBare, JSON.stringify(query)).toBe(
        false,
      );
    }
  });

  it("keeps `?page=N ≥ 2` in the canonical and in the title, and page 1 in neither", () => {
    const first = listingRequest({});
    expect(first.page).toBe(1);
    expect(first.canonicalPage).toBeUndefined();
    expect(first.titlePage).toBeUndefined();

    const second = listingRequest({ page: "2" });
    expect(second.page).toBe(2);
    expect(second.canonicalPage).toBe(2);
    expect(second.titlePage).toBe(2);
    expect(canonicalFor("en", BASE, { ...SITE, page: 2 })).toBe(
      "https://flowersoverseas.com/en/poland/flowers?page=2",
    );
  });

  it("refuses to build a canonical carrying a page a page cannot have (AC-16)", () => {
    // The builder is the last line of defence against a canonical that disagrees with its page:
    // page 1 is the bare URL and a fraction is not a page at all.
    expect(() => canonicalFor("en", BASE, { ...SITE, page: 1 })).toThrow(
      /honoured `page`/u,
    );
    expect(() => canonicalFor("en", BASE, { ...SITE, page: 2.5 })).toThrow(
      /honoured `page`/u,
    );
    expect(canonicalFor("en", BASE, SITE)).toBe(
      "https://flowersoverseas.com/en/poland/flowers",
    );
  });

  it("neutralises a malformed page rather than inventing a second redirect (`/review 72`)", () => {
    for (const value of ["0", "-1", "1.5", "abc", "01", "", "٢"]) {
      const request = listingRequest({ page: value });
      expect(request.redirectToBare, value).toBe(false);
      expect(request.page, value).toBe(1);
      // It is a parameter nobody honoured, so it gets the answer `?colour=red` gets: base
      // content at a `noindex` URL whose canonical points at the page that should be indexed.
      expect(request.parameterised, value).toBe(true);
      expect(request.canonicalPage, value).toBeUndefined();
      expect(request.titlePage, value).toBeUndefined();
    }
  });
});

describe("`?sort=` and the facet shapes (AC-9, AC-15)", () => {
  it("honours the three orders and only those", () => {
    for (const sort of ["default", "price-asc", "price-desc"] as const) {
      const request = listingRequest({ sort });
      expect(request.sort, sort).toBe(sort);
      // Even `?sort=default` is a duplicate of the bare URL: it renders the same twelve cards.
      expect(request.parameterised, sort).toBe(true);
    }
    // Anything else reads as absent — a crawler cannot break the page with a typo, and it cannot
    // invent an order we do not offer (`bestsellers` is unrepresentable in `ListingSort`).
    for (const sort of ["bestsellers", "popular", "relevance", "price"]) {
      const request = listingRequest({ sort });
      expect(request.sort, sort).toBe("default");
      expect(request.parameterised, sort).toBe(true);
    }
  });

  it("marks every facet-shaped and campaign parameter as a duplicate", () => {
    for (const query of [
      { colour: "red" },
      { colour: ["red", "white"] },
      { price_band: "under-40" },
      { utm_source: "newsletter" },
      { q: "roses" },
      { sessionid: "x" },
    ]) {
      expect(listingRequest(query).parameterised, JSON.stringify(query)).toBe(
        true,
      );
    }
    expect(listingRequest({}).parameterised).toBe(false);
    expect(listingRequest({ page: "3" }).parameterised).toBe(false);
  });

  it("lets the sort parameter beat the page parameter in the canonical", () => {
    const request = listingRequest({ page: "2", sort: "price-asc" });
    expect(request.page).toBe(2);
    expect(request.sort).toBe("price-asc");
    expect(request.parameterised).toBe(true);
    // Canonical to the base URL — a sorted view is a duplicate whatever page it is on …
    expect(request.canonicalPage).toBeUndefined();
    // … and the title still says which page the reader is looking at.
    expect(request.titlePage).toBe(2);
  });

  it("reads a `URLSearchParams` and an absent query the same way", () => {
    expect(listingRequest(new URLSearchParams("page=2"))).toStrictEqual(
      listingRequest({ page: "2" }),
    );
    expect(listingRequest()).toStrictEqual(listingRequest({}));
  });
});

describe("the `unparameterised` term is the only thing that turns a directive (AC-14, AC-15)", () => {
  it("is the one term that removes `index` from an otherwise indexable page", () => {
    expect(indexability({ ...PHASE_0_TERMS, unparameterised: true })).toBe(
      "index,follow",
    );
    expect(indexability({ ...PHASE_0_TERMS, unparameterised: false })).toBe(
      NOINDEX_FOLLOW,
    );
    // Absent means "this page type does not assert it" (spec 007 §14 A7), never "satisfied".
    expect(indexability(PHASE_0_TERMS)).toBe("index,follow");
  });

  it("never fires for `?page=N`: a paginated URL is a page, not a duplicate", () => {
    const paged = listingRequest({ page: "2" });
    expect(paged.parameterised).toBe(false);
    expect(
      indexability({ ...PHASE_0_TERMS, unparameterised: !paged.parameterised }),
    ).toBe("index,follow");
  });
});

describe("the view model answers the parameters (AC-9, AC-10)", () => {
  const view = async (
    page: number,
    sort: "default" | "price-asc" | "price-desc",
    parameterised = false,
  ): Promise<ListingView | undefined> =>
    listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: "2026-09-15", page, sort, parameterised },
    );

  it("pages by twelve and 404s past the last page, never an empty grid", async () => {
    const first = await view(1, "default");
    expect(first?.items).toHaveLength(12);
    expect(first?.pageCount).toBeGreaterThan(1);
    const last = await view(first?.pageCount ?? 1, "default");
    expect(last?.items.length).toBeGreaterThan(0);
    // `undefined` is what the route turns into `notFound()` — a real 404, not a soft one.
    expect(await view((first?.pageCount ?? 1) + 1, "default")).toBeUndefined();
    expect(await view(99, "default")).toBeUndefined();
  });

  it("sorts the whole listing, then pages it", async () => {
    const ascending = await view(1, "price-asc");
    const descending = await view(1, "price-desc");
    const amounts = (listing: ListingView | undefined): bigint[] =>
      (listing?.items ?? []).map((card) => BigInt(card.price.amountMinor));
    expect(amounts(ascending)).toStrictEqual(
      [...amounts(ascending)].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    expect(amounts(descending)).toStrictEqual(
      [...amounts(descending)].sort((left, right) =>
        left > right ? -1 : left < right ? 1 : 0,
      ),
    );
    // Page 2 of an ascending sort continues from the thirteenth cheapest, so its first card is
    // never cheaper than page 1's last (`/review 76`'s "sort before paginate").
    const secondPage = await view(2, "price-asc");
    const lastOfFirst = amounts(ascending).at(-1) ?? 0n;
    expect(amounts(secondPage)[0] ?? 0n).toBeGreaterThanOrEqual(lastOfFirst);
  });

  it("carries the parameterised verdict into its own directive", async () => {
    // Phase 0 is `noindex,follow` for every listing whatever the query says, because no
    // destination is operational — so the term is proven against a *hypothetical* indexing
    // deployment, which is the only way to see it move the answer at all (AC-14's table).
    const indexing = {
      environment: "production",
      siteUrl: "https://flowersoverseas.com",
    } as const;
    const viewIn = async (
      parameterised: boolean,
    ): Promise<ListingView | undefined> =>
      listingView(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { from: "2026-09-15", page: 1, parameterised, deployment: indexing },
      );
    expect((await viewIn(false))?.directive).toBe(NOINDEX_FOLLOW);
    expect((await viewIn(true))?.directive).toBe(NOINDEX_FOLLOW);

    // The term itself, on the engine: the page's own gather with and without the parameter.
    const identity = {
      pageType: "countryShopRoot",
      locale: "en",
      countryIso: "PL",
    } as const;
    const terms = { exists: true, reviewed: true, operational: true } as const;
    expect(
      listingIndexability(identity, { ...terms }, indexing).terms
        .unparameterised,
    ).toBeUndefined();
    expect(
      listingIndexability(
        identity,
        { ...terms, unparameterised: false },
        indexing,
      ).terms.unparameterised,
    ).toBe(false);
  });
});
