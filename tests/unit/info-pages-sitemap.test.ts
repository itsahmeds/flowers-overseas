/**
 * T-20 / AC-20, the positive half (spec 041; TASK-182; `/review 270` required change 1, `/break
 * 270` hole 5): a reviewed trust page in an indexing deployment gets its `static.xml` row, with
 * `lastmod` equal to the file's `updatedAt` and the page's own hreflang cluster; an unreviewed
 * page beside it gets none. Every committed trust page is `reviewed: false`, so the generated
 * corpus is swapped for a copy in which only `help` (en, and en-gb by `extends`) is reviewed.
 */
import { describe, expect, it, vi } from "vitest";

import type { DeploymentDescriptor } from "../../src/modules/seo/index.ts";

const REVIEWED_UPDATED_AT = "2026-10-11";

vi.mock(
  "../../src/modules/content/corpus.generated.ts",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../src/modules/content/corpus.generated.ts")
      >();
    return {
      INFO_CONTENT_FILES: original.INFO_CONTENT_FILES.map((file) =>
        file.path === "pages/en/help.md"
          ? {
              ...file,
              source: file.source
                .replace(
                  "reviewed: false",
                  'reviewed: true\nreviewedBy: "founder"\nreviewedAt: "2026-10-11"',
                )
                .replace(
                  /^updatedAt: .*$/mu,
                  `updatedAt: "${REVIEWED_UPDATED_AT}"`,
                ),
            }
          : file,
      ),
    };
  },
);

const { staticSitemapEntries } =
  await import("../../src/modules/seo/sitemap/statics.ts");
const { INDEX_FOLLOW, NOINDEX_FOLLOW, infoPageMetadata } =
  await import("../../src/modules/seo/index.ts");

const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
};

describe("T-20 / AC-20: a reviewed trust page is announced", () => {
  it("announces /en/help with lastmod = updatedAt and the exact English cluster", () => {
    const rows = staticSitemapEntries("en", INDEXING).filter((row) =>
      row.loc.includes("/help"),
    );
    expect(rows).toEqual([
      {
        loc: "https://flowersoverseas.com/en/help",
        lastmod: REVIEWED_UPDATED_AT,
        alternates: [
          { hreflang: "en", href: "https://flowersoverseas.com/en/help" },
          { hreflang: "en-IE", href: "https://flowersoverseas.com/en/help" },
          { hreflang: "en-NL", href: "https://flowersoverseas.com/en/help" },
          { hreflang: "en-GB", href: "https://flowersoverseas.com/en-gb/help" },
          {
            hreflang: "x-default",
            href: "https://flowersoverseas.com/en/help",
          },
        ],
      },
    ]);
  });

  it("announces /en-gb/help, which extends en, and no unreviewed trust page", () => {
    const locs = ["en", "en-gb"].flatMap((locale) =>
      staticSitemapEntries(locale, INDEXING).map((row) => row.loc),
    );
    // The florists family (spec 011, TASK-210) follows its own rule in `florists-seo.test.ts`.
    expect(
      locs.filter(
        (loc) =>
          !loc.includes("send-flowers-to") && !loc.includes("/for-florists"),
      ),
    ).toEqual([
      "https://flowersoverseas.com/en/help",
      "https://flowersoverseas.com/en-gb/help",
    ]);
  });

  it("serves the reviewed page index,follow and its unreviewed neighbour noindex (AC-17, AC-18)", () => {
    expect(infoPageMetadata("help", "en", INDEXING)?.robots).toEqual(
      INDEX_FOLLOW,
    );
    expect(infoPageMetadata("guarantee", "en", INDEXING)?.robots).toEqual(
      NOINDEX_FOLLOW,
    );
  });
});
