/**
 * The corridor route's module half (spec 007 AC-5, AC-6, AC-8, AC-22; T-06, T-07, T-09, T-23;
 * TASK-091).
 *
 * Everything asserted here is a **decision**, not a rendering: which URLs exist, which state a
 * destination is in, what the view model carries and what it refuses to carry. The rendered
 * document is `tests/e2e/corridor.spec.ts`'s, and it can only be right if these are.
 *
 * No clock is read: every calendar assertion passes an explicit `from`, which is why "the next
 * twelve months" is a fact a test can pin rather than a window that moves under it.
 */
import { describe, expect, it } from "vitest";

import {
  COUNTRIES,
  countrySlug,
  hasCompleteOperations,
  isCountryIso2,
} from "../../src/config/countries.ts";
import { launchLocales } from "../../src/config/locales.ts";
import {
  CORRIDOR_STATE_TERMS,
  type CorridorStateTerms,
  corridorAlternatePaths,
  corridorIso2ForSlug,
  corridorPageExists,
  corridorState,
  corridorStateFrom,
  corridorView,
  listCorridorPages,
} from "../../src/modules/geo";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";
import {
  CANONICAL_HOST,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  pageIndexability,
} from "../../src/modules/seo";

/** A date inside the committed corpus's lifetime; every window assertion starts here. */
const FROM = "2026-09-15";

const ENGLISH_LOCALES = ["en", "en-gb"] as const;

describe("the existence rule (AC-5, AC-6; T-06, T-07)", () => {
  it("creates a URL for exactly the (locale, country) pairs that have an authored guide", () => {
    const pages = listCorridorPages();

    // Seven destinations × the two locales a human has written: `de` and `pl` have no corridor
    // page at all until a native reviewer delivers one (§13 Q1), and that is the honest answer
    // rather than a machine-drafted page behind `noindex`.
    expect(pages).toHaveLength(COUNTRIES.length * ENGLISH_LOCALES.length);
    expect([...new Set(pages.map((page) => page.locale))].sort()).toEqual([
      "en",
      "en-gb",
    ]);
    for (const locale of ["de", "pl"]) {
      expect(pages.filter((page) => page.locale === locale)).toEqual([]);
    }
  });

  it("emits each destination's own localised slug, and every page in the guide state", () => {
    for (const page of listCorridorPages()) {
      expect(page.slug).toBe(countrySlug(page.iso2, page.locale));
      // Phase 0: `staticNoPartnersProvider` answers false everywhere, so Poland — which the
      // registry labels `live` — is a guide page like the other six (§13 Q3).
      expect(page.state, `${page.locale}/${page.slug}`).toBe("guide");
    }
  });

  it("refuses another locale's slug, a casing variant and an unknown slug", () => {
    // `/en/send-flowers-to/polska` is the Polish slug on an English URL: not a page.
    expect(corridorIso2ForSlug("en", "polska")).toBeUndefined();
    expect(corridorIso2ForSlug("en", "Poland")).toBeUndefined();
    expect(corridorIso2ForSlug("en", "narnia")).toBeUndefined();
    expect(corridorIso2ForSlug("fr", "poland")).toBeUndefined();
    expect(corridorIso2ForSlug("en", "poland")).toBe("PL");
    expect(corridorIso2ForSlug("pl", "polska")).toBe("PL");
  });

  it("has no page in a locale with no authored content, whatever the registry says", () => {
    for (const country of COUNTRIES) {
      for (const locale of ["de", "pl"]) {
        expect(
          corridorPageExists(country.iso2, locale),
          `${locale}/${country.iso2}`,
        ).toBe(false);
      }
      for (const locale of ENGLISH_LOCALES) {
        expect(corridorPageExists(country.iso2, locale)).toBe(true);
      }
    }
    expect(corridorPageExists("XX", "en")).toBe(false);
  });

  it("offers an alternate only for a locale that has the page (AC-11)", () => {
    const paths = corridorAlternatePaths("PL");
    expect(Object.keys(paths).sort()).toEqual([...ENGLISH_LOCALES]);
    expect(paths["en"]).toBe("/en/send-flowers-to/poland");
    expect(paths["en-gb"]).toBe("/en-gb/send-flowers-to/poland");
    // The launch set is four locales; two of them contribute nothing, which is the whole of
    // "a locale without an authored reviewed page has no alternate" (§6).
    expect(Object.keys(paths).length).toBeLessThan(launchLocales.length);
  });
});

describe("the state rule (AC-8; T-09)", () => {
  const ALL_TRUE: CorridorStateTerms = {
    registryLive: true,
    activePartners: true,
    operationsComplete: true,
    liveContent: true,
  };

  it("is `live` only when all four terms hold — sixteen cases", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const terms = Object.fromEntries(
        CORRIDOR_STATE_TERMS.map((term, index) => [
          term,
          (mask & (1 << index)) !== 0,
        ]),
      ) as unknown as CorridorStateTerms;
      const expected = mask === 15 ? "live" : "guide";
      expect(corridorStateFrom(terms), JSON.stringify(terms)).toBe(expected);
    }
    expect(corridorStateFrom(ALL_TRUE)).toBe("live");
  });

  it("keeps Poland in the guide state even with a florist and a cutoff, because no live copy exists", async () => {
    // The registry says `live`, Poland has had its `operations` block since TASK-124 (spec 009
    // §13 Q3), and the fixture provider says a florist is taking our orders — and the page is
    // *still* a guide, because no `live` content file exists (TASK-142 authors `pl-live.md`). A
    // design label cannot print a cutoff on its own; neither can an authored block without copy.
    expect(hasCompleteOperations("PL")).toBe(true);
    await withActivePartnersProvider({ hasActivePartners: () => true }, () => {
      expect(corridorState("PL", "en")).toBe("guide");
      const view = corridorView("PL", "en", { from: FROM });
      expect(view?.state).toBe("guide");
      expect(view?.facts.operations).toBeUndefined();
    });
  });
});

describe("the two live slots have two conditions (spec 008 AC-20; TASK-113)", () => {
  // The defect this pins: `liveSlots` was gated as a **block** on `corridorState() === "live"`,
  // and no country is live in Phase 0, so spec 008 AC-20's "the corridor page renders them as
  // links" was unsatisfiable and `/en/poland/flowers` — 200 with 84 priced products since PR #89
  // — was reachable from nowhere. The gate is now per slot, which is what each field's own rule
  // always said.
  it("drops a price on a guide destination and keeps the shop entry", () => {
    expect(corridorState("PL", "en")).toBe("guide");
    const view = corridorView("PL", "en", {
      from: FROM,
      liveSlots: { fromPrice: "€39.00", shopEntryHref: "/en/poland/flowers" },
    });
    // A price beside "we are still choosing florists" is the Phase 1 claim `plan/07` §4 forbids.
    expect(view?.liveSlots.fromPrice).toBeUndefined();
    // A link to a page that exists is not a claim at all.
    expect(view?.liveSlots.shopEntryHref).toBe("/en/poland/flowers");
  });

  it("supplies neither when the caller supplies neither", () => {
    expect(corridorView("PL", "en", { from: FROM })?.liveSlots).toEqual({});
  });
});

describe("the view model (AC-8, AC-19, AC-22; T-09, T-23)", () => {
  const view = corridorView("PL", "en", { from: FROM });

  it("carries the authored copy and claims nothing operational in the guide state", () => {
    expect(view).toBeDefined();
    expect(view?.state).toBe("guide");
    expect(view?.facts.known).toBe(false);
    expect(view?.facts.operations).toBeUndefined();
    // A destination we do not deliver to may not list cities (`plan/10` §3) — and the registry
    // refuses a `citiesKey` on a non-`live` country, so the branch cannot be reached by accident.
    expect(view?.facts.citiesKey).toBeUndefined();
    // No price on a guide page (§13 Q2), and no shop to enter (§2's link contract).
    expect(view?.liveSlots.fromPrice).toBeUndefined();
    expect(view?.liveSlots.shopEntryHref).toBeUndefined();
    expect(view?.faq.length).toBeGreaterThanOrEqual(8);
    expect(view?.faq.length).toBeLessThanOrEqual(12);
    expect(view?.body.split(/\s+/u).length).toBeGreaterThanOrEqual(600);
  });

  it("links the breadcrumb's hub crumb now that the hub is published (AC-14)", () => {
    const crumbs = view?.breadcrumb ?? [];
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]?.href).toBe("/en");
    // TASK-092 shipped the hub and published its link id: the crumb is a link to a 200 document,
    // and `destinationsHubHref()` is the one predicate that decided so.
    expect(crumbs[1]?.href).toBe("/en/send-flowers-to");
    expect(crumbs[2]?.current).toBe(true);
  });

  it("lists the next twelve months of occasions in date order, with no invented date", () => {
    const occasions = view?.occasions ?? [];
    expect(occasions.length).toBeGreaterThan(0);
    const dates = occasions.map((occasion) => occasion.date);
    expect([...dates].sort()).toEqual(dates);
    expect((dates[0] ?? "") >= FROM).toBe(true);
    expect((dates.at(-1) ?? "") < "2027-09-15").toBe(true);
    for (const occasion of occasions) {
      expect(occasion.labelKey.startsWith("catalog.facet.occasion.")).toBe(
        true,
      );
      expect(occasion.ruleKind).not.toBe("none");
    }
    // PL `name_day` has rule `none`: named in the "also kept here" line, never dated.
    expect(
      view?.undatedOccasions?.map((occasion) => occasion.occasionKey),
    ).toContain("name_day");
    expect(dates).not.toContain(undefined);
  });

  it("renders only related destinations that have a page in this locale", () => {
    for (const related of view?.related ?? []) {
      // The view model hands back a plain ISO string; narrowing it here is the same boundary
      // parse the module does, and it also asserts that no unknown code can reach the row.
      expect(isCountryIso2(related.iso2), related.iso2).toBe(true);
      if (!isCountryIso2(related.iso2)) continue;
      expect(corridorPageExists(related.iso2, "en")).toBe(true);
      expect(related.href).toBe(
        `/en/send-flowers-to/${countrySlug(related.iso2, "en")}`,
      );
      expect(related.iso2).not.toBe("PL");
    }
    expect((view?.related ?? []).length).toBeGreaterThanOrEqual(2);
    expect((view?.related ?? []).length).toBeLessThanOrEqual(3);
  });

  it("is `undefined` for a page that does not exist, so the route 404s rather than emptying", () => {
    expect(corridorView("PL", "de", { from: FROM })).toBeUndefined();
    expect(corridorView("XX", "en", { from: FROM })).toBeUndefined();
  });

  it("renders the en-gb guide from the en-gb corpus, not from en", () => {
    const uk = corridorView("PL", "en-gb", { from: FROM });
    expect(uk?.path).toBe("/en-gb/send-flowers-to/poland");
    expect(uk?.seoTitle).not.toBe(view?.seoTitle);
  });
});

describe("the indexability predicate over a corridor page (AC-9; `/review 70` change 1)", () => {
  /** The terms the route's `generateMetadata` gathers, for one authored corridor page. */
  function corridorDescriptor(locale: string) {
    const page = corridorView("PL", locale, { from: FROM });
    if (page === undefined) throw new Error(`no corridor view for ${locale}`);
    return {
      pageType: "corridor",
      locale,
      exists: corridorPageExists("PL", locale),
      reviewed: page.reviewed,
    } as const;
  }

  it("yields `index,follow` on production + the canonical host, now that the corpus is reviewed", () => {
    // The founder's review flip is in the committed generated index, so `reviewed` is `true` and
    // the only term still capable of closing the page is the environment gate. This is the
    // assertion that would have caught the stale index: with `reviewed: false` it reads
    // `noindex,follow` under the very same deployment.
    for (const locale of ENGLISH_LOCALES) {
      const descriptor = corridorDescriptor(locale);
      expect(descriptor.reviewed, locale).toBe(true);
      expect(
        pageIndexability(descriptor, {
          environment: "production",
          siteUrl: `https://${CANONICAL_HOST}`,
        }).directive,
        locale,
      ).toBe(INDEX_FOLLOW);
    }
  });

  it("still yields `noindex,follow` in Phase 0, because the environment gate is the one that is shut", () => {
    for (const deployment of [
      { environment: "development", siteUrl: "http://localhost:3000" },
      { environment: "preview", siteUrl: `https://${CANONICAL_HOST}` },
      { environment: "staging", siteUrl: `https://${CANONICAL_HOST}` },
      {
        environment: "production",
        siteUrl: "https://flowers-overseas.vercel.app",
      },
    ] as const) {
      const verdict = pageIndexability(corridorDescriptor("en"), deployment);
      expect(verdict.directive, deployment.siteUrl).toBe(NOINDEX_FOLLOW);
      expect(verdict.terms.reviewed).toBe(true);
      expect(verdict.terms.indexingEnvironment).toBe(false);
    }
  });
});
