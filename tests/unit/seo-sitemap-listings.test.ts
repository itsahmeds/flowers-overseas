/**
 * Spec 008's two listing sitemap children, `categories.xml` and `occasions.xml`, as decisions
 * (spec 008 §6 "Sitemap membership", §5.2, **AC-19**; T-19's unit half; TASK-116).
 *
 * What is pinned here, each with its failure side:
 *
 *  1. **Phase 0 is empty.** On every deployment a reviewer can reach, both children have no row,
 *     so the locale index does not list them and the route answers 404 (AC-19's last clause).
 *  2. **Membership is the page's own verdict.** On the indexing deployment a row exists iff the
 *     page is in the existence set and its copy is reviewed (hubs), or its destination is
 *     operational (country-scoped types). The expected sets below are read from the committed
 *     copy files directly, not through the code under test, so a membership bug cannot agree
 *     with itself.
 *  3. **A destination going live is a data flip.** Making Poland operational adds its shop root,
 *     categories and occasions, with no edit to any builder.
 *  4. **`<lastmod>` is dated data.** The copy row's `reviewedAt`, the message catalogue, and on
 *     country-scoped rows the price data (retail row in force, FX snapshot) — never the clock.
 *
 * T-19's integration half (each row against its rendered `<head>`) is
 * `tests/integration/sitemap.test.ts`; its contract half is `pnpm seo:validate` over the
 * regenerated fixtures (`tests/contract/sitemap-validator.test.ts`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { countrySlug } from "../../src/config/countries.ts";
import {
  listingDatedSources,
  listingPages,
} from "../../src/modules/catalog/index.ts";
import { catalogueUpdatedAt } from "../../src/modules/i18n";
import {
  CANONICAL_HOST,
  CATEGORY_SITEMAP_PAGE_TYPES,
  type DeploymentDescriptor,
  OCCASION_SITEMAP_PAGE_TYPES,
  type SitemapEntry,
  categorySitemapEntries,
  lastmodOf,
  localeSitemapChildren,
  occasionSitemapEntries,
  sitemapChildDocument,
  sitemapChildPath,
} from "../../src/modules/seo";

const ORIGIN = `https://${CANONICAL_HOST}`;

const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: ORIGIN,
};

const PREVIEW: DeploymentDescriptor = {
  environment: "preview",
  siteUrl: "https://fo-preview.up.railway.app",
};

const repoRoot = resolve(__dirname, "../..");

interface RawCopyRow {
  readonly key: string;
  readonly slug: string;
  readonly reviewed: boolean;
  readonly reviewedAt?: string;
}

/** One committed copy file, read as bytes on disk rather than through `modules/catalog`. */
function rawCopy(
  locale: string,
  file: "categories" | "occasions",
): readonly RawCopyRow[] {
  const parsed = JSON.parse(
    readFileSync(
      resolve(repoRoot, `seed/data/copy/${locale}/${file}.json`),
      "utf8",
    ),
  ) as { rows: RawCopyRow[] };
  return parsed.rows;
}

/** `en-gb` inherits `en`'s rows and overrides the keys it authors itself (`copy.ts`). */
function rawCopyFor(
  locale: "en" | "en-gb",
  file: "categories" | "occasions",
): ReadonlyMap<string, RawCopyRow> {
  const rows = new Map(rawCopy("en", file).map((row) => [row.key, row]));
  if (locale === "en-gb") {
    for (const row of rawCopy("en-gb", file)) rows.set(row.key, row);
  }
  return rows;
}

/** The newest `activeFrom` among Poland's open-ended retail rows, read from the price file. */
function newestPolishRetailRow(): string {
  const parsed = JSON.parse(
    readFileSync(resolve(repoRoot, "seed/data/prices/PL.json"), "utf8"),
  ) as { rows: { activeFrom: string; activeTo: string | null }[] };
  return (
    parsed.rows
      .filter((row) => row.activeTo === null)
      .map((row) => row.activeFrom)
      .sort()
      .at(-1) ?? ""
  );
}

const locs = (entries: readonly SitemapEntry[]): string[] =>
  entries.map((entry) => entry.loc);

const day = (value: string | undefined): string | undefined =>
  value?.slice(0, 10);

afterEach(() => {
  vi.useRealTimers();
});

describe("Phase 0: both listing children are empty and absent (AC-19)", () => {
  it("announces no listing row on a deployment that may not be indexed", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      expect(await categorySitemapEntries(locale, PREVIEW)).toEqual([]);
      expect(await occasionSitemapEntries(locale, PREVIEW)).toEqual([]);
      expect(
        await sitemapChildDocument(locale, "categories", PREVIEW),
      ).toBeUndefined();
      expect(
        await sitemapChildDocument(locale, "occasions", PREVIEW),
      ).toBeUndefined();
      expect(await localeSitemapChildren(locale, PREVIEW)).toEqual([]);
    }
  });

  it("announces no listing row for a locale whose listings are all noindex, even when indexing", async () => {
    // `de` and `pl` have listing pages (the existence set is not empty), but the locale is not
    // indexable, so no page says `index,follow` and neither child is listed.
    expect((await listingPages("de")).length).toBeGreaterThan(0);
    for (const locale of ["de", "pl"]) {
      expect(await categorySitemapEntries(locale, INDEXING)).toEqual([]);
      expect(await occasionSitemapEntries(locale, INDEXING)).toEqual([]);
      const children = await localeSitemapChildren(locale, INDEXING);
      expect(children).not.toContain(
        `${ORIGIN}${sitemapChildPath(locale, "categories")}`,
      );
      expect(children).not.toContain(
        `${ORIGIN}${sitemapChildPath(locale, "occasions")}`,
      );
    }
  });

  it("refuses an unknown or unrouted locale without throwing", async () => {
    expect(await categorySitemapEntries("fr", INDEXING)).toEqual([]);
    expect(await occasionSitemapEntries("EN", INDEXING)).toEqual([]);
  });
});

describe("membership on the indexing deployment: the page's own verdict (AC-19, §6)", () => {
  /** The hub URLs whose copy row is reviewed, read from the files on disk, in file order. */
  async function expectedHubs(
    locale: "en" | "en-gb",
    pageType: "categoryHub" | "occasionHub",
  ): Promise<string[]> {
    const copy = rawCopyFor(
      locale,
      pageType === "categoryHub" ? "categories" : "occasions",
    );
    const existing = (await listingPages(locale)).filter(
      (page) => page.pageType === pageType,
    );
    return existing
      .filter((page) => copy.get(page.entityKey ?? "")?.reviewed === true)
      .map((page) => `${ORIGIN}${page.path}`);
  }

  it("lists exactly the category hubs whose copy is reviewed, and no country-scoped page", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      const rows = locs(await categorySitemapEntries(locale, INDEXING));
      expect(rows).toEqual(await expectedHubs(locale, "categoryHub"));
      // One reviewed hub present and one unreviewed hub absent, by name, so the comparison above
      // cannot pass on two equally wrong lists.
      expect(rows).toContain(`${ORIGIN}/${locale}/flowers/birthday-flowers`);
      expect(rows).not.toContain(`${ORIGIN}/${locale}/flowers/roses`);
    }
  });

  it("lists exactly the occasion hubs whose copy is reviewed, then the occasions index", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      const rows = locs(await occasionSitemapEntries(locale, INDEXING));
      expect(rows).toEqual([
        ...(await expectedHubs(locale, "occasionHub")),
        `${ORIGIN}/${locale}/occasions`,
      ]);
      expect(rows).toContain(`${ORIGIN}/${locale}/occasions/mothers-day`);
      expect(rows).not.toContain(`${ORIGIN}/${locale}/occasions/womens-day`);
    }
  });

  it("follows an en-gb copy override: its unreviewed category is out, its reviewed occasion is in", async () => {
    // `seed/data/copy/en-gb/` overrides `apology` in both files: the category row unreviewed, the
    // occasion row reviewed. `en` has the reverse pair, so this is the override being read.
    expect(rawCopy("en-gb", "categories")[0]).toMatchObject({
      key: "apology",
      reviewed: false,
    });
    const categories = locs(await categorySitemapEntries("en-gb", INDEXING));
    expect(categories).not.toContain(`${ORIGIN}/en-gb/flowers/sorry-flowers`);
    const occasions = locs(await occasionSitemapEntries("en-gb", INDEXING));
    expect(occasions).toContain(`${ORIGIN}/en-gb/occasions/i-am-sorry`);
  });

  it("prints only absolute, lowercase, parameter-free URLs with no trailing slash", async () => {
    for (const locale of ["en", "en-gb"]) {
      for (const entry of [
        ...(await categorySitemapEntries(locale, INDEXING)),
        ...(await occasionSitemapEntries(locale, INDEXING)),
      ]) {
        expect(entry.loc.startsWith(`${ORIGIN}/${locale}/`)).toBe(true);
        expect(entry.loc).toBe(entry.loc.toLowerCase());
        expect(entry.loc).not.toContain("?");
        expect(entry.loc.endsWith("/")).toBe(false);
      }
    }
  });

  it("lists the two children in the locale index once they have rows", async () => {
    const children = await localeSitemapChildren("en", INDEXING);
    expect(children).toContain(`${ORIGIN}/sitemaps/en/categories.xml`);
    expect(children).toContain(`${ORIGIN}/sitemaps/en/occasions.xml`);
  });

  it("names the page types spec 008 §6 assigns to each child", () => {
    expect([...CATEGORY_SITEMAP_PAGE_TYPES].sort()).toEqual([
      "categoryHub",
      "countryCategory",
      "countryShopRoot",
    ]);
    expect([...OCCASION_SITEMAP_PAGE_TYPES].sort()).toEqual([
      "countryOccasion",
      "occasionHub",
      "occasionsIndex",
    ]);
  });
});

describe("the hreflang set on a listing row (AC-19 'full xhtml:link set')", () => {
  it("carries the English cluster with x-default → /en, never en-150, never de or pl", async () => {
    const [row] = await categorySitemapEntries("en", INDEXING);
    expect(row?.alternates.map((alternate) => alternate.hreflang)).toEqual([
      "en",
      "en-IE",
      "en-NL",
      "en-GB",
      "x-default",
    ]);
    const xDefault = row?.alternates.find(
      (alternate) => alternate.hreflang === "x-default",
    );
    expect(xDefault?.href).toBe(row?.loc);
    // Reciprocity: the `en-gb` row names the `en` URL among its alternates and vice versa.
    const twin = (await categorySitemapEntries("en-gb", INDEXING)).find(
      (candidate) =>
        candidate.alternates.some((alternate) => alternate.href === row?.loc),
    );
    expect(twin?.alternates).toEqual(row?.alternates);
  });
});

describe("<lastmod>: dated data, never the clock (AC-19, §6)", () => {
  it("dates a hub row at the newer of its copy sign-off and the message catalogue", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      const birthday = rawCopyFor(locale, "categories").get("birthday");
      const row = (await categorySitemapEntries(locale, INDEXING)).find(
        (entry) => entry.loc === `${ORIGIN}/${locale}/flowers/birthday-flowers`,
      );
      const expected = [day(birthday?.reviewedAt), catalogueUpdatedAt(locale)]
        .filter((value): value is string => value !== undefined)
        .sort()
        .at(-1);
      expect(row?.lastmod).toBe(expected);
    }
  });

  it("takes the price source when it is the newest", () => {
    expect(
      lastmodOf({
        content: "2026-09-09",
        catalogue: "2026-09-10",
        prices: "2026-09-20",
      }),
    ).toBe("2026-09-20");
    expect(lastmodOf({ prices: "2026-09-01" })).toBe("2026-09-01");
  });

  it("gives a hub its own copy row's sign-off day and no price (a hub shows no money)", async () => {
    const birthday = rawCopyFor("en", "categories").get("birthday");
    expect(
      await listingDatedSources({
        pageType: "categoryHub",
        locale: "en",
        entityKey: "birthday",
      }),
    ).toEqual({ content: day(birthday?.reviewedAt) });
    // An unreviewed row has no sign-off date, so it contributes none.
    expect(
      await listingDatedSources({
        pageType: "categoryHub",
        locale: "en",
        entityKey: "roses",
      }),
    ).toEqual({});
  });

  it("gives the occasions index the newest sign-off among the locale's occasion rows", async () => {
    const newest = [...rawCopyFor("en", "occasions").values()]
      .map((row) => day(row.reviewedAt))
      .filter((value): value is string => value !== undefined)
      .sort()
      .at(-1);
    expect(
      await listingDatedSources({ pageType: "occasionsIndex", locale: "en" }),
    ).toEqual({ content: newest });
  });

  it("dates a country page's prices at the retail row in force while the FX rate is stale", async () => {
    // Sixty days after the snapshot the rate is stale, the card quotes the destination currency
    // and carries no `fxAsOf`: the retail row's date is the whole price source.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(
      new Date(`${FX_SNAPSHOT_AS_OF}T12:00:00Z`).getTime() + 60 * 86_400_000,
    );
    const sources = await listingDatedSources({
      pageType: "countryShopRoot",
      locale: "en",
      countryIso: "PL",
    });
    expect(sources.prices).toBe(newestPolishRetailRow());
  });

  it("dates a country page's prices at the FX snapshot while the converted amount is shown", async () => {
    // The day after the snapshot the rate is fresh, the card shows euros converted at it, and
    // that conversion date is when the printed number last changed.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(
      new Date(`${FX_SNAPSHOT_AS_OF}T12:00:00Z`).getTime() + 86_400_000,
    );
    expect(FX_SNAPSHOT_AS_OF > newestPolishRetailRow()).toBe(true);
    const sources = await listingDatedSources({
      pageType: "countryCategory",
      locale: "en",
      countryIso: "PL",
      entityKey: "birthday",
    });
    expect(sources.prices).toBe(FX_SNAPSHOT_AS_OF);
    expect(sources.content).toBe(
      day(rawCopyFor("en", "categories").get("birthday")?.reviewedAt),
    );
  });
});

/**
 * "As the founder taking Poland live, the shop, its categories and its occasions become indexable
 * because a partner row appeared: no template edit, no sitemap to remember" (spec 008 §3). The
 * operational term is flipped where the data enters (`corridorState()`), the module graph is
 * rebuilt, and the two children are read again.
 */
describe("a destination going live is a data flip (AC-19, AC-5's sitemap half)", () => {
  const OPERATIONAL = "PL";

  async function withPolandLive<T>(
    body: (seo: typeof import("../../src/modules/seo")) => Promise<T>,
  ): Promise<T> {
    vi.resetModules();
    vi.doMock("../../src/modules/geo/index.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/modules/geo/index.ts")
      >("../../src/modules/geo/index.ts");
      return {
        ...actual,
        corridorState: (iso2: string, locale: string) =>
          iso2 === OPERATIONAL ? "live" : actual.corridorState(iso2, locale),
      };
    });
    try {
      return await body(await import("../../src/modules/seo"));
    } finally {
      vi.doUnmock("../../src/modules/geo/index.ts");
      vi.resetModules();
    }
  }

  it("adds Poland's shop root and its reviewed categories to categories.xml, and nothing else", async () => {
    const before = locs(await categorySitemapEntries("en", INDEXING));
    const poland = countrySlug(OPERATIONAL, "en");
    const copy = rawCopyFor("en", "categories");
    const expected = (await listingPages("en"))
      .filter(
        (page) =>
          page.countryIso === OPERATIONAL &&
          (page.pageType === "countryShopRoot" ||
            (page.pageType === "countryCategory" &&
              copy.get(page.entityKey ?? "")?.reviewed === true)),
      )
      .map((page) => `${ORIGIN}${page.path}`);

    const after = await withPolandLive(async (seo) =>
      locs(await seo.categorySitemapEntries("en", INDEXING)),
    );
    const added = after.filter((loc) => !before.includes(loc));

    expect(added).toEqual(expected);
    expect(added).toContain(`${ORIGIN}/en/${poland}/flowers`);
    expect(added).toContain(`${ORIGIN}/en/${poland}/flowers/birthday-flowers`);
    expect(added).not.toContain(`${ORIGIN}/en/${poland}/flowers/roses`);
    // Only Poland moved: every other destination stays out.
    for (const loc of added) expect(loc).toContain(`/en/${poland}/`);
    expect(after.filter((loc) => before.includes(loc))).toEqual(before);
  });

  it("adds Poland's reviewed occasions to occasions.xml, dated with their price data", async () => {
    const poland = countrySlug(OPERATIONAL, "en");
    const rows = await withPolandLive(async (seo) =>
      seo.occasionSitemapEntries("en", INDEXING),
    );
    const mothersDay = rows.find(
      (entry) => entry.loc === `${ORIGIN}/en/${poland}/occasions/mothers-day`,
    );
    expect(mothersDay).toBeDefined();
    // Women's Day is a page in Poland, but its `en` copy is unreviewed: still `noindex`, still out.
    expect(locs(rows)).not.toContain(
      `${ORIGIN}/en/${poland}/occasions/womens-day`,
    );
    expect(mothersDay?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect((mothersDay?.lastmod ?? "") >= newestPolishRetailRow()).toBe(true);
  });
});
