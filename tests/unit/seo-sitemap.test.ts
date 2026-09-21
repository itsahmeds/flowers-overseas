/**
 * The sitemap builders, as decisions rather than as bytes on a deployment (spec 007 §2
 * "Sitemaps", §5.2, §5.4, AC-13 / AC-14; T-14's unit half; TASK-094).
 *
 * Four properties are asserted here because they are the ones a wrong sitemap gets wrong
 * silently — Search Console reports them days later, on a page nobody is watching:
 *
 *  1. **Membership is the engine's.** A row exists iff `listCorridorPages()` says the URL exists
 *    **and** `pageIndexability()` says the page is indexable. Nothing here re-derives a directive
 *    (spec 007 §14 A7), so "nothing `noindex` appears in a sitemap" is structural.
 *  2. **`<lastmod>` is a real date.** The maximum across the authored content file, the country
 *    registry entry and the message catalogue — never the clock. A builder with no dated source
 *    throws rather than printing today.
 *  3. **The `xhtml:link` set is `alternatesFor()`'s**, unchanged: same URLs, same `hreflang`
 *    values, `x-default` present, `en-150` never.
 *  4. **The caps are enforced**, not documented: >10 000 URLs or >10 MB throws naming the child.
 *
 * The deployment descriptor is a fixture, not `process.env`: a non-indexing deployment (every one
 * a reviewer can reach until the §12 flip) has an empty sitemap, and the interesting table is the
 * indexing one.
 */
import { describe, expect, it, vi } from "vitest";

import { countrySlug } from "../../src/config/countries.ts";
import { catalogueUpdatedAt } from "../../src/modules/i18n";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  SITEMAP_CACHE_CONTROL,
  SITEMAP_CHILDREN,
  SITEMAP_CONTENT_TYPE,
  SITEMAP_INDEX_PATH,
  SITEMAP_URL_CAP,
  STATIC_SITEMAP_PAGE_TYPES,
  type SitemapEntry,
  type StaticSitemapPageType,
  corridorSitemapEntries,
  lastmodOf,
  localeSitemapChildren,
  localeSitemapIndexPath,
  sitemapChildDocument,
  sitemapChildEntries,
  sitemapChildPath,
  sitemapIndexDocument,
  sitemapIndexEntries,
  sitemapIndexXml,
  sitemapLocales,
  staticSitemapEntries,
  urlSetXml,
} from "../../src/modules/seo";

/** The only deployment that may announce anything: production on the canonical host (§6). */
const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: `https://${CANONICAL_HOST}`,
};

/** Everything a reviewer can reach today: a production alias that is not the site. */
const PREVIEW: DeploymentDescriptor = {
  environment: "preview",
  siteUrl: "https://fo-preview.up.railway.app",
};

const ORIGIN = `https://${CANONICAL_HOST}`;

/** The two locales a human has authored corridor guides in (§13 Q1). */
const ENGLISH_LOCALES = ["en", "en-gb"] as const;

const locs = (entries: readonly SitemapEntry[]): string[] =>
  entries.map((entry) => entry.loc);

describe("membership: the engine decides, nothing re-derives (AC-14)", () => {
  it("announces nothing at all outside an indexing environment", () => {
    for (const locale of ENGLISH_LOCALES) {
      expect(corridorSitemapEntries(locale, PREVIEW)).toEqual([]);
      expect(staticSitemapEntries(locale, PREVIEW)).toEqual([]);
    }
    expect(sitemapLocales(PREVIEW)).toEqual([]);
    expect(sitemapIndexEntries(PREVIEW)).toEqual([]);
    // The index is still a valid, empty sitemap index — an empty announcement, not a 404.
    expect(sitemapIndexDocument(PREVIEW)).toContain("<sitemapindex");
    expect(sitemapIndexDocument(PREVIEW)).not.toContain("<loc>");
  });

  it("lists every existing, indexable corridor URL in an indexing environment", () => {
    for (const locale of ENGLISH_LOCALES) {
      const entries = corridorSitemapEntries(locale, INDEXING);
      expect(entries).toHaveLength(7);
      expect(locs(entries)).toContain(
        `${ORIGIN}/${locale}/send-flowers-to/${countrySlug("PL", locale)}`,
      );
      for (const entry of entries) {
        expect(entry.loc.startsWith(`${ORIGIN}/${locale}/`)).toBe(true);
        expect(entry.loc).toBe(entry.loc.toLowerCase());
        expect(entry.loc).not.toContain("?");
        expect(entry.loc.endsWith("/")).toBe(false);
      }
    }
  });

  it("has no corridor row for a locale nobody has authored a guide in (§13 Q1)", () => {
    for (const locale of ["de", "pl"]) {
      expect(corridorSitemapEntries(locale, INDEXING)).toEqual([]);
      // …and the locale is announced nowhere, because its catalogue is unreviewed.
      expect(sitemapLocales(INDEXING)).not.toContain(locale);
    }
  });

  it("never lists a pseudo-locale, whatever the flag says", () => {
    for (const locale of ["en-XA", "ar-XB"]) {
      expect(corridorSitemapEntries(locale, INDEXING)).toEqual([]);
      expect(staticSitemapEntries(locale, INDEXING)).toEqual([]);
    }
  });

  it("lists the all-destinations hub in static.xml, one URL per indexable locale", () => {
    for (const locale of ENGLISH_LOCALES) {
      expect(locs(staticSitemapEntries(locale, INDEXING))).toContain(
        `${ORIGIN}/${locale}/send-flowers-to`,
      );
    }
  });

  it("lists no URL twice across a locale's children", () => {
    for (const locale of ENGLISH_LOCALES) {
      const all = SITEMAP_CHILDREN.flatMap((child) =>
        locs(sitemapChildEntries(locale, child, INDEXING)),
      );
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe("the index and its children (AC-13)", () => {
  it("lists one child index per announced locale and nothing else", () => {
    const entries = sitemapIndexEntries(INDEXING);
    expect(entries.map((entry) => entry.loc)).toEqual(
      ENGLISH_LOCALES.map(
        (locale) => `${ORIGIN}${localeSitemapIndexPath(locale)}`,
      ),
    );
    for (const entry of entries)
      expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it("lists exactly the children that have URLs — an absent child, never an empty one", () => {
    for (const locale of ENGLISH_LOCALES) {
      expect(localeSitemapChildren(locale, INDEXING)).toEqual([
        `${ORIGIN}${sitemapChildPath(locale, "static")}`,
        `${ORIGIN}${sitemapChildPath(locale, "corridors")}`,
      ]);
    }
    expect(localeSitemapChildren("de", INDEXING)).toEqual([]);
  });

  it("serves no document for an unknown locale, an unknown child or an empty one", () => {
    expect(sitemapChildDocument("de", "corridors", INDEXING)).toBeUndefined();
    expect(sitemapChildDocument("fr", "corridors", INDEXING)).toBeUndefined();
    expect(sitemapChildDocument("en", "products", INDEXING)).toBeUndefined();
    expect(sitemapChildDocument("en", "corridors", PREVIEW)).toBeUndefined();
    expect(sitemapChildDocument("en", "corridors", INDEXING)).toContain(
      "<urlset",
    );
  });

  it("points robots.txt and the index at the same path", () => {
    expect(SITEMAP_INDEX_PATH).toBe("/sitemap.xml");
    expect(localeSitemapIndexPath("en")).toBe("/sitemaps/en/index.xml");
    expect(sitemapChildPath("en", "corridors")).toBe(
      "/sitemaps/en/corridors.xml",
    );
  });

  it("caches every sitemap response for an hour, as XML (§5.4)", () => {
    expect(SITEMAP_CACHE_CONTROL).toBe("public, max-age=3600");
    expect(SITEMAP_CONTENT_TYPE).toContain("xml");
  });
});

describe("<lastmod>: the real maximum, never the clock (AC-13)", () => {
  it("takes the newest of the content file, the registry entry and the catalogue", () => {
    expect(
      lastmodOf({
        content: "2026-09-15",
        registry: "2026-09-01",
        catalogue: "2026-09-16",
      }),
    ).toBe("2026-09-16");
    expect(lastmodOf({ content: "2026-09-17", catalogue: "2026-09-16" })).toBe(
      "2026-09-17",
    );
  });

  it("refuses to invent one when no source carries a date", () => {
    expect(() => lastmodOf({})).toThrow(/lastmod/u);
  });

  it("dates every corridor row at or after its authored file's own date", () => {
    for (const locale of ENGLISH_LOCALES) {
      const catalogue = catalogueUpdatedAt(locale);
      expect(catalogue).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      for (const entry of corridorSitemapEntries(locale, INDEXING)) {
        expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        expect(entry.lastmod >= (catalogue ?? "")).toBe(true);
      }
    }
  });
});

describe("the xhtml:link set is alternatesFor()'s, unchanged (AC-11)", () => {
  it("carries x-default → /en, the regional aliases and never en-150", () => {
    for (const entry of corridorSitemapEntries("en", INDEXING)) {
      const values = entry.alternates.map((alternate) => alternate.hreflang);
      expect(values).toContain("x-default");
      expect(values).toContain("en-GB");
      expect(values).not.toContain("en-150");
      const xDefault = entry.alternates.find(
        (alternate) => alternate.hreflang === "x-default",
      );
      expect(xDefault?.href.startsWith(`${ORIGIN}/en/`)).toBe(true);
      // Reciprocity: the `en-gb` row for the same destination carries the same set.
      const twin = corridorSitemapEntries("en-gb", INDEXING).find(
        (candidate) =>
          candidate.alternates[0]?.href === entry.alternates[0]?.href,
      );
      expect(twin?.alternates).toEqual(entry.alternates);
    }
  });

  it("gives the hub the same cluster the hub page emits", () => {
    const [entry] = staticSitemapEntries("en", INDEXING);
    expect(entry?.alternates.map((alternate) => alternate.hreflang)).toEqual([
      "en",
      "en-IE",
      "en-NL",
      "en-GB",
      "x-default",
    ]);
  });
});

describe("XML serialisation and the caps (AC-13)", () => {
  const entry = (loc: string): SitemapEntry => ({
    loc,
    lastmod: "2026-09-16",
    alternates: [{ hreflang: "en", href: loc }],
  });

  it("declares both namespaces and escapes what it prints", () => {
    const xml = urlSetXml([entry(`${ORIGIN}/en/a?b=c&d=e`)], "corridors");
    expect(xml).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("&d=e");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("refuses a relative or http loc at its own boundary (zod)", () => {
    expect(() => urlSetXml([entry("/en/poland")], "corridors")).toThrow();
  });

  it("throws, naming the child, above 10 000 URLs", () => {
    const many = Array.from({ length: SITEMAP_URL_CAP + 1 }, (_unused, index) =>
      entry(`${ORIGIN}/en/p${String(index)}`),
    );
    expect(() => urlSetXml(many, "corridors")).toThrow(/corridors/u);
  });

  it("renders an index with one <sitemap> per child", () => {
    const xml = sitemapIndexXml([
      { loc: `${ORIGIN}/sitemaps/en/index.xml`, lastmod: "2026-09-16" },
    ]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain(
      "<loc>https://flowersoverseas.com/sitemaps/en/index.xml</loc>",
    );
    expect(xml).toContain("<lastmod>2026-09-16</lastmod>");
  });
});

/**
 * **AC-7's sitemap half**, the piece TASK-092 deferred to this task (T-08; the `## Binding`
 * clause of `docs/tasks/TASK-094.md`).
 *
 * "A new country is data" (`plan/09`): flipping a fixture country's `guidePublished` must add or
 * remove its sitemap row with no edit under `src/app/` and no template change. The *argument* is
 * that `corridorSitemapEntries()` reads `listCorridorPages()`, whose existence rule is
 * `(status === 'live' || guidePublished)` and an authored file. The argument is not the proof —
 * `/review 74` rejected the same prose once already for T-08's hreflang half — so the flip is
 * performed here: the registry is re-mocked, the module graph rebuilt, and the built rows and the
 * served `corridors.xml` compared before and after the boolean moves.
 *
 * The Netherlands is the fixture because it is `status: "demo"`: its entire claim to a URL is
 * `guidePublished`, so that one boolean is the whole difference (PL is `live` and would keep its
 * row whatever the flag said). Both directions of the flip are observed — the first case is the
 * published registry as committed, the second the same registry with the flag false.
 */
describe("AC-7: a fixture flip of `guidePublished` moves the sitemap row", () => {
  const OFF = "NL";
  const netherlands = (locale: string): string =>
    `${ORIGIN}/${locale}/send-flowers-to/${countrySlug(OFF, locale)}`;

  it("announces the destination while its guide is published", () => {
    for (const locale of ENGLISH_LOCALES) {
      expect(locs(corridorSitemapEntries(locale, INDEXING))).toContain(
        netherlands(locale),
      );
      expect(sitemapChildDocument(locale, "corridors", INDEXING)).toContain(
        `<loc>${netherlands(locale)}</loc>`,
      );
    }
  });

  it("drops that row, and nothing else, when the flag goes false", async () => {
    const before = ENGLISH_LOCALES.map((locale) =>
      locs(corridorSitemapEntries(locale, INDEXING)),
    );

    vi.resetModules();
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        isGuidePublished: (iso2: string) =>
          iso2 === OFF ? false : actual.isGuidePublished(iso2 as typeof OFF),
        countryConfig: (iso2: string) =>
          iso2 === OFF
            ? { ...actual.countryConfig(OFF), guidePublished: false }
            : actual.countryConfig(iso2 as typeof OFF),
      };
    });
    const flipped = await import("../../src/modules/seo");

    try {
      for (const [index, locale] of ENGLISH_LOCALES.entries()) {
        const after = locs(flipped.corridorSitemapEntries(locale, INDEXING));

        // The row is gone…
        expect(after).not.toContain(netherlands(locale));
        expect(after).toHaveLength(6);
        // …and it is the *only* difference: the other six corridors are untouched, in order.
        expect(after).toEqual(
          before[index]?.filter((loc) => loc !== netherlands(locale)),
        );

        // The served document says the same thing — six `<url>` elements, and the destination's
        // slug appears nowhere in the file, not in a `<loc>` and not in an `xhtml:link`.
        const xml = flipped.sitemapChildDocument(locale, "corridors", INDEXING);
        expect(xml?.match(/<url>/gu) ?? []).toHaveLength(6);
        expect(xml).not.toContain(countrySlug(OFF, locale));

        // `static.xml` is unmoved: the hub is still announced, so this is a row leaving a
        // sitemap and not a sitemap collapsing.
        expect(flipped.staticSitemapEntries(locale, INDEXING)).toHaveLength(1);
      }
    } finally {
      vi.doUnmock("../../src/config/countries.ts");
      vi.resetModules();
    }
  });
});

/**
 * `static.xml` is exactly `STATIC_SITEMAP_PAGE_TYPES` applied — the seam TASK-096 extends.
 *
 * `staticSitemapEntries()` iterates the registry in `statics.ts` and calls nothing else, so
 * adding `localeHome` to it adds the row. These two cases are what keep that true: every page
 * type in the list contributes exactly one row, and no row exists that the list does not name.
 * The map below is exhaustive over the list's own type, so the day a page type is added the
 * suite fails until the test says which URL it announces.
 */
describe("static.xml is the page-type list applied (AC-13, AC-14)", () => {
  const ANNOUNCED: Record<StaticSitemapPageType, (locale: string) => string> = {
    destinationsHub: (locale) => `${ORIGIN}/${locale}/send-flowers-to`,
  };

  it("emits one row per listed page type, in the list's order", () => {
    expect(STATIC_SITEMAP_PAGE_TYPES.length).toBeGreaterThan(0);
    for (const locale of ENGLISH_LOCALES) {
      expect(locs(staticSitemapEntries(locale, INDEXING))).toEqual(
        STATIC_SITEMAP_PAGE_TYPES.map((pageType) =>
          ANNOUNCED[pageType](locale),
        ),
      );
    }
  });

  it("announces no page type the list omits — the locale home is out until TASK-096", () => {
    // `/{locale}` still answers `noindex,nofollow` (spec 003's blanket directive, lifted at the
    // §12 flip), so announcing it today would be the disagreement AC-14 forbids.
    expect([...STATIC_SITEMAP_PAGE_TYPES]).not.toContain("localeHome");
    for (const locale of ENGLISH_LOCALES) {
      expect(locs(staticSitemapEntries(locale, INDEXING))).not.toContain(
        `${ORIGIN}/${locale}`,
      );
    }
  });
});
