/**
 * T-14 / AC-14 (TASK-039): `alternatesFor()`, the one hreflang generator `plan/02` §8 mandates.
 *
 * The properties asserted here are the ones spec 007 will inherit rather than re-derive:
 * reciprocity and completeness **by construction**, `x-default → /en`, the regional aliases that
 * share a URL, absolute `https://` hrefs, no entry for a non-indexable locale, no pseudo-locale,
 * no `formattingTag` and no `en-150` (the header decision in
 * `src/modules/i18n/alternates.ts`) — plus the round trip through spec 001's `validate-hreflang`
 * CLI over the committed fixtures, which is what makes the `seo-validate` CI job a real gate.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FIXTURE_BASE_URL,
  FIXTURE_DIR,
  generateHreflangFixtures,
} from "../../scripts/seo/generate-hreflang-fixtures.ts";
import { validateHreflangFile } from "../../scripts/seo/validate-hreflang.ts";
import type { LocaleConfig } from "../../src/config/locales.ts";
import { LOCALES } from "../../src/config/locales.ts";
import {
  type HreflangPage,
  alternatesFor,
  emitInHreflang,
} from "../../src/modules/i18n/alternates.ts";
import {
  type MessageSource,
  repoMessageSource,
  withMessageSource,
} from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import { resetReviewCache } from "../../src/modules/i18n/review.ts";
import type { MessageMetaManifest } from "../../src/modules/i18n/schemas.ts";

const BASE = "https://flowersoverseas.com";
const repoRoot = resolve(__dirname, "../..");

/** Every key of `locale`'s shipped manifest, flipped to reviewed — the AC-24 fixture flip. */
function reviewedManifest(locale: string): MessageMetaManifest {
  const shipped = repoMessageSource.meta(locale) ?? {};
  return Object.fromEntries(
    Object.keys(shipped).map((key) => [
      key,
      {
        source: "human" as const,
        reviewed: true,
        reviewedBy: "native reviewer",
        reviewedAt: "2026-09-08T00:00:00Z",
        sourceHash: "c".repeat(64),
      },
    ]),
  );
}

/** A source that answers from the repo but reports `de` and `pl` fully reviewed. */
const allReviewed: MessageSource = {
  catalogue: (locale) => repoMessageSource.catalogue(locale),
  meta: (locale) =>
    locale === "de" || locale === "pl"
      ? reviewedManifest(locale)
      : repoMessageSource.meta(locale),
};

async function withAllLocalesReviewed<T>(body: () => T): Promise<T> {
  resetReviewCache();
  try {
    return await withMessageSource(allReviewed, body);
  } finally {
    resetReviewCache();
  }
}

function hreflangs(page: HreflangPage): string[] {
  return page.alternates.map((alternate) => alternate.hreflang);
}

describe("the shipped cluster: only `en` and `en-gb` are indexable today", () => {
  const pages = alternatesFor({ pageType: "home" }, { baseUrl: BASE });

  it("emits one page per indexable locale and nothing for the unreviewed ones", () => {
    expect(pages.map((page) => page.url)).toEqual([
      `${BASE}/en`,
      `${BASE}/en-gb`,
    ]);
    for (const page of pages) {
      expect(hreflangs(page)).not.toContain("de");
      expect(hreflangs(page)).not.toContain("pl");
      expect(JSON.stringify(page)).not.toContain("/de");
      expect(JSON.stringify(page)).not.toContain("/pl");
    }
  });

  it("lists itself, every other indexable locale, their aliases and `x-default`", () => {
    // `plan/02` §3's "hreflang values served on the same URL" for `/en` and `/en-gb`.
    for (const page of pages) {
      expect(hreflangs(page)).toEqual([
        "en",
        "en-IE",
        "en-NL",
        "en-GB",
        "x-default",
      ]);
    }
  });

  it("points `x-default` at `/en` from every page (`plan/02` §3)", () => {
    for (const page of pages) {
      const xDefault = page.alternates.filter(
        (alternate) => alternate.hreflang === "x-default",
      );
      expect(xDefault).toEqual([{ hreflang: "x-default", href: `${BASE}/en` }]);
    }
  });

  it("is reciprocal and complete by construction", () => {
    const urls = new Set(pages.map((page) => page.url));
    for (const page of pages) {
      // Every alternate target is a page in the cluster…
      for (const alternate of page.alternates) {
        expect(urls.has(alternate.href), alternate.href).toBe(true);
      }
      // …and every page carries the identical list, so no back-link can be missing.
      expect(page.alternates).toEqual(pages[0]?.alternates);
    }
  });

  it("emits absolute https hrefs only", () => {
    for (const page of pages) {
      expect(page.url.startsWith("https://")).toBe(true);
      for (const alternate of page.alternates) {
        expect(new URL(alternate.href).protocol).toBe("https:");
      }
    }
  });

  it("never emits `en-150`, and never a `formattingTag` (TASK-044)", () => {
    const emitted = new Set(pages.flatMap(hreflangs));

    expect(emitted.has("en-150")).toBe(false);
    expect(emitInHreflang("en-150")).toBe(false);
    for (const locale of LOCALES) {
      if (locale.formattingTag === locale.bcp47) continue;
      expect(emitted.has(locale.formattingTag), locale.code).toBe(false);
    }
    // The alias stays configured data (`plan/02` §3); only the emission is filtered.
    expect(
      LOCALES.find((locale) => locale.code === "en")?.hreflangAliases,
    ).toContain("en-150");
  });

  it("normalises the origin and refuses a non-https base URL", () => {
    expect(
      alternatesFor(
        { pageType: "home" },
        { baseUrl: "https://flowersoverseas.com/" },
      )[0]?.url,
    ).toBe(`${BASE}/en`);
    expect(() =>
      alternatesFor({ pageType: "home" }, { baseUrl: "http://localhost:3000" }),
    ).toThrow(/https/);
  });
});

describe("the four-locale cluster once `de` and `pl` are reviewed (AC-14)", () => {
  it("adds both locales and their aliases with no code change", async () => {
    const pages = await withAllLocalesReviewed(() =>
      alternatesFor({ pageType: "home" }, { baseUrl: BASE }),
    );

    expect(pages.map((page) => page.url)).toEqual([
      `${BASE}/en`,
      `${BASE}/en-gb`,
      `${BASE}/de`,
      `${BASE}/pl`,
    ]);
    for (const page of pages) {
      expect(hreflangs(page)).toEqual([
        "en",
        "en-IE",
        "en-NL",
        "en-GB",
        "de",
        "de-DE",
        "de-AT",
        "pl",
        "pl-PL",
        "x-default",
      ]);
      expect(page.alternates).toEqual(pages[0]?.alternates);
    }
  });

  it("uses each locale's own path segment for a localised page type", async () => {
    const pages = await withAllLocalesReviewed(() =>
      alternatesFor(
        { pageType: "destinations", segments: ["poland"] },
        { baseUrl: BASE },
      ),
    );

    expect(pages.map((page) => page.url)).toEqual([
      `${BASE}/en/send-flowers-to/poland`,
      `${BASE}/en-gb/send-flowers-to/poland`,
      `${BASE}/de/blumen-verschicken/poland`,
      `${BASE}/pl/wyslij-kwiaty/poland`,
    ]);
    // A German slug on a Polish URL is unexpressible: the segment comes from the locale (§6).
    expect(JSON.stringify(pages)).not.toContain("/pl/blumen-verschicken");
  });
});

describe("what cannot appear in the output", () => {
  const pseudo: LocaleConfig = {
    ...(LOCALES.find((locale) => locale.code === "en") as LocaleConfig),
    code: "ar-xb",
    bcp47: "ar-XB",
    formattingTag: "ar-XB",
    name: "Pseudo Arabic",
    nativeName: "Pseudo Arabic",
    dir: "rtl",
    isLaunch: false,
    fallbackCode: "en",
    hreflangAliases: ["ar-XB"],
  };

  it("has no room for a pseudo-locale: it is not a launch locale (AC-29)", async () => {
    resetReviewCache();
    const pages = await withLocaleRegistry(
      localeRegistryOf([...staticLocaleRegistry.list(), pseudo]),
      () => alternatesFor({ pageType: "home" }, { baseUrl: BASE }),
    );
    resetReviewCache();

    expect(JSON.stringify(pages)).not.toContain("ar-XB");
    expect(JSON.stringify(pages)).not.toContain("/ar-xb");
  });

  it("emits nothing at all when the x-default locale is not indexable", async () => {
    // The documented decision: no cluster rather than a cluster with no `x-default`, which
    // `plan/02` §8 and our own validator reject. Unreachable while `en` is the authored source.
    const enUnreviewed: MessageSource = {
      catalogue: (locale) => repoMessageSource.catalogue(locale),
      meta: (locale) => (locale === "en" ? {} : repoMessageSource.meta(locale)),
    };
    resetReviewCache();
    const pages = await withMessageSource(enUnreviewed, () =>
      alternatesFor({ pageType: "home" }, { baseUrl: BASE }),
    );
    resetReviewCache();

    expect(pages).toEqual([]);
  });

  it("omits a locale that has no translated page (`pathByLocale`)", () => {
    const pages = alternatesFor(
      { pathByLocale: { en: "/en/blog/a-post" } },
      { baseUrl: BASE },
    );

    expect(pages.map((page) => page.url)).toEqual([`${BASE}/en/blog/a-post`]);
    expect(hreflangs(pages[0] as HreflangPage)).toEqual([
      "en",
      "en-IE",
      "en-NL",
      "x-default",
    ]);
  });
});

describe("the committed fixtures (T-14, spec 001's `validate-hreflang`)", () => {
  const generated = generateHreflangFixtures();

  it("were generated from `alternatesFor()` and regenerate byte-identically", () => {
    expect(generated.length).toBeGreaterThan(0);
    for (const { file, contents } of generated) {
      const committed = readFileSync(join(repoRoot, FIXTURE_DIR, file), "utf8");
      expect(committed, file).toBe(contents);
    }
  });

  it("passes the CLI's shape, reciprocity and x-default checks", () => {
    for (const { file } of generated) {
      const problems = validateHreflangFile(
        join(repoRoot, FIXTURE_DIR, file),
        file,
      );
      expect(problems, file).toEqual([]);
    }
  });

  it("uses the production origin, not whatever env ran the script", () => {
    expect(FIXTURE_BASE_URL).toBe(BASE);
  });
});
