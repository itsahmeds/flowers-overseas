/**
 * Spec 041's `seo:validate` fixtures, generated from the built set (spec 041 §2 "Rendering, budget
 * and gates": "`seo:validate` gains fixtures generated from the built set"; AC-19, AC-18, T-19;
 * TASK-184).
 *
 * Two families of committed fixtures, each compared on every run with what the route's own
 * functions emit today, so the document CI validates is the page's own bytes and never a
 * hand-written idea of it (the precedent of `./seo-schema-fixtures.test.ts`):
 *
 *  - `tests/fixtures/seo/schema/info-pages-{locale}.json`: every info page's JSON-LD in the four
 *    launch locales, as `infoPageJsonLd()` builds it for the route, with the breadcrumb's labels
 *    resolved by that locale's own catalogue. `validate-schema` then rejects a `LocalBusiness`, a
 *    `Product`, an `Offer` or any other type the allow-list refuses (AC-19).
 *  - `tests/fixtures/seo/hreflang/info-page-clusters.json`: every info page's hreflang cluster in
 *    the indexing deployment, as `infoPageMetadata()` writes it into the `<head>`. Only the English
 *    pages carry one; the de/pl drafts carry none while they are unreviewed (AC-18), which this
 *    file asserts beside the generation. `validate-hreflang` then checks reciprocity and the
 *    `x-default`.
 *
 * `WRITE_SEO_FIXTURES=1 pnpm vitest run tests/contract/info-pages-seo-fixtures.test.ts` rewrites
 * them. Without the variable this suite only compares, which is what CI does.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { DEFAULT_DIR as SCHEMA_DIR } from "../../scripts/seo/validate-schema.ts";
import { DEFAULT_DIR as HREFLANG_DIR } from "../../scripts/seo/validate-hreflang.ts";
import { INFO_PAGE_IDS } from "../../src/config/info-pages.ts";
import { listInfoPages } from "../../src/modules/content/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type BreadcrumbLabel,
  type DeploymentDescriptor,
  infoPageJsonLd,
  infoPageMetadata,
  jsonLdDocument,
} from "../../src/modules/seo/index.ts";
import { runSeoCli } from "../unit/support/seo-cli.ts";

const repoRoot = resolve(__dirname, "../..");
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
};

/** The route's label: the locale's own translator, as `getTranslations()` hands it over. */
function labelFor(locale: string): BreadcrumbLabel {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, ["common", "breadcrumb"]),
  }) as unknown as BreadcrumbLabel;
  return (key, values) => t(key, values);
}

/** The pages that exist in a locale, in registry order. */
function pagesIn(locale: string): readonly (typeof INFO_PAGE_IDS)[number][] {
  return listInfoPages()
    .filter((page) => page.locale === locale)
    .map((page) => page.pageId);
}

function schemaDocument(locale: string): Record<string, unknown>[] {
  const label = labelFor(locale);
  return pagesIn(locale).flatMap((pageId) => {
    const document = jsonLdDocument(
      infoPageJsonLd(pageId, locale, INDEXING, label),
    );
    if (document === undefined)
      throw new Error(`${locale}/${pageId}: no JSON-LD`);
    return [document];
  });
}

interface Cluster {
  readonly url: string;
  readonly alternates: readonly { hreflang: string; href: string }[];
}

function clusters(): readonly Cluster[] {
  return LOCALES.flatMap((locale) =>
    pagesIn(locale).flatMap((pageId) => {
      const metadata = infoPageMetadata(pageId, locale, INDEXING);
      const canonical = metadata?.alternates?.canonical;
      const languages = metadata?.alternates?.languages as
        Readonly<Record<string, string>> | undefined;
      if (typeof canonical !== "string" || languages === undefined) return [];
      return [
        {
          url: canonical,
          alternates: Object.entries(languages).map(([hreflang, href]) => ({
            hreflang,
            href,
          })),
        },
      ];
    }),
  );
}

const SCHEMA_FIXTURES = Object.fromEntries(
  LOCALES.map((locale) => [
    `info-pages-${locale}.json`,
    schemaDocument(locale),
  ]),
);
const HREFLANG_FILE = "info-page-clusters.json";
const HREFLANG_FIXTURE = { pages: clusters() };

if (process.env["WRITE_SEO_FIXTURES"] === "1") {
  for (const [file, document] of Object.entries(SCHEMA_FIXTURES)) {
    writeFileSync(
      join(repoRoot, SCHEMA_DIR, file),
      `${JSON.stringify({ jsonld: document }, null, 2)}\n`,
    );
  }
  writeFileSync(
    join(repoRoot, HREFLANG_DIR, HREFLANG_FILE),
    `${JSON.stringify(HREFLANG_FIXTURE, null, 2)}\n`,
  );
}

function committed(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, dir, file), "utf8"));
}

describe("the info pages' schema fixtures are their own documents (AC-19, T-19)", () => {
  for (const [file, document] of Object.entries(SCHEMA_FIXTURES)) {
    it(`${file} equals what the route emits today`, () => {
      expect(
        (committed(SCHEMA_DIR, file) as { jsonld: unknown }).jsonld,
        `${file} is stale: regenerate it with WRITE_SEO_FIXTURES=1`,
      ).toStrictEqual(document);
    });
  }

  it("covers the seven pages that exist in every launch locale, de and pl drafts included", () => {
    for (const locale of LOCALES) {
      expect(SCHEMA_FIXTURES[`info-pages-${locale}.json`], locale).toHaveLength(
        7,
      );
    }
    // The de help page's FAQPage is the German draft's questions, not the English ones.
    expect(JSON.stringify(SCHEMA_FIXTURES["info-pages-de.json"])).toContain(
      "Kann ich jetzt bestellen?",
    );
  });

  it("passes `validate-schema` with the four new files in its directory", () => {
    const result = runSeoCli("validate-schema.ts", join(repoRoot, SCHEMA_DIR));
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("the info pages' hreflang fixture (AC-18)", () => {
  it(`${HREFLANG_FILE} equals what the <head> emits today`, () => {
    expect(
      committed(HREFLANG_DIR, HREFLANG_FILE),
      `${HREFLANG_FILE} is stale: regenerate it with WRITE_SEO_FIXTURES=1`,
    ).toStrictEqual(HREFLANG_FIXTURE);
  });

  it("holds the fourteen English pages and no de or pl URL anywhere", () => {
    expect(HREFLANG_FIXTURE.pages).toHaveLength(14);
    const text = JSON.stringify(HREFLANG_FIXTURE);
    expect(text).not.toMatch(/flowersoverseas\.com\/(?:de|pl)\//u);
  });

  it("passes `validate-hreflang` (reciprocity, x-default) with the new file in its directory", () => {
    const result = runSeoCli(
      "validate-hreflang.ts",
      join(repoRoot, HREFLANG_DIR),
    );
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
