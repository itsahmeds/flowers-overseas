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

  it("keeps Poland in the guide state even with a florist, because no cutoff is authored", async () => {
    // The registry says `live` and the fixture provider says a florist is taking our orders —
    // and the page is *still* a guide, because `operations` is absent and no `live` content file
    // exists. This is the failure §13 Q3 exists to prevent: a design label printing a cutoff.
    await withActivePartnersProvider({ hasActivePartners: () => true }, () => {
      expect(corridorState("PL", "en")).toBe("guide");
      const view = corridorView("PL", "en", { from: FROM });
      expect(view?.state).toBe("guide");
      expect(view?.facts.operations).toBeUndefined();
    });
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

  it("renders the breadcrumb's hub crumb as text while the hub is unpublished (AC-14)", () => {
    const crumbs = view?.breadcrumb ?? [];
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]?.href).toBe("/en");
    // TASK-092 ships `/{locale}/{destinations}` and publishes the link id; until then the crumb
    // is text, never a link to a 404.
    expect(crumbs[1]?.href).toBeUndefined();
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
