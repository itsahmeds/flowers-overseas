/**
 * Spec 044's blog head, schema and sitemap child (§2.8, §6; AC-9, AC-10, AC-11; T-09, T-10,
 * T-11 unit halves; TASK-322).
 *
 * `isLocaleIndexable` is pinned here to "the two English locales are indexable" so the indexing
 * half of the rule can be observed at all: with spec 044's ten copy keys still `reviewed: false`
 * (the founder's recording, TASK-322's escalation) the shipped English share is above 5 %, and
 * every case below would read "noindex" for a reason that is not the blog's.
 */
import { describe, expect, it, vi } from "vitest";

import { recordsBlogProvider } from "../../src/modules/content/blog/provider.ts";
import {
  type BlogPostPageView,
  editorialPages,
  postPageView,
} from "../../src/modules/content/blog/view.ts";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  PAGE_TYPE_POLICY,
  blogPageMetadata,
  blogPostJsonLd,
  blogIndexJsonLd,
  localeSitemapChildren,
  sitemapChildDocument,
  sitemapChildEntries,
} from "../../src/modules/seo/index.ts";
import {
  POST_ID,
  SLUG,
  fakeTargets,
  postRecord,
} from "../fixtures/blog-pages.ts";

const gate = vi.hoisted(() => ({ indexable: new Set(["en", "en-gb"]) }));
vi.mock("../../src/modules/i18n/review.ts", async (original) => ({
  ...(await original<typeof import("../../src/modules/i18n/review.ts")>()),
  isLocaleIndexable: (locale: string) => gate.indexable.has(locale),
}));

const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: `https://${CANONICAL_HOST}`,
};
const PREVIEW: DeploymentDescriptor = {
  environment: "preview",
  siteUrl: "https://fo-preview.up.railway.app",
};
const ORIGIN = `https://${CANONICAL_HOST}`;
const LOCALES = ["en", "en-gb", "de", "pl"];

const LABELS: Readonly<Record<string, string>> = {
  "common.homeLink": "Home",
  "breadcrumb.blog": "Blog",
  "breadcrumb.entity": "{name}",
};
const label = (key: string, values?: Readonly<Record<string, string>>) =>
  (LABELS[key] ?? key).replace("{name}", values?.["name"] ?? "");

async function view(
  locale: "en" | "en-gb",
  overrides: Parameters<typeof postRecord>[0] = {},
): Promise<BlogPostPageView> {
  const record = postRecord(overrides);
  return postPageView(record, locale, {
    source: recordsBlogProvider([record]),
    targets: fakeTargets,
    datesOpen: false,
    routeLocales: LOCALES,
    corridorHref: () => undefined,
  });
}

type Node = Readonly<Record<string, unknown>>;

function posting(nodes: readonly (Node | undefined)[]): Node {
  const found = nodes.find((node) => node?.["@type"] === "BlogPosting");
  if (found === undefined) throw new Error("no BlogPosting");
  return found;
}

describe("BlogPosting mirrors the visible page field for field (AC-11, T-11)", () => {
  it("takes every field from the view the page renders", async () => {
    const page = await view("en");
    const node = posting(blogPostJsonLd(page, label, INDEXING));
    expect(node["headline"]).toBe(page.title);
    // The visible excerpt, never the head-only SEO description (the mutation this case pins).
    expect(node["description"]).toBe(page.excerpt);
    expect(node["description"]).not.toBe(page.seoDescription);
    expect(node["author"]).toEqual({
      "@type": "Person",
      name: page.authorName,
    });
    expect(node["datePublished"]).toBe(page.published.iso);
    // No "Updated" line renders, so dateModified is the visible published date.
    expect(page.updated).toBeUndefined();
    expect(node["dateModified"]).toBe(page.published.iso);
    expect(node["inLanguage"]).toBe("en");
    expect(node["mainEntityOfPage"]).toBe(`${ORIGIN}/en/blog/${SLUG}`);
    expect("image" in node).toBe(false);
    expect(node["publisher"]).toEqual({
      "@type": "Organization",
      name: "Flowers Overseas",
      logo: `${ORIGIN}/icon.svg`,
    });
  });

  it("carries the Updated date and the en-GB document language when they render", async () => {
    const page = await view("en-gb", {
      revisionPublishedAt: "2026-10-23T08:00:00.000Z",
    });
    const node = posting(blogPostJsonLd(page, label, INDEXING));
    expect(node["dateModified"]).toBe("2026-10-23");
    expect(node["dateModified"]).toBe(page.updated?.iso);
    expect(node["inLanguage"]).toBe("en-GB");
    expect(node["mainEntityOfPage"]).toBe(`${ORIGIN}/en-gb/blog/${SLUG}`);
  });

  it("mirrors the visible breadcrumb, and names no commerce type anywhere", async () => {
    const page = await view("en");
    const nodes = blogPostJsonLd(page, label, INDEXING);
    const crumbs = nodes.find((node) => node?.["@type"] === "BreadcrumbList");
    expect(crumbs?.["itemListElement"]).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/en` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${ORIGIN}/en/blog`,
      },
      { "@type": "ListItem", position: 3, name: page.title },
    ]);
    const text = JSON.stringify([
      ...nodes,
      ...blogIndexJsonLd(
        [
          { labelKey: "common.homeLink", href: "/en", current: false },
          { labelKey: "breadcrumb.blog", href: "/en/blog", current: true },
        ],
        label,
        INDEXING,
      ),
    ]);
    for (const type of [
      "Product",
      "Offer",
      "Review",
      "AggregateRating",
      "FAQPage",
      "LocalBusiness",
    ]) {
      expect(text).not.toContain(`"${type}"`);
    }
  });
});

describe("the head: one verdict, self-canonical, the English cluster (AC-9, AC-10, T-09)", () => {
  const head = async (locale: "en" | "en-gb", deployment = INDEXING) => {
    const page = await view(locale);
    return blogPageMetadata(
      {
        pageType: "blogPost",
        locale,
        path: page.path,
        title: page.seoTitle,
        description: page.seoDescription,
        reviewed: page.reviewed,
        alternatePaths: page.alternatePaths,
      },
      deployment,
    );
  };

  it("registers both page types by rule", () => {
    expect(PAGE_TYPE_POLICY.blogIndex).toBe("byRule");
    expect(PAGE_TYPE_POLICY.blogPost).toBe("byRule");
  });

  it("is self-canonical in each English locale with the same reciprocal cluster and no de or pl", async () => {
    const en = await head("en");
    const gb = await head("en-gb");
    expect(en.alternates?.canonical).toBe(`${ORIGIN}/en/blog/${SLUG}`);
    expect(gb.alternates?.canonical).toBe(`${ORIGIN}/en-gb/blog/${SLUG}`);
    expect(en.alternates?.languages).toEqual(gb.alternates?.languages);
    const languages = en.alternates?.languages as Record<string, string>;
    expect(languages["en-GB"]).toBe(`${ORIGIN}/en-gb/blog/${SLUG}`);
    expect(languages["x-default"]).toBe(`${ORIGIN}/en/blog/${SLUG}`);
    expect(Object.keys(languages).some((key) => /^(de|pl)/u.test(key))).toBe(
      false,
    );
    expect(en.title).toBe("Flowers for a Polish name day");
    expect(en.robots).toBe(INDEX_FOLLOW);
  });

  it("is noindex,follow outside the indexing environment, with a non-indexable locale, or a lapsed approval", async () => {
    expect((await head("en", PREVIEW)).robots).toBe(NOINDEX_FOLLOW);
    gate.indexable = new Set(["en-gb"]);
    try {
      expect((await head("en")).robots).toBe(NOINDEX_FOLLOW);
    } finally {
      gate.indexable = new Set(["en", "en-gb"]);
    }
    const lapsed = await view("en", { reviewed: false });
    expect(
      blogPageMetadata(
        {
          pageType: "blogPost",
          locale: "en",
          path: lapsed.path,
          title: lapsed.seoTitle,
          description: lapsed.seoDescription,
          reviewed: lapsed.reviewed,
          alternatePaths: lapsed.alternatePaths,
        },
        INDEXING,
      ).robots,
    ).toBe(NOINDEX_FOLLOW);
  });
});

describe("editorial.xml: exactly the indexable blog URLs, from the same verdict (AC-10, T-10)", () => {
  const sources = async (records = [postRecord()]) => {
    const source = recordsBlogProvider(records);
    return {
      editorial: Object.fromEntries(
        await Promise.all(
          LOCALES.map(
            async (locale) =>
              [locale, await editorialPages(locale, LOCALES, source)] as const,
          ),
        ),
      ),
    };
  };

  it("lists the index and the post with the revision's day and the head's cluster", async () => {
    const editorial = await sources([
      postRecord({ revisionPublishedAt: "2026-10-23T08:00:00.000Z" }),
    ]);
    const entries = sitemapChildEntries("en", "editorial", INDEXING, editorial);
    expect(entries.map((entry) => entry.loc)).toEqual([
      `${ORIGIN}/en/blog`,
      `${ORIGIN}/en/blog/${SLUG}`,
    ]);
    expect(entries.map((entry) => entry.lastmod)).toEqual([
      "2026-10-23",
      "2026-10-23",
    ]);
    const post = entries[1];
    const hreflangs =
      post?.alternates.map((alternate) => alternate.hreflang) ?? [];
    expect(hreflangs).toEqual(
      expect.arrayContaining(["en", "en-GB", "x-default"]),
    );
    expect(hreflangs.some((code) => /^(de|pl)/u.test(code))).toBe(false);
    // The head prints the same cluster (one `alternatesFor()` call, AC-9).
    const page = await view("en");
    const headCluster = blogPageMetadata(
      {
        pageType: "blogPost",
        locale: "en",
        path: page.path,
        title: page.seoTitle,
        description: page.seoDescription,
        reviewed: page.reviewed,
        alternatePaths: page.alternatePaths,
      },
      INDEXING,
    ).alternates?.languages as Record<string, string>;
    expect(
      Object.fromEntries(
        (post?.alternates ?? []).map((alternate) => [
          alternate.hreflang,
          alternate.href,
        ]),
      ),
    ).toEqual(headCluster);
    expect(
      sitemapChildDocument("en", "editorial", INDEXING, editorial),
    ).toContain(`<loc>${ORIGIN}/en/blog/${SLUG}</loc>`);
    expect(localeSitemapChildren("en", INDEXING, editorial)).toContain(
      `${ORIGIN}/sitemaps/en/editorial.xml`,
    );
  });

  it("is absent outside the indexing environment, for a lapsed approval, in de and pl, and with no post", async () => {
    const editorial = await sources();
    expect(sitemapChildEntries("en", "editorial", PREVIEW, editorial)).toEqual(
      [],
    );
    const lapsed = await sources([postRecord({ reviewed: false })]);
    expect(sitemapChildEntries("en", "editorial", INDEXING, lapsed)).toEqual(
      [],
    );
    for (const locale of ["de", "pl"]) {
      expect(
        sitemapChildEntries(locale, "editorial", INDEXING, editorial),
      ).toEqual([]);
    }
    const none = await sources([]);
    expect(
      sitemapChildDocument("en", "editorial", INDEXING, none),
    ).toBeUndefined();
    expect(localeSitemapChildren("en", INDEXING, none)).not.toContain(
      `${ORIGIN}/sitemaps/en/editorial.xml`,
    );
    expect(localeSitemapChildren("en", INDEXING)).not.toContain(
      `${ORIGIN}/sitemaps/en/editorial.xml`,
    );
  });

  it("keeps the post id out of every URL it announces", async () => {
    const editorial = await sources();
    const xml =
      sitemapChildDocument("en", "editorial", INDEXING, editorial) ?? "";
    expect(xml).not.toContain(POST_ID);
  });
});
