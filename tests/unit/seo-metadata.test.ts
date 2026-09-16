/**
 * Page-metadata helpers (spec 007 §6, AC-9 / AC-10; TASK-090, composed by TASK-091/092).
 *
 * The property AC-10 turns on: **a `noindex` page emits its canonical unchanged**. So the helper
 * is asserted to produce the same `alternates.canonical` for both directives, and to have no way
 * of dropping it — which is also the reconciliation with spec 004 AC-16 recorded on the brief
 * (004 emits no canonical because spec 007 owns the tag, not because `noindex` forbids one).
 */
import { describe, expect, it } from "vitest";

import {
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  hreflangLanguages,
  pageMetadata,
  robotsMeta,
} from "../../src/modules/seo/index.ts";

const CANONICAL = "https://flowersoverseas.com/en-gb/send-flowers-to/poland";

const base = {
  title: "Send flowers to Poland",
  description: "A local Polish florist makes and delivers your bouquet.",
  canonical: CANONICAL,
} as const;

describe("robotsMeta() (AC-9)", () => {
  it("is the directive string, so the rendered meta is the engine's own literal", () => {
    expect(robotsMeta(INDEX_FOLLOW)).toBe("index,follow");
    expect(robotsMeta(NOINDEX_FOLLOW)).toBe("noindex,follow");
  });
});

describe("pageMetadata() (AC-10)", () => {
  it("emits the self-referencing canonical on an indexable page", () => {
    expect(pageMetadata({ ...base, directive: INDEX_FOLLOW })).toEqual({
      title: base.title,
      description: base.description,
      robots: "index,follow",
      alternates: { canonical: CANONICAL },
    });
  });

  it("emits the same canonical, unchanged, on a `noindex` page", () => {
    const indexed = pageMetadata({ ...base, directive: INDEX_FOLLOW });
    const noindexed = pageMetadata({ ...base, directive: NOINDEX_FOLLOW });
    expect(noindexed.alternates?.canonical).toBe(indexed.alternates?.canonical);
    expect(noindexed.robots).toBe("noindex,follow");
  });

  it("adds `languages` only when a cluster is passed (AC-11 is not this task's)", () => {
    expect(
      pageMetadata({ ...base, directive: INDEX_FOLLOW }).alternates,
    ).not.toHaveProperty("languages");

    const cluster = [
      { hreflang: "en", href: "https://flowersoverseas.com/en" },
      { hreflang: "en-GB", href: "https://flowersoverseas.com/en-gb" },
      { hreflang: "x-default", href: "https://flowersoverseas.com/en" },
    ];
    expect(
      pageMetadata({ ...base, directive: INDEX_FOLLOW, alternates: cluster })
        .alternates?.languages,
    ).toEqual({
      en: "https://flowersoverseas.com/en",
      "en-GB": "https://flowersoverseas.com/en-gb",
      "x-default": "https://flowersoverseas.com/en",
    });
  });

  it("preserves every entry of the cluster it is given", () => {
    const cluster = [
      { hreflang: "en", href: "https://flowersoverseas.com/en" },
      { hreflang: "de-AT", href: "https://flowersoverseas.com/de" },
      { hreflang: "de-DE", href: "https://flowersoverseas.com/de" },
    ];
    expect(Object.keys(hreflangLanguages(cluster))).toEqual([
      "en",
      "de-AT",
      "de-DE",
    ]);
  });

  it("trims, and refuses an empty title or description (WCAG 2.4.2)", () => {
    expect(
      pageMetadata({ ...base, title: "  Poland  ", directive: INDEX_FOLLOW })
        .title,
    ).toBe("Poland");
    for (const blank of ["", "   "]) {
      expect(() =>
        pageMetadata({ ...base, title: blank, directive: INDEX_FOLLOW }),
      ).toThrow(TypeError);
      expect(() =>
        pageMetadata({ ...base, description: blank, directive: INDEX_FOLLOW }),
      ).toThrow(TypeError);
    }
  });

  it("does not truncate: the authoring limits are `corridor:check`'s (AC-2)", () => {
    const long = "x".repeat(SEO_TITLE_MAX_LENGTH + 40);
    const longer = "y".repeat(SEO_DESCRIPTION_MAX_LENGTH + 40);
    const metadata = pageMetadata({
      ...base,
      title: long,
      description: longer,
      directive: INDEX_FOLLOW,
    });
    expect(metadata.title).toBe(long);
    expect(metadata.description).toBe(longer);
  });
});
