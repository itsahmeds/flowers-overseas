/**
 * T-12 and T-14's integration halves: the sitemap tree as a document, and the `<head>` cluster of
 * every announced page against the `xhtml:link` set of its row (spec 007 §2 "Sitemaps", §5.2,
 * AC-11, AC-13, AC-14; TASK-094).
 *
 * This is the suite that would catch the failure `plan/02` §8 and §10 are written about: a
 * sitemap and a document that disagree. It gets both halves from the code that serves them —
 * the sitemap from `modules/seo`, the cluster from the corridor route's own `generateMetadata`,
 * called exactly as Next calls it — so "the same `alternatesFor()` call" is proven rather than
 * asserted in a comment.
 *
 * The XML is parsed with `fast-xml-parser` (the dev dependency `validate-sitemap` already uses)
 * rather than with a regular expression: a hand-rolled scanner would agree with a hand-rolled
 * serialiser about exactly the mistakes both make.
 *
 * The environment is swapped per case. Every deployment a reviewer can reach is `noindex` and
 * therefore announces nothing (§6), so the interesting table is the production one — and the
 * empty one is asserted too, because "the sitemap opens when the pages do" is the property that
 * makes shipping this before the §12 flip safe.
 */
import { XMLParser } from "fast-xml-parser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The corridor page shares its route file with spec 008's country shop root: one dynamic slug
// name per depth (spec 007 §14 A8 / spec 008 §14 A5, TASK-109). `generateMetadata` resolves which
// of the two a path is, so the corridor half is reached by passing a corridor's own segments.
import { generateMetadata as childRouteMetadata } from "../../src/app/[locale]/[segment]/[child]/page.tsx";
import { localePath } from "../../src/modules/i18n";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  SITEMAP_CHILDREN,
  SITEMAP_URL_CAP,
  corridorSitemapEntries,
  localeSitemapDocument,
  sitemapChildDocument,
  sitemapIndexDocument,
  sitemapLocales,
  staticSitemapEntries,
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

const ORIGINAL = {
  APP_ENV: process.env["APP_ENV"],
  NEXT_PUBLIC_SITE_URL: process.env["NEXT_PUBLIC_SITE_URL"],
};

/** `generateMetadata` reads `process.env`; these two keys are what it reads. */
function useDeployment(deployment: DeploymentDescriptor): void {
  process.env["APP_ENV"] = deployment.environment;
  process.env["NEXT_PUBLIC_SITE_URL"] = deployment.siteUrl;
}

beforeEach(() => {
  useDeployment(INDEXING);
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["sitemap", "url", "xhtml:link"].includes(name),
});

interface ParsedUrl {
  readonly loc: string;
  readonly lastmod: string;
  readonly alternates: readonly { hreflang: string; href: string }[];
}

function parseUrlSet(xml: string): readonly ParsedUrl[] {
  const parsed = parser.parse(xml) as {
    urlset?: {
      url?: {
        loc: string;
        lastmod: string;
        "xhtml:link"?: { "@hreflang": string; "@href": string }[];
      }[];
    };
  };
  return (parsed.urlset?.url ?? []).map((url) => ({
    loc: url.loc,
    lastmod: url.lastmod,
    alternates: (url["xhtml:link"] ?? []).map((link) => ({
      hreflang: link["@hreflang"],
      href: link["@href"],
    })),
  }));
}

function parseIndex(xml: string): readonly { loc: string; lastmod?: string }[] {
  const parsed = parser.parse(xml) as {
    sitemapindex?: { sitemap?: { loc: string; lastmod?: string }[] };
  };
  return parsed.sitemapindex?.sitemap ?? [];
}

/** Every announced URL, by walking the tree the way a crawler does. */
function crawl(deployment: DeploymentDescriptor): readonly ParsedUrl[] {
  const urls: ParsedUrl[] = [];
  for (const entry of parseIndex(sitemapIndexDocument(deployment))) {
    const locale = entry.loc.replace(`${ORIGIN}/sitemaps/`, "").split("/")[0];
    expect(locale, entry.loc).toBeDefined();
    const localeIndex = localeSitemapDocument(locale ?? "", deployment);
    expect(localeIndex, entry.loc).toBeDefined();
    for (const child of parseIndex(localeIndex ?? "")) {
      const name = child.loc.split("/").at(-1)?.replace(".xml", "") ?? "";
      const document = sitemapChildDocument(locale ?? "", name, deployment);
      expect(document, child.loc).toBeDefined();
      urls.push(...parseUrlSet(document ?? ""));
    }
  }
  return urls;
}

describe("the tree a crawler walks (AC-13, T-14)", () => {
  it("is index → two locale indexes → two children each → sixteen URLs", () => {
    const index = parseIndex(sitemapIndexDocument(INDEXING));
    expect(index.map((entry) => entry.loc)).toEqual([
      `${ORIGIN}/sitemaps/en/index.xml`,
      `${ORIGIN}/sitemaps/en-gb/index.xml`,
    ]);

    for (const locale of sitemapLocales(INDEXING)) {
      const children = parseIndex(
        localeSitemapDocument(locale, INDEXING) ?? "",
      );
      expect(children.map((child) => child.loc)).toEqual(
        SITEMAP_CHILDREN.map(
          (child) => `${ORIGIN}/sitemaps/${locale}/${child}.xml`,
        ),
      );
    }

    // Seven corridors + one hub, in each of the two authored locales.
    expect(crawl(INDEXING)).toHaveLength(16);
  });

  it("carries a real <lastmod> on every URL and every child, never the clock", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const url of crawl(INDEXING)) {
      expect(url.lastmod, url.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      // The authored corpus and the catalogue are older than the process running this test, so a
      // `<lastmod>` in the future is the one shape "now" could not produce either.
      expect(url.lastmod <= today, url.loc).toBe(true);
    }
    for (const entry of parseIndex(sitemapIndexDocument(INDEXING))) {
      expect(entry.lastmod, entry.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it("stays inside both caps", () => {
    for (const locale of sitemapLocales(INDEXING)) {
      for (const child of SITEMAP_CHILDREN) {
        const document = sitemapChildDocument(locale, child, INDEXING) ?? "";
        expect(parseUrlSet(document).length).toBeLessThanOrEqual(
          SITEMAP_URL_CAP,
        );
        expect(Buffer.byteLength(document, "utf8")).toBeLessThanOrEqual(
          10 * 1024 * 1024,
        );
      }
    }
  });

  it("announces nothing at all before the indexing flip (§6, §12)", () => {
    expect(crawl(PREVIEW)).toEqual([]);
    expect(sitemapLocales(PREVIEW)).toEqual([]);
  });
});

describe("the <head> cluster and the xhtml:link set are one call (AC-11, T-12)", () => {
  it("matches for every announced corridor URL, value for value and in order", async () => {
    for (const locale of sitemapLocales(INDEXING)) {
      for (const entry of corridorSitemapEntries(locale, INDEXING)) {
        const slug = entry.loc.split("/").at(-1) ?? "";
        const metadata = await childRouteMetadata({
          params: Promise.resolve({
            locale,
            segment: localePath(locale, "destinations").split("/")[2] ?? "",
            child: slug,
          }),
        });

        // Byte-equivalent: the same `hreflang` values, in the same order, pointing at the same
        // URLs — `Object.entries` preserves insertion order, which is the cluster's order.
        expect(
          Object.entries(metadata.alternates?.languages ?? {}).map(
            ([hreflang, href]) => ({ hreflang, href: String(href) }),
          ),
          entry.loc,
        ).toEqual(entry.alternates);

        // …and the row points at the page's own canonical, with the directive that let it in.
        expect(metadata.alternates?.canonical).toBe(entry.loc);
        expect(metadata.robots).toBe("index,follow");
      }
    }
  });

  it("carries x-default → /en and never en-150, on every row of every child", () => {
    for (const url of crawl(INDEXING)) {
      const values = url.alternates.map((alternate) => alternate.hreflang);
      expect(values, url.loc).toContain("x-default");
      expect(values, url.loc).not.toContain("en-150");
      const xDefault = url.alternates.find(
        (alternate) => alternate.hreflang === "x-default",
      );
      expect(xDefault?.href.startsWith(`${ORIGIN}/en`), url.loc).toBe(true);
      // No alternate for a locale that has no page: `de` and `pl` are absent everywhere.
      expect(values.some((value) => value.toLowerCase().startsWith("de"))).toBe(
        false,
      );
      expect(values.some((value) => value.toLowerCase().startsWith("pl"))).toBe(
        false,
      );
    }
  });
});

describe("sitemap ∩ noindex = ∅, at the module level (AC-14, T-15's unit twin)", () => {
  it("gives every announced URL an index,follow document", async () => {
    const announced = new Set(crawl(INDEXING).map((url) => url.loc));
    for (const locale of sitemapLocales(INDEXING)) {
      for (const entry of corridorSitemapEntries(locale, INDEXING)) {
        expect(announced.has(entry.loc)).toBe(true);
      }
      // The hub row is the only static one today; the locale home joins at TASK-096.
      expect(staticSitemapEntries(locale, INDEXING)).toHaveLength(1);
    }
  });

  it("announces no corridor URL whose document would say noindex", async () => {
    useDeployment(PREVIEW);
    const metadata = await childRouteMetadata({
      params: Promise.resolve({
        locale: "en",
        segment: "send-flowers-to",
        child: "poland",
      }),
    });
    expect(metadata.robots).toBe("noindex,follow");
    expect(crawl(PREVIEW)).toEqual([]);
  });
});
