/**
 * Spec 011 task 1's SEO and routing (TASK-210): T-05 / AC-5 (indexability, sitemap membership and
 * hreflang follow the rule), T-06 / AC-6 (the JSON-LD types and the FAQ's words), the unit half of
 * T-01 / AC-1 (which URL is which page, and which locales each route owns), the unit half of
 * T-09 / AC-9 (the header and footer link to the landing) and the robots disallows.
 *
 * The committed English landing is reviewed here through a corpus overlay (as
 * `info-pages-sitemap.test.ts` does for help); the English walkthrough is read as committed
 * (`reviewed: true`, the founder's own record-approval-210.py run), and the `de`/`pl` drafts as
 * committed (`reviewed: false`), so both sides of the rule are read from real files in one run.
 */
import { describe, expect, it, vi } from "vitest";

import type { DeploymentDescriptor } from "../../src/modules/seo/index.ts";

const REVIEWED_AT = "2026-10-23";

vi.mock(
  "../../src/modules/content/corpus.generated.ts",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../src/modules/content/corpus.generated.ts")
      >();
    return {
      INFO_CONTENT_FILES: original.INFO_CONTENT_FILES.map((file) =>
        file.path === "pages/en/for-florists.md"
          ? {
              ...file,
              source: file.source.replace(
                "reviewed: false",
                `reviewed: true\nreviewedBy: "founder"\nreviewedAt: "${REVIEWED_AT}"`,
              ),
            }
          : file,
      ),
    };
  },
);

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages, MESSAGE_NAMESPACES } =
    await import("../../src/modules/i18n/messages.ts");
  return {
    setRequestLocale: (): void => undefined,
    getTranslations: ({ locale }: { locale: string }) =>
      Promise.resolve(
        createTranslator({
          locale,
          messages: loadMessages(locale, [...MESSAGE_NAMESPACES]),
        }),
      ),
  };
});

const { staticSitemapEntries } =
  await import("../../src/modules/seo/sitemap/statics.ts");
const {
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  PAGE_TYPE_POLICY,
  DISALLOWED_PATHS,
  indexability,
  infoPageHreflangPaths,
  infoPageJsonLd,
  infoPageMetadata,
  robotsPolicy,
} = await import("../../src/modules/seo/index.ts");
const { infoPagePath, infoPageView } =
  await import("../../src/modules/content/index.ts");
const { localeChildParams, localeSegmentParams, resolveLocalePath } =
  await import("../../src/modules/catalog/index.ts");
const { floristApplyJsonLd, floristFormRoute } =
  await import("../../src/modules/partners/ui/apply/route.tsx");
const { loadMessages } = await import("../../src/modules/i18n/index.ts");
const { headerEndClusterItems } =
  await import("../../src/modules/ui/layout/header-model.ts");
const { footerView } = await import("../../src/modules/ui/index.ts");

const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
};
const PREVIEW: DeploymentDescriptor = {
  environment: "preview",
  siteUrl: "https://preview.example.com",
};
const ORIGIN = "https://flowersoverseas.com";
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const FLORIST_IDS = [
  "for-florists",
  "how-orders-work",
  "florist-apply",
  "florist-apply-sent",
] as const;

/** The breadcrumb's labels, from the catalogue: one message, dotted keys. */
function labelOf(locale: string) {
  const messages = loadMessages(locale, [
    "common",
    "nav",
    "breadcrumb",
    "forFlorists",
  ]) as Record<string, unknown>;
  return (key: string, values?: Readonly<Record<string, string>>): string => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (scope, part) => (scope as Record<string, unknown> | undefined)?.[part],
        messages,
      );
    if (typeof value !== "string") throw new Error(`no message for ${key}`);
    return value.replace("{name}", values?.["name"] ?? "");
  };
}

describe("T-05 / AC-5: the rule, over every combination", () => {
  it("registers the landing and walkthrough byRule, the apply and sent pages never", () => {
    expect(PAGE_TYPE_POLICY["for-florists"]).toBe("byRule");
    expect(PAGE_TYPE_POLICY["how-orders-work"]).toBe("byRule");
    expect(PAGE_TYPE_POLICY["florist-apply"]).toBe("never");
    expect(PAGE_TYPE_POLICY["florist-apply-sent"]).toBe("never");
  });

  const flags = [true, false] as const;
  for (const pageId of FLORIST_IDS) {
    for (const reviewed of flags) {
      for (const localeIndexable of flags) {
        for (const indexingEnvironment of flags) {
          const expected =
            PAGE_TYPE_POLICY[pageId] === "byRule" &&
            reviewed &&
            localeIndexable &&
            indexingEnvironment
              ? INDEX_FOLLOW
              : NOINDEX_FOLLOW;
          it(`${pageId}: reviewed ${String(reviewed)}, locale ${String(localeIndexable)}, env ${String(indexingEnvironment)} → ${expected}`, () => {
            expect(
              indexability({
                pageTypeIndexable: PAGE_TYPE_POLICY[pageId] === "byRule",
                exists: true,
                reviewed,
                localeIndexable,
                indexingEnvironment,
              }),
            ).toBe(expected);
          });
        }
      }
    }
  }
});

describe("T-05 / AC-5: what the committed files make of it", () => {
  it("indexes the reviewed English landing and walkthrough, and nothing a draft holds", () => {
    for (const [pageId, locale] of [
      ["for-florists", "en"],
      ["for-florists", "en-gb"],
      ["how-orders-work", "en"],
      ["how-orders-work", "en-gb"],
    ] as const) {
      expect(
        infoPageMetadata(pageId, locale, INDEXING)?.robots,
        `${pageId} ${locale}`,
      ).toBe(INDEX_FOLLOW);
    }
    for (const [pageId, locale] of [
      ["for-florists", "de"],
      ["for-florists", "pl"],
      ["how-orders-work", "pl"],
    ] as const) {
      expect(
        infoPageMetadata(pageId, locale, INDEXING)?.robots,
        `${pageId} ${locale}`,
      ).toBe(NOINDEX_FOLLOW);
    }
    // Outside the indexing environment, the reviewed page is `noindex` too.
    expect(infoPageMetadata("for-florists", "en", PREVIEW)?.robots).toBe(
      NOINDEX_FOLLOW,
    );
  });

  it("puts exactly the indexable florists pages in static.xml, with lastmod and reviewed alternates", () => {
    const florist = (locale: string) =>
      staticSitemapEntries(locale, INDEXING).filter((row) =>
        /\/(for-florists|fuer-floristen|dla-kwiaciarni)/u.test(row.loc),
      );
    expect(florist("en").map((row) => row.loc)).toEqual([
      `${ORIGIN}/en/for-florists`,
      `${ORIGIN}/en/for-florists/how-orders-work`,
    ]);
    expect(florist("en-gb").map((row) => row.loc)).toEqual([
      `${ORIGIN}/en-gb/for-florists`,
      `${ORIGIN}/en-gb/for-florists/how-orders-work`,
    ]);
    expect(florist("de")).toEqual([]);
    expect(florist("pl")).toEqual([]);
    const [row] = florist("en");
    expect(row?.lastmod).toBe(infoPageView("for-florists", "en")?.updatedAt);
    expect(
      [...new Set(row?.alternates.map((alternate) => alternate.href))].sort(),
    ).toEqual([`${ORIGIN}/en-gb/for-florists`, `${ORIGIN}/en/for-florists`]);
    expect(row?.alternates.map((alternate) => alternate.hreflang)).toContain(
      "x-default",
    );
    for (const locale of LOCALES) {
      expect(
        florist(locale)
          .map((r) => r.loc)
          .join(" "),
      ).not.toMatch(/apply|bewerben|zglos-sie/u);
      expect(
        staticSitemapEntries(locale, PREVIEW).filter((r) =>
          /florist|floristen|kwiaciarni/u.test(r.loc),
        ),
      ).toEqual([]);
    }
  });

  it("clusters hreflang only among reviewed locales: never a de or pl draft", () => {
    expect(Object.keys(infoPageHreflangPaths("for-florists")).sort()).toEqual([
      "en",
      "en-gb",
    ]);
    expect(
      Object.keys(infoPageHreflangPaths("how-orders-work")).sort(),
    ).toEqual(["en", "en-gb"]);
    const alternates = infoPageMetadata("for-florists", "en", INDEXING)
      ?.alternates?.languages as Record<string, string> | undefined;
    expect(Object.values(alternates ?? {}).join(" ")).not.toMatch(
      /\/(de|pl)\//u,
    );
    expect(Object.keys(alternates ?? {})).toContain("x-default");
    expect(alternates?.["x-default"]).toBe(`${ORIGIN}/en/for-florists`);
  });

  it("answers noindex,follow for the apply and sent pages in every locale, self-canonical", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
    for (const [page, segments, locale] of [
      ["florist-apply", ["for-florists", "apply"], "en"],
      ["florist-apply-sent", ["for-florists", "apply", "sent"], "en-gb"],
      ["florist-apply", ["fuer-floristen", "bewerben"], "de"],
      ["florist-apply-sent", ["dla-kwiaciarni", "zglos-sie", "wyslano"], "pl"],
    ] as const) {
      const metadata = await floristFormRoute(page, segments).generateMetadata({
        params: Promise.resolve({ locale }),
      });
      expect(metadata.robots, `${page} ${locale}`).toBe(NOINDEX_FOLLOW);
      expect(String(metadata.alternates?.canonical)).toMatch(
        new RegExp(`${infoPagePath(page, locale)}$`, "u"),
      );
      expect(metadata.alternates?.languages).toBeUndefined();
    }
    vi.unstubAllEnvs();
  });
});

describe("T-06 / AC-6: structured data", () => {
  const FORBIDDEN = [
    "JobPosting",
    "LocalBusiness",
    "FloristShop",
    "Offer",
    "Product",
    "AggregateRating",
    "Review",
    "HowTo",
  ];
  const typesOf = (nodes: readonly Record<string, unknown>[]) =>
    nodes.map((node) => node["@type"]);

  it("the landing is BreadcrumbList, WebPage and FAQPage, the FAQ word for word the visible list", () => {
    for (const locale of LOCALES) {
      const nodes = infoPageJsonLd(
        "for-florists",
        locale,
        INDEXING,
        labelOf(locale),
      );
      expect(typesOf(nodes)).toEqual(["BreadcrumbList", "WebPage", "FAQPage"]);
      const faq = nodes.find((node) => node["@type"] === "FAQPage") as
        | { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
        | undefined;
      const view = infoPageView("for-florists", locale);
      expect(
        faq?.mainEntity.map((entry) => ({
          q: entry.name,
          a: entry.acceptedAnswer.text,
        })),
      ).toEqual(view?.faq);
      const page = nodes.find((node) => node["@type"] === "WebPage");
      expect(page).toMatchObject({
        name: view?.seoTitle,
        url: `${ORIGIN}${infoPagePath("for-florists", locale)}`,
        inLanguage: locale,
      });
    }
  });

  it("the walkthrough and the apply page carry BreadcrumbList, the walkthrough's through its parent", () => {
    const walkthrough = infoPageJsonLd(
      "how-orders-work",
      "en",
      INDEXING,
      labelOf("en"),
    );
    expect(typesOf(walkthrough)).toEqual(["BreadcrumbList"]);
    expect(walkthrough[0]).toMatchObject({
      itemListElement: [
        { name: "Home", item: `${ORIGIN}/en` },
        { name: "For florists", item: `${ORIGIN}/en/for-florists` },
        { name: "How an order reaches you" },
      ],
    });
    const apply = floristApplyJsonLd("en", labelOf("en"), { baseUrl: ORIGIN });
    expect(typesOf(apply)).toEqual(["BreadcrumbList"]);
    expect(apply[0]).toMatchObject({
      itemListElement: [
        { name: "Home" },
        { name: "For florists", item: `${ORIGIN}/en/for-florists` },
        { name: "Apply" },
      ],
    });
  });

  it("none of the four carries a forbidden type", () => {
    for (const locale of LOCALES) {
      const json = JSON.stringify([
        infoPageJsonLd("for-florists", locale, INDEXING, labelOf(locale)),
        infoPageJsonLd("how-orders-work", locale, INDEXING, labelOf(locale)),
        floristApplyJsonLd(locale, labelOf(locale), { baseUrl: ORIGIN }),
      ]);
      for (const type of FORBIDDEN) {
        expect(json, `${locale} ${type}`).not.toContain(`"@type":"${type}"`);
      }
    }
  });
});

describe("T-01 / AC-1 (unit half): which page a URL is", () => {
  const PATHS = {
    en: ["for-florists", "how-orders-work", "apply", "sent"],
    "en-gb": ["for-florists", "how-orders-work", "apply", "sent"],
    de: ["fuer-floristen", "so-kommen-auftraege", "bewerben", "gesendet"],
    pl: ["dla-kwiaciarni", "jak-przychodza-zamowienia", "zglos-sie", "wyslano"],
  } as const;

  it.each(LOCALES)(
    "resolves the landing and walkthrough of %s, and nothing else under the segment",
    async (locale) => {
      const [segment, walkthrough, apply] = PATHS[locale];
      expect(await resolveLocalePath(locale, [segment])).toEqual({
        kind: "infoPage",
        locale,
        pageId: "for-florists",
      });
      expect(await resolveLocalePath(locale, [segment, walkthrough])).toEqual({
        kind: "infoPage",
        locale,
        pageId: "how-orders-work",
      });
      // The apply page is its own route file's, never the shared depth file's.
      expect((await resolveLocalePath(locale, [segment, apply])).kind).toBe(
        "notFound",
      );
      expect((await resolveLocalePath(locale, [segment, "nope"])).kind).toBe(
        "notFound",
      );
      expect(infoPagePath("florist-apply-sent", locale)).toBe(
        `/${locale}/${PATHS[locale].join("/").replace(`/${walkthrough}`, "")}`,
      );
    },
  );

  it("prebuilds the landing and walkthrough in all four locales", async () => {
    const segmentParams = await localeSegmentParams();
    const childParams = await localeChildParams();
    for (const locale of LOCALES) {
      const [segment, walkthrough] = PATHS[locale];
      expect(segmentParams).toContainEqual({ locale, segment });
      expect(childParams).toContainEqual({
        locale,
        segment,
        child: walkthrough,
      });
    }
  });

  it("gives each apply and sent route exactly the locales whose path it is", async () => {
    const owned = (
      page: "florist-apply" | "florist-apply-sent",
      segments: string[],
    ) =>
      floristFormRoute(page, segments)
        .generateStaticParams()
        .map((p) => p.locale);
    expect(owned("florist-apply", ["for-florists", "apply"])).toEqual([
      "en",
      "en-gb",
    ]);
    expect(
      owned("florist-apply-sent", ["for-florists", "apply", "sent"]),
    ).toEqual(["en", "en-gb"]);
    expect(owned("florist-apply", ["fuer-floristen", "bewerben"])).toEqual([
      "de",
    ]);
    expect(
      owned("florist-apply-sent", ["fuer-floristen", "bewerben", "gesendet"]),
    ).toEqual(["de"]);
    expect(owned("florist-apply", ["dla-kwiaciarni", "zglos-sie"])).toEqual([
      "pl",
    ]);
    expect(
      owned("florist-apply-sent", ["dla-kwiaciarni", "zglos-sie", "wyslano"]),
    ).toEqual(["pl"]);
    // `/de/for-florists/apply` is a 404, not the German page under the English slug.
    await expect(
      floristFormRoute("florist-apply", ["for-florists", "apply"]).Page({
        params: Promise.resolve({ locale: "de" }),
      }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/u);
  });
});

describe("T-09 / AC-9 (unit half) and robots", () => {
  it.each(LOCALES)(
    "the header and the footer link to the landing in %s",
    (locale) => {
      const path = infoPagePath("for-florists", locale);
      expect(headerEndClusterItems(locale)).toContainEqual(
        expect.objectContaining({ id: "for-florists", href: path }),
      );
      const links = footerView(locale).columns.flatMap(
        (column) => column.links,
      );
      expect(links).toContainEqual(
        expect.objectContaining({ id: "for-florists", href: path }),
      );
    },
  );

  it("disallows /demo/ and /vendor/ in the indexing environment's robots.txt", () => {
    expect(DISALLOWED_PATHS).toContain("/demo/");
    expect(DISALLOWED_PATHS).toContain("/vendor/");
    expect(robotsPolicy(INDEXING).disallow).toEqual(
      expect.arrayContaining(["/demo/", "/vendor/"]),
    );
  });
});
