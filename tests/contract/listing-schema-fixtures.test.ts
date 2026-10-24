/**
 * The listing pages' schema contract: what the six listing types publish, validated by spec 001's
 * CLI (spec 008 §2 "Schema", **AC-17**, **AC-18**; T-17 and T-18 contract halves; TASK-115).
 *
 * AC-18 ends with "`pnpm seo:validate` (schema) passes on fixtures for all six page types". As in
 * `seo-schema-fixtures.test.ts` (TASK-093), a hand-typed fixture would prove only that the
 * validator runs; what has to be proven is that **the document the route serves** passes it. So
 * the fixtures under `tests/fixtures/seo/schema/listing-*.json` are compared on every run with what
 * `listingJsonLd()` builds from the real `listingView()` today: a builder or view change that is not
 * reflected in the committed fixture fails here, and the fixture the CI validator reads is always
 * the page's own document.
 *
 * Eight fixtures: page 1 of each of the six types, plus T-17's **paginated** (page 2 of a country
 * category over twelve products) and **sorted** (the shop root by price, ascending) documents. The
 * window start and the clock are fixed, so the occasions index's dated group and the price order
 * of the sorted fixture do not move with the day.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIR,
  collectTypedNodes,
  typeProblem,
} from "../../scripts/seo/validate-schema.ts";
import { isPublished } from "../../src/config/site-links";
import {
  type ListingView,
  listingJsonLd,
  listingPages,
  listingView,
} from "../../src/modules/catalog/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type BreadcrumbLabel,
  jsonLdDocument,
} from "../../src/modules/seo/index.ts";
import { runSeoCli } from "../unit/support/seo-cli.ts";
import { LISTING_FORBIDDEN_TYPES } from "../support/listing-jsonld-scan.ts";

const repoRoot = resolve(__dirname, "../..");
const BASE = { baseUrl: "https://flowersoverseas.com" } as const;
const FROM = "2026-09-15";
const NOW = new Date(`${FROM}T09:00:00Z`);

const NAMESPACES = [
  "shop",
  "categoryHub",
  "occasionHub",
  "occasionsIndex",
  "breadcrumb",
  "common",
  "occasions",
  "destinations",
] as const;

function labelFor(locale: string): BreadcrumbLabel {
  const t = createTranslator({
    locale,
    messages: loadMessages(locale, [...NAMESPACES]),
  });
  return (key, values) => (t as unknown as BreadcrumbLabel)(key, values);
}

async function documentFor(
  identity: Record<string, string>,
  options: { page?: number; sort?: "price-asc" } = {},
): Promise<Record<string, unknown>> {
  const view: ListingView | undefined = await listingView(identity, {
    from: FROM,
    now: NOW,
    productLinks: isPublished("product"),
    ...options,
  });
  if (view === undefined) {
    throw new Error(`no listing for ${JSON.stringify(identity)}`);
  }
  const document = jsonLdDocument(
    listingJsonLd(view, labelFor(view.locale), BASE),
  );
  if (document === undefined) {
    throw new Error(`${view.path} emitted no JSON-LD`);
  }
  return document;
}

const occasion = (await listingPages("en")).find(
  (page) => page.pageType === "countryOccasion",
);
if (occasion?.countrySlug === undefined || occasion.slug === undefined) {
  throw new Error("the en corpus has a country occasion page");
}

const FIXTURES: Readonly<Record<string, Record<string, unknown>>> = {
  "listing-country-shop-root.json": await documentFor({
    locale: "en",
    pageType: "countryShopRoot",
    country: "poland",
  }),
  "listing-country-shop-root-sorted.json": await documentFor(
    { locale: "en", pageType: "countryShopRoot", country: "poland" },
    { sort: "price-asc" },
  ),
  "listing-country-category.json": await documentFor({
    locale: "en-gb",
    pageType: "countryCategory",
    country: "poland",
    entity: "roses",
  }),
  "listing-country-category-page-2.json": await documentFor(
    {
      locale: "en-gb",
      pageType: "countryCategory",
      country: "poland",
      entity: "roses",
    },
    { page: 2 },
  ),
  "listing-country-occasion.json": await documentFor({
    locale: "en",
    pageType: "countryOccasion",
    country: occasion.countrySlug,
    entity: occasion.slug,
  }),
  "listing-category-hub.json": await documentFor({
    locale: "en",
    pageType: "categoryHub",
    entity: "hand-tied-bouquets",
  }),
  "listing-occasion-hub.json": await documentFor({
    locale: "en",
    pageType: "occasionHub",
    entity: "mothers-day",
  }),
  "listing-occasions-index.json": await documentFor({
    locale: "en",
    pageType: "occasionsIndex",
  }),
};

function committed(file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(repoRoot, DEFAULT_DIR, file), "utf8"),
  ) as Record<string, unknown>;
}

/**
 * `WRITE_SCHEMA_FIXTURES=1 pnpm test:contract` rewrites the files from the builders, the only way
 * they are ever authored. Without the variable this suite only compares, which is what CI does.
 */
if (process.env["WRITE_SCHEMA_FIXTURES"] === "1") {
  for (const [file, document] of Object.entries(FIXTURES)) {
    writeFileSync(
      join(repoRoot, DEFAULT_DIR, file),
      `${JSON.stringify({ jsonld: document }, null, 2)}\n`,
    );
  }
}

describe("the committed listing fixtures are the pages' own documents (AC-17, AC-18)", () => {
  for (const [file, document] of Object.entries(FIXTURES)) {
    it(`${file} equals what listingJsonLd() emits today`, () => {
      expect(
        committed(file)["jsonld"],
        `${file} is stale: regenerate it with \`WRITE_SCHEMA_FIXTURES=1 pnpm test:contract\``,
      ).toStrictEqual(document);
    });
  }

  it("each is a BreadcrumbList and an ItemList and nothing forbidden", () => {
    for (const [file, document] of Object.entries(FIXTURES)) {
      const types = collectTypedNodes(document).flatMap((node) => node.types);
      expect(new Set(types), file).toStrictEqual(
        new Set(["BreadcrumbList", "ItemList", "ListItem"]),
      );
      for (const type of LISTING_FORBIDDEN_TYPES) {
        expect(types, `${file}: ${type}`).not.toContain(type);
      }
      for (const type of types) expect(typeProblem(type), file).toBeNull();
    }
  });

  it("the paginated fixture lists another page's products, the sorted one another order", () => {
    const names = (file: string): readonly unknown[] => {
      const graph = (FIXTURES[file]?.["@graph"] ?? []) as readonly Record<
        string,
        unknown
      >[];
      const list = graph.find((node) => node["@type"] === "ItemList");
      return (
        (list?.["itemListElement"] ?? []) as readonly Record<string, unknown>[]
      ).map((item) => item["name"]);
    };
    const page1 = names("listing-country-category.json");
    const page2 = names("listing-country-category-page-2.json");
    expect(page2.length).toBeGreaterThan(0);
    expect(page2.filter((name) => page1.includes(name))).toStrictEqual([]);
    expect(names("listing-country-shop-root-sorted.json")).not.toStrictEqual(
      names("listing-country-shop-root.json"),
    );
  });
});

describe("`pnpm seo:validate` (schema) over the committed directory (AC-18)", () => {
  it("passes on every fixture, the eight listing ones included", () => {
    const committedFiles = readdirSync(join(repoRoot, DEFAULT_DIR));
    for (const file of Object.keys(FIXTURES)) {
      expect(committedFiles).toContain(file);
    }

    const result = runSeoCli("validate-schema.ts", join(repoRoot, DEFAULT_DIR));

    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fixture(s) ok");
  });
});
