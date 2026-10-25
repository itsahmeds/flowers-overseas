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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The listing routes' `generateMetadata` asks `next-intl/server` for its translator, which only
 * resolves inside Next's request scope. The translator here reads the real shipped catalogue and
 * fills `{name}` arguments plainly: titles and descriptions are not what these cases compare (the
 * robots directive, the canonical and the hreflang cluster are), but a missing key still throws.
 */
vi.mock("next-intl/server", async () => {
  const { MESSAGE_NAMESPACES, loadMessages } =
    await import("../../src/modules/i18n/messages.ts");
  return {
    setRequestLocale: (): void => undefined,
    getLocale: (): Promise<string> => Promise.resolve("en"),
    getTranslations: ({
      locale,
      namespace,
    }: {
      locale: string;
      namespace?: (typeof MESSAGE_NAMESPACES)[number];
    }): Promise<(key: string, values?: Record<string, unknown>) => string> => {
      const messages: unknown =
        namespace === undefined
          ? loadMessages(locale, MESSAGE_NAMESPACES)
          : loadMessages(locale, [namespace])[namespace];
      return Promise.resolve((key, values = {}) => {
        let value: unknown = messages;
        for (const part of key.split(".")) {
          value = (value as Record<string, unknown> | undefined)?.[part];
        }
        if (typeof value !== "string") {
          throw new Error(`missing message key: ${namespace ?? ""}.${key}`);
        }
        return value.replace(/\{(\w+)\}/gu, (_match, name: string) =>
          String(values[name] ?? ""),
        );
      });
    },
  };
});

// The corridor page shares its route file with spec 008's country shop root: one dynamic slug
// name per depth (spec 007 §14 A8 / spec 008 §14 A5, TASK-109). `generateMetadata` resolves which
// of the two a path is, so the corridor half is reached by passing a corridor's own segments.
import { generateMetadata as childRouteMetadata } from "../../src/app/[locale]/[segment]/[child]/page.tsx";
import { generateMetadata as grandchildRouteMetadata } from "../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx";
import { generateMetadata as segmentRouteMetadata } from "../../src/app/[locale]/[segment]/page.tsx";
import { localePath } from "../../src/modules/i18n";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  SITEMAP_CHILDREN,
  SITEMAP_URL_CAP,
  type SitemapEntry,
  categorySitemapEntries,
  corridorSitemapEntries,
  localeSitemapDocument,
  occasionSitemapEntries,
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
async function crawl(
  deployment: DeploymentDescriptor,
): Promise<readonly ParsedUrl[]> {
  const urls: ParsedUrl[] = [];
  for (const entry of parseIndex(await sitemapIndexDocument(deployment))) {
    const locale = entry.loc.replace(`${ORIGIN}/sitemaps/`, "").split("/")[0];
    expect(locale, entry.loc).toBeDefined();
    const localeIndex = await localeSitemapDocument(locale ?? "", deployment);
    expect(localeIndex, entry.loc).toBeDefined();
    for (const child of parseIndex(localeIndex ?? "")) {
      const name = child.loc.split("/").at(-1)?.replace(".xml", "") ?? "";
      const document = await sitemapChildDocument(
        locale ?? "",
        name,
        deployment,
      );
      expect(document, child.loc).toBeDefined();
      urls.push(...parseUrlSet(document ?? ""));
    }
  }
  return urls;
}

/** Every listing row (spec 008 AC-19) a locale announces, across both listing children. */
async function listingRows(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<readonly SitemapEntry[]> {
  return [
    ...(await categorySitemapEntries(locale, deployment)),
    ...(await occasionSitemapEntries(locale, deployment)),
  ];
}

/**
 * A whole-tree walk reads the listing existence set of every locale (spec 008's two children,
 * TASK-116) three times over: about 4 s here, past Vitest's 5 000 ms default on a CI runner. The
 * integration project keeps that default, so the cases that walk the tree say their own budget.
 */
const TREE_WALK_TIMEOUT_MS = 30_000;

describe(
  "the tree a crawler walks (AC-13, T-14; spec 008 AC-19, T-19)",
  { timeout: TREE_WALK_TIMEOUT_MS },
  () => {
    it("is index → two locale indexes → four children each → corridors, hubs and listings", async () => {
      const index = parseIndex(await sitemapIndexDocument(INDEXING));
      expect(index.map((entry) => entry.loc)).toEqual([
        `${ORIGIN}/sitemaps/en/index.xml`,
        `${ORIGIN}/sitemaps/en-gb/index.xml`,
      ]);

      let listings = 0;
      for (const locale of await sitemapLocales(INDEXING)) {
        const children = parseIndex(
          (await localeSitemapDocument(locale, INDEXING)) ?? "",
        );
        expect(children.map((child) => child.loc)).toEqual(
          SITEMAP_CHILDREN.map(
            (child) => `${ORIGIN}/sitemaps/${locale}/${child}.xml`,
          ),
        );
        listings += (await listingRows(locale, INDEXING)).length;
      }

      // Seven corridors + one hub in each of the two authored locales, plus the listing rows: the
      // control that the listing children are not vacuously empty here.
      expect(listings).toBeGreaterThan(0);
      expect(await crawl(INDEXING)).toHaveLength(16 + listings);
    });

    it("lists the bare origin nowhere: `/` is a 308 to `/en` (spec 003 §14 A16 clause 3, T-07)", async () => {
      const urls = await crawl(INDEXING);
      // The control: the crawl reached real URLs, so the absence below is not vacuous.
      expect(urls.length).toBeGreaterThan(0);
      const bare = new Set([ORIGIN, `${ORIGIN}/`]);
      for (const url of urls) {
        expect(bare.has(url.loc), url.loc).toBe(false);
        for (const alternate of url.alternates) {
          expect(bare.has(alternate.href), alternate.href).toBe(false);
        }
      }
      for (const entry of parseIndex(await sitemapIndexDocument(INDEXING))) {
        expect(bare.has(entry.loc), entry.loc).toBe(false);
      }
    });

    it("carries a real <lastmod> on every URL and every child, never the clock", async () => {
      const today = new Date().toISOString().slice(0, 10);
      for (const url of await crawl(INDEXING)) {
        expect(url.lastmod, url.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        // The authored corpus and the catalogue are older than the process running this test, so a
        // `<lastmod>` in the future is the one shape "now" could not produce either.
        expect(url.lastmod <= today, url.loc).toBe(true);
      }
      for (const entry of parseIndex(await sitemapIndexDocument(INDEXING))) {
        expect(entry.lastmod, entry.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      }
    });

    it("stays inside both caps", async () => {
      for (const locale of await sitemapLocales(INDEXING)) {
        for (const child of SITEMAP_CHILDREN) {
          const document =
            (await sitemapChildDocument(locale, child, INDEXING)) ?? "";
          expect(parseUrlSet(document).length).toBeLessThanOrEqual(
            SITEMAP_URL_CAP,
          );
          expect(Buffer.byteLength(document, "utf8")).toBeLessThanOrEqual(
            10 * 1024 * 1024,
          );
        }
      }
    });

    it("announces nothing at all before the indexing flip (§6, §12)", async () => {
      expect(await crawl(PREVIEW)).toEqual([]);
      expect(await sitemapLocales(PREVIEW)).toEqual([]);
      // Spec 008 AC-19's Phase 0 clause: both listing children empty, so absent from every index.
      for (const locale of ["en", "en-gb", "de", "pl"]) {
        expect(await listingRows(locale, PREVIEW)).toEqual([]);
        expect(await localeSitemapDocument(locale, PREVIEW)).toBeUndefined();
      }
    });
  },
);

describe(
  "the <head> cluster and the xhtml:link set are one call (AC-11, T-12)",
  { timeout: TREE_WALK_TIMEOUT_MS },
  () => {
    it("matches for every announced corridor URL, value for value and in order", async () => {
      for (const locale of await sitemapLocales(INDEXING)) {
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

    it("carries x-default → /en and never en-150, on every row of every child", async () => {
      for (const url of await crawl(INDEXING)) {
        const values = url.alternates.map((alternate) => alternate.hreflang);
        expect(values, url.loc).toContain("x-default");
        expect(values, url.loc).not.toContain("en-150");
        const xDefault = url.alternates.find(
          (alternate) => alternate.hreflang === "x-default",
        );
        expect(xDefault?.href.startsWith(`${ORIGIN}/en`), url.loc).toBe(true);
        // No alternate for a locale that has no page: `de` and `pl` are absent everywhere.
        expect(
          values.some((value) => value.toLowerCase().startsWith("de")),
        ).toBe(false);
        expect(
          values.some((value) => value.toLowerCase().startsWith("pl")),
        ).toBe(false);
      }
    });
  },
);

describe(
  "sitemap ∩ noindex = ∅, at the module level (AC-14, T-15's unit twin)",
  { timeout: TREE_WALK_TIMEOUT_MS },
  () => {
    it("gives every announced URL an index,follow document", async () => {
      const announced = new Set((await crawl(INDEXING)).map((url) => url.loc));
      for (const locale of await sitemapLocales(INDEXING)) {
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
      expect(await crawl(PREVIEW)).toEqual([]);
    });
  },
);

/**
 * Spec 008 AC-19 (and AC-16's sitemap half), T-19's integration half (TASK-116): every listing
 * row against **the document it names**, as Next renders that document's `<head>`. The route is
 * picked by path depth exactly as the App Router picks it, so the row's `<loc>`, its
 * `xhtml:link` set and the page's canonical, robots and hreflang cluster are compared value for
 * value, in order.
 */
async function listingMetadata(loc: string) {
  const [locale = "", ...segments] = loc.slice(`${ORIGIN}/`.length).split("/");
  const [segment = "", child = "", grandchild = ""] = segments;
  switch (segments.length) {
    case 1:
      return segmentRouteMetadata({
        params: Promise.resolve({ locale, segment }),
      });
    case 2:
      return childRouteMetadata({
        params: Promise.resolve({ locale, segment, child }),
      });
    default:
      return grandchildRouteMetadata({
        params: Promise.resolve({ locale, segment, child, grandchild }),
      });
  }
}

describe(
  "listing rows and their documents are one answer (spec 008 AC-19, AC-16, T-19)",
  { timeout: TREE_WALK_TIMEOUT_MS },
  () => {
    it("gives every listing row an index,follow document with the row's own canonical and cluster", async () => {
      let checked = 0;
      for (const locale of await sitemapLocales(INDEXING)) {
        for (const entry of await listingRows(locale, INDEXING)) {
          const metadata = await listingMetadata(entry.loc);
          expect(metadata.robots, entry.loc).toBe("index,follow");
          expect(metadata.alternates?.canonical, entry.loc).toBe(entry.loc);
          expect(
            Object.entries(metadata.alternates?.languages ?? {}).map(
              ([hreflang, href]) => ({ hreflang, href: String(href) }),
            ),
            entry.loc,
          ).toEqual(entry.alternates);
          checked += 1;
        }
      }
      // The control: the loop ran over real rows, so the agreement above is not vacuous.
      expect(checked).toBeGreaterThan(0);
    });

    it("announces no listing URL whose document says noindex: an unreviewed hub is absent", async () => {
      // `/en/flowers/roses` exists (a category hub with products) and its copy row is unreviewed,
      // so its own document is `noindex,follow`, and it must be in no sitemap.
      const roses = `${ORIGIN}/en/flowers/roses`;
      const metadata = await listingMetadata(roses);
      expect(metadata.robots).toBe("noindex,follow");
      const announced = (await crawl(INDEXING)).map((url) => url.loc);
      expect(announced).not.toContain(roses);
    });

    it("announces no country-scoped listing while no destination is operational (Phase 0)", async () => {
      const shopRoot = `${ORIGIN}/en/poland/flowers`;
      expect((await listingMetadata(shopRoot)).robots).toBe("noindex,follow");
      for (const url of await crawl(INDEXING)) {
        expect(url.loc, url.loc).not.toMatch(
          /\/(?:en|en-gb)\/[a-z-]+\/(?:flowers|occasions)(?:\/|$)/u,
        );
      }
    });
  },
);
