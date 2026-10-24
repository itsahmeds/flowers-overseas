/**
 * Spec 044's public blog pages (§2.5, §2.7, §2.8, §5.3, §5.4; AC-7 built half, AC-8, AC-12,
 * AC-13, AC-14 template half, AC-22; T-07, T-08 unit half, T-12, T-13 unit half, T-23; TASK-322).
 *
 *  - **The source** (`source.ts`, `manifest.ts`): none unless `BLOG_SOURCE=database`; during the
 *    build the database answer alone; at run time database AND the running build's manifest, with
 *    the manifest asked first so a build that emitted no blog URL never queries the database.
 *  - **The resolver** (`resolveLocalePath`): the index and a post resolve where they exist, and a
 *    draft, `de`/`pl`, a reserved slug, an unknown slug and an upper-case variant are misses.
 *  - **The view model and the templates**: absolute dates, "Updated" only on a later day, the
 *    not-open line, the body's element allow-list, vanished references as text, the end-of-post
 *    corridor link following the first country tag and absent where its guide is.
 *  - **The footer row** and **the cache tags**.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRICE_LITERAL_PATTERN,
  relayMatches,
} from "../../src/config/honesty.ts";
import {
  localeChildParams,
  localeSegmentParams,
  resolveLocalePath,
} from "../../src/modules/catalog/routes.ts";
import { blogTagPaths } from "../../src/modules/content/blog/db/tags.ts";
import {
  EMPTY_MANIFEST,
  manifestOf,
  parsePrerenderManifest,
  resetBuildManifest,
  runningBuildManifest,
} from "../../src/modules/content/blog/manifest.ts";
import type { BlogPostRecord } from "../../src/modules/content/blog/provider.ts";
import {
  NO_BLOG,
  blogSourceFor,
  blogSourceMode,
  manifestGated,
  resetBlogSource,
} from "../../src/modules/content/blog/source.ts";
import { parseBlogTag } from "../../src/modules/content/blog/tags.ts";
import { BlogIndexPage } from "../../src/modules/content/blog/ui/BlogIndexPage.tsx";
import { BlogPostPage } from "../../src/modules/content/blog/ui/BlogPostPage.tsx";
import {
  type BlogPostPageView,
  blogIndexPageView,
  nextCorridorFor,
  postPageView,
} from "../../src/modules/content/blog/view.ts";
import { recordsBlogProvider } from "../../src/modules/content/blog/provider.ts";
import { formatDate, loadMessages } from "../../src/modules/i18n/index.ts";
import { footerView } from "../../src/modules/ui/layout/footerView.ts";
import {
  EMITTED,
  MISSING_POST_ID,
  POST_ID,
  SLUG,
  TARGET_PATHS,
  fakeTargets,
  postRecord,
} from "../fixtures/blog-pages.ts";

const published = vi.hoisted(() => ({ records: [] as unknown[] }));
vi.mock("../../src/modules/content/blog/db/provider.ts", () => ({
  readPublishedPosts: () => Promise.resolve(published.records),
}));

const NAMESPACES = [
  "a11y",
  "blog",
  "breadcrumb",
  "common",
  "destinations",
  "infoPages",
] as const;

function render(node: ReactElement, locale = "en"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

const PL_GUIDE = TARGET_PATHS["corridor/PL"] ?? "";
const DE_GUIDE = "/en/send-flowers-to/germany";
const guides: Readonly<Record<string, string>> = {
  PL: PL_GUIDE,
  DE: DE_GUIDE,
};

async function view(
  record: BlogPostRecord = postRecord(),
  options: {
    readonly datesOpen?: boolean;
    readonly corridorHref?: (iso2: string) => string | undefined;
  } = {},
): Promise<BlogPostPageView> {
  return postPageView(record, record.locale === "en" ? "en" : record.locale, {
    source: recordsBlogProvider([record]),
    targets: fakeTargets,
    datesOpen: options.datesOpen ?? false,
    routeLocales: ["en", "en-gb", "de", "pl"],
    corridorHref: options.corridorHref ?? ((iso2) => guides[iso2]),
  });
}

/** `<time datetime="{iso}">{text}</time>`, whatever case React prints the attribute in. */
function time(iso: string, text: string): RegExp {
  return new RegExp(`<time datetime="${iso}">${text}</time>`, "iu");
}

/** An `<a>` with this href and this text, whatever its classes. */
function link(href: string, text: string): RegExp {
  return new RegExp(`<a [^>]*href="${href}"[^>]*>${text}</a>`, "u");
}

/** The markup inside the post body's wrapper. */
function bodyOf(html: string): string {
  const start = html.indexOf("data-fo-blog-body");
  expect(start, "the body wrapper renders").toBeGreaterThan(-1);
  const open = html.indexOf(">", start) + 1;
  const close = html.indexOf("data-fo-blog-next", open);
  const end = close === -1 ? html.indexOf("</article>", open) : close;
  return html.slice(open, html.lastIndexOf("</div></div>", end));
}

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  published.records = [];
  resetBlogSource();
  resetBuildManifest();
});

describe("the source: none unless asked, database AND the build's manifest (AC-8)", () => {
  const loaders = () => {
    const build = vi.fn(() => Promise.resolve([postRecord()]));
    const runtime = vi.fn(() => Promise.resolve([postRecord()]));
    return { build, runtime };
  };

  it("reads `database` only for the exact value", () => {
    expect(blogSourceMode({ BLOG_SOURCE: "database" })).toBe("database");
    expect(blogSourceMode({ BLOG_SOURCE: " database " })).toBe("database");
    for (const value of [undefined, "", "none", "Database", "db", "true"]) {
      expect(blogSourceMode({ BLOG_SOURCE: value })).toBe("none");
    }
  });

  it("is no blog at all without the key, and never reads a record", async () => {
    const { build, runtime } = loaders();
    const source = blogSourceFor({
      environment: { NEXT_PHASE: "phase-production-build" },
      manifest: () => Promise.resolve(manifestOf(EMITTED)),
      buildRecords: build,
      runtimeRecords: runtime,
    });
    expect(source).toBe(NO_BLOG);
    expect(await source.blogIndexExists("en")).toBe(false);
    expect(await source.blogPostExists("en", SLUG)).toBe(false);
    expect(build).not.toHaveBeenCalled();
    expect(runtime).not.toHaveBeenCalled();
  });

  it("answers from the database alone while the build runs (what it reads is what it emits)", async () => {
    const { build, runtime } = loaders();
    const source = blogSourceFor({
      environment: {
        BLOG_SOURCE: "database",
        NEXT_PHASE: "phase-production-build",
      },
      manifest: () => Promise.resolve(EMPTY_MANIFEST),
      buildRecords: build,
      runtimeRecords: runtime,
    });
    expect(await source.blogPostExists("en", SLUG)).toBe(true);
    expect(await source.blogPostExists("en-gb", SLUG)).toBe(true);
    expect(await source.blogStaticParams()).toEqual([
      { locale: "en", slug: SLUG },
      { locale: "en-gb", slug: SLUG },
    ]);
    expect(runtime).not.toHaveBeenCalled();
  });

  it("at run time, a post the build did not emit is absent everywhere until the next build", async () => {
    const { build, runtime } = loaders();
    // The build emitted the `en` pair only.
    const manifest = manifestOf(["/en/blog", `/en/blog/${SLUG}`]);
    const source = blogSourceFor({
      environment: { BLOG_SOURCE: "database" },
      manifest: () => Promise.resolve(manifest),
      buildRecords: build,
      runtimeRecords: runtime,
    });
    expect(await source.blogPostExists("en", SLUG)).toBe(true);
    expect(await source.blogPostExists("en-gb", SLUG)).toBe(false);
    expect(await source.blogPostView("en-gb", SLUG)).toBeUndefined();
    expect(await source.blogIndexExists("en")).toBe(true);
    expect(await source.blogIndexExists("en-gb")).toBe(false);
    expect(await source.blogIndexView("en-gb")).toEqual([]);
    expect(await source.editorialSitemapEntries("en-gb")).toEqual([]);
    expect(await source.postPath(POST_ID, "en")).toBe(`/en/blog/${SLUG}`);
    expect(await source.postPath(POST_ID, "en-gb")).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });

  it("an index whose posts were all unpublished leaves at once (the database half)", async () => {
    const source = manifestGated(recordsBlogProvider([]), manifestOf(EMITTED));
    expect(await source.blogPostExists("en", SLUG)).toBe(false);
    expect(await source.blogIndexExists("en")).toBe(false);
  });

  it("never queries the database when the build emitted no blog URL", async () => {
    const { build, runtime } = loaders();
    const source = blogSourceFor({
      environment: { BLOG_SOURCE: "database" },
      manifest: () => Promise.resolve(EMPTY_MANIFEST),
      buildRecords: build,
      runtimeRecords: runtime,
    });
    expect(await source.blogIndexExists("en")).toBe(false);
    expect(await source.blogPostExists("en", SLUG)).toBe(false);
    expect(await source.postPath(POST_ID, "en")).toBeNull();
    expect(await source.editorialSitemapEntries("en")).toEqual([]);
    expect(runtime).not.toHaveBeenCalled();
  });

  it("reads Next's prerender manifest, and anything else is the empty set", () => {
    const parsed = parsePrerenderManifest(
      JSON.stringify({
        version: 4,
        routes: { "/en/blog": {}, [`/en/blog/${SLUG}`]: {} },
      }),
    );
    expect(parsed.has("/en/blog")).toBe(true);
    expect(parsed.has(`/en/blog/${SLUG}`)).toBe(true);
    expect(parsed.has("/en-gb/blog")).toBe(false);
    for (const text of ["", "{", "[]", '{"routes":[]}', '{"version":4}']) {
      expect(parsePrerenderManifest(text).has("/en/blog")).toBe(false);
    }
  });

  it("reads the running build's file once, and a missing file is the empty set", async () => {
    const empty = mkdtempSync(join(tmpdir(), "fo-blog-manifest-"));
    expect((await runningBuildManifest(empty)).has("/en/blog")).toBe(false);
    resetBuildManifest();
    const built = mkdtempSync(join(tmpdir(), "fo-blog-manifest-"));
    writeFileSync(
      join(built, "prerender-manifest.json"),
      JSON.stringify({ routes: { "/en/blog": {} } }),
    );
    expect((await runningBuildManifest(built)).has("/en/blog")).toBe(true);
  });
});

describe("the resolver: one answer per blog path (AC-8, T-08 unit half)", () => {
  beforeEach(() => {
    process.env["BLOG_SOURCE"] = "database";
    process.env["NEXT_PHASE"] = "phase-production-build";
    published.records = [postRecord()];
  });

  it("resolves the index in `en` and `en-gb` and nowhere else", async () => {
    expect(await resolveLocalePath("en", ["blog"])).toEqual({
      kind: "blogIndex",
      locale: "en",
    });
    expect(await resolveLocalePath("en-gb", ["blog"])).toEqual({
      kind: "blogIndex",
      locale: "en-gb",
    });
    for (const locale of ["de", "pl"]) {
      expect((await resolveLocalePath(locale, ["blog"])).kind).toBe("notFound");
    }
  });

  it("resolves a published post and misses a draft, a reserved, an unknown and an upper-case slug", async () => {
    expect(await resolveLocalePath("en", ["blog", SLUG])).toEqual({
      kind: "blogPost",
      locale: "en",
      slug: SLUG,
    });
    expect((await resolveLocalePath("en-gb", ["blog", SLUG])).kind).toBe(
      "blogPost",
    );
    for (const slug of [
      "seed-fixture-draft",
      "topic",
      "feed",
      "page",
      "authors",
      "rss",
      "no-such-post",
      SLUG.toUpperCase(),
      "Choosing-flowers-for-a-polish-name-day",
    ]) {
      expect((await resolveLocalePath("en", ["blog", slug])).kind, slug).toBe(
        "notFound",
      );
    }
    for (const locale of ["de", "pl"]) {
      expect((await resolveLocalePath(locale, ["blog", SLUG])).kind).toBe(
        "notFound",
      );
    }
  });

  it("emits exactly those URLs for the build", async () => {
    const segments = (await localeSegmentParams()).filter(
      (param) => param.segment === "blog",
    );
    expect(segments).toEqual([
      { locale: "en", segment: "blog" },
      { locale: "en-gb", segment: "blog" },
    ]);
    const children = (await localeChildParams()).filter(
      (param) => param.segment === "blog",
    );
    expect(children).toEqual([
      { locale: "en", segment: "blog", child: SLUG },
      { locale: "en-gb", segment: "blog", child: SLUG },
    ]);
  });

  it("has no blog URL at all with the source off", async () => {
    delete process.env["BLOG_SOURCE"];
    expect((await resolveLocalePath("en", ["blog"])).kind).toBe("notFound");
    expect((await resolveLocalePath("en", ["blog", SLUG])).kind).toBe(
      "notFound",
    );
    expect(
      (await localeSegmentParams()).some((param) => param.segment === "blog"),
    ).toBe(false);
  });
});

describe("the post view (AC-12, AC-22)", () => {
  it("prints absolute dates, and Updated only on a later day", async () => {
    const sameDay = await view();
    expect(sameDay.published).toEqual({
      iso: "2026-10-21",
      text: "21 October 2026",
    });
    expect(sameDay.updated).toBeUndefined();
    const later = await view(
      postRecord({ revisionPublishedAt: "2026-10-23T08:00:00.000Z" }),
    );
    expect(later.updated).toEqual({
      iso: "2026-10-23",
      text: "23 October 2026",
    });
  });

  it("shows the not-open line exactly while no destination takes a date", async () => {
    expect((await view(postRecord(), { datesOpen: false })).notYetOpen).toBe(
      true,
    );
    expect((await view(postRecord(), { datesOpen: true })).notYetOpen).toBe(
      false,
    );
  });

  it("links the first country tag's guide, follows a reorder, and is absent with that guide (T-23)", async () => {
    expect((await view()).nextCorridor).toEqual({
      iso2: "PL",
      href: PL_GUIDE,
      countryNameKey: "destinations.pl.name",
    });
    expect(
      (await view(postRecord({ countries: ["DE", "PL"] }))).nextCorridor?.href,
    ).toBe(DE_GUIDE);
    // The first tag's guide is absent: no link, and no fall-through to the second tag.
    const absent = await view(postRecord(), {
      corridorHref: (iso2) => (iso2 === "PL" ? undefined : guides[iso2]),
    });
    expect(absent.nextCorridor).toBeUndefined();
    expect(nextCorridorFor([], "en", () => PL_GUIDE)).toBeUndefined();
  });

  it("resolves references in the page's locale and renders a vanished one as text", async () => {
    const blocks = (await view()).blocks;
    const inlines = blocks.flatMap((block) =>
      "items" in block ? block.items.flat() : [...block.inlines],
    );
    const links = inlines.filter((inline) => inline.kind === "link");
    expect(
      links.map((link) => link.kind === "link" && link.href).sort(),
    ).toEqual([PL_GUIDE, TARGET_PATHS["occasion-hub/name_day"]].sort());
    const vanished = inlines.find(
      (inline) =>
        inline.kind === "text" &&
        inline.text.includes("our older name day note"),
    );
    expect(vanished?.kind).toBe("text");
    expect(JSON.stringify(blocks)).not.toContain(MISSING_POST_ID);
  });

  it("lists the post's own locales only: `en` and `en-gb`, never `de` or `pl`", async () => {
    expect((await view()).alternatePaths).toEqual({
      en: `/en/blog/${SLUG}`,
      "en-gb": `/en-gb/blog/${SLUG}`,
    });
  });
});

describe("the post template (AC-7, AC-11 visible half, AC-12, AC-14, AC-22)", () => {
  it("has one h1, the byline, the dates in <time> and no Updated on the same day", async () => {
    const html = render(<BlogPostPage view={await view()} />);
    expect(html.match(/<h1[\s>]/gu)).toHaveLength(1);
    expect(html).toMatch(
      /<h1[^>]*>Choosing flowers for a Polish name day<\/h1>/u,
    );
    expect(html).toContain("By Sample Author");
    expect(html).toMatch(
      new RegExp(
        `Published ${time("2026-10-21", "21 October 2026").source}`,
        "iu",
      ),
    );
    expect(html).not.toContain("data-fo-blog-updated");
    expect(html).not.toContain("Updated");
  });

  it("prints Updated with its own <time> when the served revision is from a later day", async () => {
    const html = render(
      <BlogPostPage
        view={await view(
          postRecord({ revisionPublishedAt: "2026-10-23T08:00:00.000Z" }),
        )}
      />,
    );
    expect(html).toMatch(
      new RegExp(
        `Updated ${time("2026-10-23", "23 October 2026").source}`,
        "iu",
      ),
    );
  });

  it("renders spec 041's not-open line under the h1 only while no date is open (T-12)", async () => {
    const notOpen = loadMessages("en", ["infoPages"]) as {
      infoPages: { status: { notYetOpen: string } };
    };
    const closed = render(<BlogPostPage view={await view()} />);
    expect(closed).toContain("data-fo-not-yet-open");
    expect(closed).toContain(notOpen.infoPages.status.notYetOpen);
    const open = render(
      <BlogPostPage view={await view(postRecord(), { datesOpen: true })} />,
    );
    expect(open).not.toContain("data-fo-not-yet-open");
    expect(open).not.toContain(notOpen.infoPages.status.notYetOpen);
  });

  it("holds only the subset's elements inside the body, and markup as literal text (T-07)", async () => {
    const html = render(<BlogPostPage view={await view()} />);
    const body = bodyOf(html);
    const tags = new Set(
      [...body.matchAll(/<([a-z0-9]+)[\s>]/gu)].map((match) => match[1]),
    );
    // Every element the subset maps to, and nothing else.
    expect([...tags].sort()).toEqual(
      ["a", "em", "h2", "h3", "li", "ol", "p", "strong", "ul"].sort(),
    );
    expect(body).not.toMatch(/<script|<img|<table|<td/u);
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).toContain("![a picture](https://example.com/a.png)");
    expect(body).toContain("| a | b |");
    const hrefs = [...body.matchAll(/<a [^>]*href="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(Object.values(TARGET_PATHS)).toContain(href);
    }
    expect(body).toContain("our older name day note");
  });

  it("ends with exactly one guide link to the first tag's corridor, and nothing where it is absent (T-23)", async () => {
    const html = render(<BlogPostPage view={await view()} />);
    const next = [...html.matchAll(/data-fo-blog-next="([A-Z]{2})"/gu)];
    expect(next.map((match) => match[1])).toEqual(["PL"]);
    expect(html).toMatch(
      link(PL_GUIDE, "Read our guide to sending flowers to Poland"),
    );
    const absent = render(
      <BlogPostPage
        view={await view(postRecord(), { corridorHref: () => undefined })}
      />,
    );
    expect(absent).not.toContain("data-fo-blog-next");
    expect(absent).not.toContain("Read our guide");
  });

  it("carries no script, price, relative date or relay wording (AC-12, AC-14)", async () => {
    const html = render(<BlogPostPage view={await view()} />);
    expect(html.replace(/&lt;script&gt;/gu, "")).not.toContain("<script");
    const text = html.replace(/<[^>]+>/gu, " ");
    expect(text).not.toMatch(PRICE_LITERAL_PATTERN);
    expect(text).not.toMatch(/\b(?:ago|yesterday|today|tomorrow)\b/iu);
    expect(relayMatches(text, "en")).toEqual([]);
  });
});

describe("the index (AC-8, AC-14)", () => {
  it("lists the posts newest first with one link each and no image without a cover", async () => {
    const older = postRecord({
      postId: "66666666-6666-4666-8666-666666666666",
      slug: "an-older-post",
      title: "An older post",
      firstPublishedAt: "2026-10-01T09:00:00.000Z",
    });
    const index = await blogIndexPageView(
      "en",
      ["en", "en-gb", "de", "pl"],
      recordsBlogProvider([older, postRecord()]),
    );
    expect(index?.entries.map((entry) => entry.slug)).toEqual([
      SLUG,
      "an-older-post",
    ]);
    const html = render(
      <BlogIndexPage view={index as NonNullable<typeof index>} />,
    );
    expect(html.match(/<h1[\s>]/gu)).toHaveLength(1);
    expect(html).toContain("The Flowers Overseas blog");
    expect(html).toMatch(
      link(`/en/blog/${SLUG}`, "Choosing flowers for a Polish name day"),
    );
    expect(html).toMatch(time("2026-10-21", "21 October 2026"));
    expect(html.match(/<article/gu)).toHaveLength(2);
    expect(html).not.toMatch(/<img|<picture/u);
    expect(html).not.toContain("<script");
  });

  it("does not exist with no post in the locale", async () => {
    expect(
      await blogIndexPageView("en", ["en"], recordsBlogProvider([])),
    ).toBeUndefined();
    expect(
      await blogIndexPageView(
        "de",
        ["de"],
        recordsBlogProvider([postRecord()]),
      ),
    ).toBeUndefined();
  });
});

describe("the footer row (AC-13 unit half)", () => {
  const blogLink = (locale: string, unavailable: readonly string[]) =>
    footerView(locale, { unavailable })
      .columns.flatMap((column) => column.links)
      .find((link) => link.id === "blog");

  it("links the index where it exists and draws nothing where it does not", () => {
    expect(blogLink("en", [])).toMatchObject({
      labelKey: "footer.link.blog",
      href: "/en/blog",
    });
    expect(blogLink("en-gb", [])?.href).toBe("/en-gb/blog");
    const missing = blogLink("de", ["blog"]);
    expect(missing).toBeDefined();
    expect(
      missing && "href" in missing ? missing.href : undefined,
    ).toBeUndefined();
  });

  it("is last in Company", () => {
    const company = footerView("en", {}).columns.find(
      (column) => column.id === "company",
    );
    expect(company?.links.at(-1)?.id).toBe("blog");
  });
});

describe("the cache tags (§5.4)", () => {
  it("parses only the blog's two tag shapes", () => {
    expect(parseBlogTag(`blog:post:${POST_ID}`)).toEqual({
      kind: "post",
      postId: POST_ID,
    });
    expect(parseBlogTag("blog:en")).toEqual({ kind: "locale", locale: "en" });
    for (const tag of [
      "sitemap",
      "blog:",
      "blog:post:x",
      "catalog:PL",
      "blog:EN",
    ]) {
      expect(parseBlogTag(tag), tag).toBeUndefined();
    }
  });

  it("resolves a post tag to its URLs in both English locales, whatever its status", async () => {
    const reader = vi.fn(() =>
      Promise.resolve([{ locale_code: "en", slug: SLUG }]),
    );
    expect(await blogTagPaths(`blog:post:${POST_ID}`, reader)).toEqual([
      `/en/blog/${SLUG}`,
      `/en-gb/blog/${SLUG}`,
    ]);
    expect(await blogTagPaths("blog:en", reader)).toEqual([
      "/en/blog",
      "/en-gb/blog",
      `/en/blog/${SLUG}`,
      `/en-gb/blog/${SLUG}`,
    ]);
    expect(await blogTagPaths("sitemap", reader)).toEqual([]);
  });
});

describe("format.ts `longDate` (§2.7)", () => {
  it("is day, month name and year with no weekday in every launch locale", () => {
    const day = new Date("2026-10-21T12:00:00Z");
    expect(formatDate(day, "en", "longDate", "UTC")).toBe("21 October 2026");
    expect(formatDate(day, "en-gb", "longDate", "UTC")).toBe("21 October 2026");
    expect(formatDate(day, "de", "longDate", "UTC")).toBe("21. Oktober 2026");
    expect(formatDate(day, "pl", "longDate", "UTC")).toBe(
      "21 października 2026",
    );
  });
});
