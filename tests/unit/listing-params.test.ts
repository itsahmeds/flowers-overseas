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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type ListingView,
  listingIndexability,
  listingRequest,
  listingView,
} from "../../src/modules/catalog";
import { corridorState } from "../../src/modules/geo";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";
import {
  NOINDEX_FOLLOW,
  canonicalFor,
  indexability,
} from "../../src/modules/seo";

const BASE = "/en/poland/flowers";
const SITE = { baseUrl: "https://flowersoverseas.com" };

/** The terms every listing page of Phase 0 answers `true` to, so one term is the variable. */
/**
 * A **hypothetical** indexing deployment. Phase 0's real one answers `indexingEnvironment: false`,
 * which alone makes every page `noindex,follow`; passing this one is the only way to see any other
 * term move an answer at all (AC-14's table).
 */
const INDEXING = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
} as const;

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
    const viewIn = async (
      parameterised: boolean,
    ): Promise<ListingView | undefined> =>
      listingView(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { from: "2026-09-15", page: 1, parameterised, deployment: INDEXING },
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
      listingIndexability(identity, { ...terms }, INDEXING).terms
        .unparameterised,
    ).toBeUndefined();
    expect(
      listingIndexability(
        identity,
        { ...terms, unparameterised: false },
        INDEXING,
      ).terms.unparameterised,
    ).toBe(false);
  });
});

/**
 * `/review 93`'s required change. The case above is **true but not falsifiable**: in Phase 0 a
 * country-scoped listing is `noindex,follow` on both sides of the flag, because `operational:
 * false` fails the conjunction before `unparameterised` is ever consulted. The reviewer proved
 * that by deleting the `unparameterised` spread from `listingView()` and watching the whole unit
 * suite stay green — 182 files, 4 364 tests — on the one clause that decides whether Google
 * indexes `?sort=price-asc`.
 *
 * The seam that makes it falsifiable is a page type with **no `operational` gate**. Spec 007
 * §14 A7: an omitted optional term is one this page type does not assert, and the hubs and the
 * occasions index do not assert it (`isCountryScoped()`). Under a hypothetical indexing
 * deployment the parameter is then the *only* variable left in the conjunction, and the two
 * answers genuinely differ.
 */
/**
 * The probe runs on `occasionsIndex` because `isCountryScoped()` excludes it, which leaves the
 * flag as the only variable in the conjunction. It is a **page type, not a served page**: both
 * depth-2 handlers `notFound()` unless the match is `destinationsHub` (`routes.ts:28-31`) until
 * TASK-112/113 land. That costs nothing here — the `unparameterised` spread is one shared line
 * (`listing.ts:1286`) reached identically by all six page types, so cutting it fails this case
 * whichever type the probe uses — and the route that *is* served is pinned below (link 2).
 */
describe("`listingView()` really wires `parameterised` into the descriptor (AC-15)", () => {
  const directiveFor = async (options: {
    readonly parameterised?: boolean;
  }): Promise<string | undefined> =>
    (
      await listingView(
        { locale: "en", pageType: "occasionsIndex" },
        { from: "2026-09-15", page: 1, deployment: INDEXING, ...options },
      )
    )?.directive;

  it("turns its own directive on the flag alone, and goes red if the wiring is cut", async () => {
    // Delete `...(options.parameterised === undefined ? {} : { unparameterised:
    // !options.parameterised })` from `src/modules/catalog/listing.ts` and the middle expectation
    // fails: the sorted view would announce `index,follow` and duplicate its own base URL.
    expect(await directiveFor({ parameterised: false })).toBe("index,follow");
    expect(await directiveFor({ parameterised: true })).toBe(NOINDEX_FOLLOW);
    // No query at all asserts nothing, which leaves the conjunction rather than failing it.
    expect(await directiveFor({})).toBe("index,follow");
  });

  it("cannot be asserted on a country-scoped type yet, and this is why", async () => {
    // `/review 93` asked for this seam. It does not reach `index,follow`: an active florist is
    // one of `corridorState()`'s four terms, and Poland still has no `operations` block and no
    // `-live` content file, so the shop root stays `noindex,follow` on both sides of the flag.
    // The day those two land this case goes red, and the assertion moves onto the shop root
    // itself — where AC-15 actually bites. `docs/tasks/TASK-124.md` (PL's `operations` block)
    // carries that instruction, so the agent who turns this red is told rather than guessing.
    await withActivePartnersProvider(
      { hasActivePartners: () => true },
      async () => {
        expect(corridorState("PL", "en")).toBe("guide");
        for (const parameterised of [false, true]) {
          const view = await listingView(
            { locale: "en", pageType: "countryShopRoot", country: "poland" },
            {
              from: "2026-09-15",
              page: 1,
              parameterised,
              deployment: INDEXING,
            },
          );
          expect(view?.directive, String(parameterised)).toBe(NOINDEX_FOLLOW);
        }
      },
    );
  });
});

/**
 * Link 2 of the four `parameterised` travels: `listingQuery()` computes it → **the route hands it
 * to `listingView()`** → `listingView()` maps it to the `unparameterised` term → `indexability()`
 * turns the term into `noindex,follow`. Links 1, 3 and 4 are asserted above by running them; link
 * 2 is a wiring fact with no runtime seam, and `/review 93` round 2 measured what that costs:
 * deleting `parameterised: request.parameterised` from **both** call sites in
 * `src/app/[locale]/[segment]/[child]/page.tsx` leaves `typecheck`, `lint` and the whole
 * unit/integration/contract suite byte-identically green. `ListingViewOptions.parameterised` is
 * optional, so the omission is a legal call, and an absent term *leaves* the conjunction (spec 007
 * §14 A7) — so the failure is silent and **fail-open**: `?sort=price-asc` would announce
 * `index,follow` and duplicate its own base URL. The browser layer cannot see it either, because
 * in Phase 0 the bare URL is `noindex,follow` too.
 *
 * So the route is read **as source**, the way `tests/unit/listing-cache-headers.test.ts` reads
 * `next.config.ts` to prove the config actually mounts the headers: no server, no build, no
 * network, and deleting either pass-through goes red.
 */
describe("the route really hands `parameterised` to `listingView()` (AC-15)", () => {
  /**
   * Comments are removed first: this file's own prose says "`listingView()`" more than once, and a
   * sentence about the wiring must not be able to pass for the wiring. Only whole-line `//`
   * comments go, which is enough — no trailing comment in the route carries a call.
   */
  const routeSource = readFileSync(
    resolve(
      import.meta.dirname,
      "../../src/app/[locale]/[segment]/[child]/page.tsx",
    ),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^[ \t]*\/\/.*$/gmu, "");

  /** The argument text of every `name(…)` call in `source`, by balancing parentheses. */
  const argumentsOfCallsTo = (source: string, name: string): string[] => {
    const calls: string[] = [];
    const opener = `${name}(`;
    for (
      let at = source.indexOf(opener);
      at !== -1;
      at = source.indexOf(opener, at + 1)
    ) {
      let depth = 0;
      let cursor = at + name.length;
      do {
        if (source[cursor] === "(") depth += 1;
        else if (source[cursor] === ")") depth -= 1;
        cursor += 1;
      } while (depth > 0 && cursor < source.length);
      calls.push(source.slice(at + opener.length, cursor - 1));
    }
    return calls;
  };

  /**
   * The route sliced at its own top-level `export … function` declarations, keeping the slices
   * that resolve a listing view. Each render is then asserted **alone**, because a file-global
   * `toContain` cannot tell the two apart: both renders bind the name `request`, so one render's
   * correct `const request = await listingQuery(searchParams)` satisfied the other's provenance
   * check. `/review 93` round 3 measured it — editing **`generateMetadata`**'s call to
   * `listingQuery(undefined)` left 17 passed and `typecheck` 0, while the render that decides
   * `<meta name="robots">` read an empty query and `?sort=price-asc` announced `index,follow`.
   * (Only `tests/e2e/listing-params.spec.ts:97,100` caught that, via the `titlePage` and
   * `canonicalPage` that ride the same binding — true today, and not a property of this link.)
   */
  const renders = routeSource
    .split(/^(?=export (?:default )?async function )/gmu)
    .filter((slice) => slice.includes("listingView("));

  /** The declared name of a render slice, which is also the label on every failure below. */
  const nameOf = (render: string): string =>
    /^export (?:default )?async function ([A-Za-z_$][\w$]*)/u.exec(
      render,
    )?.[1] ?? "(unnamed)";

  it("gives each render its own query, and goes red if either pass-through is cut", () => {
    // `generateMetadata` and the page component are two renders of the same request (the route
    // says so), so exactly two renders resolve a listing view and the file holds exactly two
    // calls — which together put every call inside a render asserted below. A third listing
    // branch — TASK-110/111's depth-4 URLs — fails here until it carries the flag too, whether it
    // arrives as a third render or as a second branch inside one of these two: that is the point.
    const names = renders.map(nameOf);
    expect(
      names,
      `renders resolving a listing view: ${names.join(", ")}`,
    ).toHaveLength(2);
    expect(argumentsOfCallsTo(routeSource, "listingView")).toHaveLength(2);

    for (const render of renders) {
      const where = nameOf(render);
      const calls = argumentsOfCallsTo(render, "listingView");
      expect(calls, where).toHaveLength(1);

      const passThrough =
        /parameterised:\s*([A-Za-z_$][\w$]*)\.parameterised/u.exec(
          calls[0] ?? "",
        )?.[1];
      expect(passThrough, where).toBeDefined();
      // …and the object it reads is a query **this** render parsed from **its own** query string:
      // the binding is looked up inside this render's own source, not the file's, so the other
      // render's line cannot stand in for one that is missing or rewired here.
      expect(render, where).toContain(
        `const ${passThrough ?? ""} = await listingQuery(searchParams)`,
      );
      expect(
        argumentsOfCallsTo(render, where)[0] ?? "",
        `${where} parameters`,
      ).toContain("searchParams");
    }
  });

  it("parses that request from the request's own query string", () => {
    // The link before link 2: `listingQuery()` is a three-line local wrapper, and a version that
    // ignored `searchParams` would make every URL unparameterised — fail-open in the same
    // direction. `listingRequest()`'s own decision table is asserted above.
    const [query] = argumentsOfCallsTo(routeSource, "listingRequest");
    expect(query).toBeDefined();
    expect(query).toContain("searchParams");
  });
});
