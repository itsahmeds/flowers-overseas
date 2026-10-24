/**
 * **T-17** — the JSON-LD type scan over every rendered page in every locale (spec 007 §2 "Schema",
 * AC-15, AC-16; `plan/02` §9, §15; TASK-093).
 *
 * AC-16 is an *absence*, and an absence is only provable where the documents actually are: over
 * the served HTML of the whole Phase 0 URL set — four locale homes, four hubs, fourteen corridor
 * pages — with every `<script type="application/ld+json">` parsed and every `@type` at every depth
 * collected. The forbidden list is `plan/02` §9's and §15's, and each entry names a competitor
 * failure we refuse to repeat: `LocalBusiness` and `FloristShop` (we are not a shop and there is no
 * per-city entity), `Product`/`Offer` (no corridor page sells anything, and no country that is not
 * live may carry an offer), `aggregateRating`/`review` (no order has been delivered, so there is
 * nothing to rate).
 *
 * The positive half of AC-15 is asserted here too, because "equals the visible breadcrumb" is only
 * half-proved by a builder test: the served corridor and hub carry a `BreadcrumbList` whose names
 * are the `<nav>`'s own items in order, the corridor's `FAQPage` answers are the page's visible
 * text, and the locale home carries `Organization` + `WebSite` with no `SearchAction`.
 *
 * Note the scan visits **no 404**: §14 A6 puts the unknown-slug, casing and other-locale shapes out
 * of the rendered set entirely, and a 404 document has no page type to describe.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type APIRequestContext,
  expect,
  test,
  type Page,
} from "@playwright/test";

import { listingJsonLdProblems } from "../support/listing-jsonld-scan.ts";
import { pdpJsonLdProblems } from "../support/pdp-jsonld-scan.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** The committed corridor set: seven destinations in the two locales a human has written. */
const SLUGS = [
  "poland",
  "germany",
  "france",
  "spain",
  "italy",
  "romania",
  "netherlands",
] as const;

/** The localised `destinations` segment of each locale (`locales.data.ts`). */
const DESTINATIONS: Readonly<Record<string, string>> = {
  en: "send-flowers-to",
  "en-gb": "send-flowers-to",
  de: "blumen-verschicken",
  pl: "wyslij-kwiaty",
};

const HOMES = LOCALES.map((locale) => `/${locale}`);
const HUBS = LOCALES.map(
  (locale) => `/${locale}/${DESTINATIONS[locale] ?? ""}`,
);
const CORRIDORS = ["en", "en-gb"].flatMap((locale) =>
  SLUGS.map((slug) => `/${locale}/${DESTINATIONS[locale] ?? ""}/${slug}`),
);
/** Spec 041's trust pages (TASK-182): English only until TASK-184's drafts. */
const INFO_PAGES = ["en", "en-gb"].flatMap((locale) =>
  ["how-it-works", "guarantee", "help", "about", "delivery"].map(
    (segment) => `/${locale}/${segment}`,
  ),
);
const EVERY_PAGE = [...HOMES, ...HUBS, ...CORRIDORS, ...INFO_PAGES];

/**
 * The types and the two *properties* `plan/02` §9 forbids by name. The properties are matched on
 * the serialised document, because `aggregateRating` and `review` are not `@type`s: they are keys
 * that would hang a rating off an otherwise innocent node.
 */
const FORBIDDEN_TYPES = [
  "LocalBusiness",
  "FloristShop",
  "Product",
  "Offer",
  "AggregateRating",
  "Review",
  "Store",
  "Florist",
] as const;
const FORBIDDEN_PROPERTIES = ["aggregateRating", "review", "reviews"] as const;

interface Node {
  readonly types: readonly string[];
  readonly node: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every node carrying an `@type`, at any depth, in arrays and inside `@graph`. */
function collect(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap((entry) => collect(entry));
  if (!isRecord(value)) return [];
  const raw = value["@type"];
  const types =
    typeof raw === "string"
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((entry): entry is string => typeof entry === "string")
        : [];
  const found: Node[] = types.length > 0 ? [{ types, node: value }] : [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "@type") continue;
    found.push(...collect(child));
  }
  return found;
}

/** Every JSON-LD document of a page, parsed. A block that does not parse fails the test. */
async function documents(page: Page): Promise<readonly unknown[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.map((block) => JSON.parse(block) as unknown);
}

async function nodesOf(page: Page): Promise<readonly Node[]> {
  return (await documents(page)).flatMap((document) => collect(document));
}

test.describe("AC-16: no page emits a forbidden type (T-17)", () => {
  for (const path of EVERY_PAGE) {
    test(`${path} carries no LocalBusiness, FloristShop, Product, Offer, rating or review`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const blocks = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
      const types = (await nodesOf(page)).flatMap((node) => node.types);

      for (const forbidden of FORBIDDEN_TYPES) {
        expect(types, `${path}: @type ${forbidden}`).not.toContain(forbidden);
      }
      for (const block of blocks) {
        for (const property of FORBIDDEN_PROPERTIES) {
          expect(block, `${path}: ${property}`).not.toContain(`"${property}"`);
        }
        // Every block is one valid JSON document (the parse above would already have thrown).
        expect(block.trim().startsWith("{")).toBe(true);
      }
    });
  }
});

test.describe("AC-15: the served BreadcrumbList is the visible trail (T-17)", () => {
  for (const path of [...CORRIDORS, ...HUBS, ...INFO_PAGES]) {
    test(`${path} announces the trail its <nav> shows`, async ({ page }) => {
      await page.goto(path);

      const visible = await page
        .locator("[data-fo-breadcrumb] li")
        .allInnerTexts();
      const trail = visible.map((item) =>
        item
          .replace(/^\s*\/\s*/, "")
          .replaceAll(/\s+/g, " ")
          .trim(),
      );

      const breadcrumb = (await nodesOf(page)).find((node) =>
        node.types.includes("BreadcrumbList"),
      );
      expect(breadcrumb, `${path} has a BreadcrumbList`).toBeDefined();

      const items = (breadcrumb?.node["itemListElement"] ??
        []) as readonly Record<string, unknown>[];
      expect(items.map((item) => item["name"])).toEqual(trail);
      items.forEach((item, index) => {
        expect(item["position"]).toBe(index + 1);
      });
    });
  }
});

test.describe("spec 041 AC-19: the help page's FAQPage is the visible Q&A (T-19)", () => {
  for (const path of ["/en/help", "/en-gb/help"]) {
    test(`${path} marks up exactly the questions and answers it shows`, async ({
      page,
    }) => {
      await page.goto(path);
      const visible = await page
        .locator("[data-fo-faq-item]")
        .evaluateAll((items) =>
          items.map((item) => [
            item.querySelector("h2")?.textContent ?? "",
            item.querySelector("p")?.textContent ?? "",
          ]),
        );
      const nodes = await nodesOf(page);
      const faq = nodes.find((node) => node.types.includes("FAQPage"));
      expect(faq, `${path} has a FAQPage`).toBeDefined();
      const entries = (faq?.node["mainEntity"] ?? []) as readonly Record<
        string,
        unknown
      >[];
      expect(visible.length).toBeGreaterThanOrEqual(10);
      expect(
        entries.map((entry) => [
          entry["name"],
          (entry["acceptedAnswer"] as Record<string, unknown> | undefined)?.[
            "text"
          ],
        ]),
      ).toEqual(visible);
      // Organization only on about; nothing beyond the trail and the questions here.
      expect(nodes.flatMap((node) => node.types).sort()).toEqual(
        expect.arrayContaining(["BreadcrumbList", "FAQPage"]),
      );
      expect(nodes.flatMap((node) => node.types)).not.toContain("Organization");
    });
  }

  test("/en/about carries an Organization with exactly name, url and logo", async ({
    page,
  }) => {
    await page.goto("/en/about");
    const org = (await nodesOf(page)).find((node) =>
      node.types.includes("Organization"),
    );
    expect(Object.keys(org?.node ?? {}).sort()).toEqual([
      "@type",
      "logo",
      "name",
      "url",
    ]);
  });
});

test.describe("AC-15: the corridor's FAQPage is the visible Q&A (T-17)", () => {
  for (const path of [CORRIDORS[0] ?? "", CORRIDORS[7] ?? ""]) {
    test(`${path} marks up exactly the questions it shows`, async ({
      page,
    }) => {
      await page.goto(path);

      const questions = await page
        .locator("[data-fo-corridor-faq] h3")
        .allInnerTexts();
      const faq = (await nodesOf(page)).find((node) =>
        node.types.includes("FAQPage"),
      );
      expect(faq, `${path} has a FAQPage`).toBeDefined();

      const entries = (faq?.node["mainEntity"] ?? []) as readonly Record<
        string,
        unknown
      >[];
      expect(entries.length).toBeGreaterThanOrEqual(8);
      expect(entries.length).toBeLessThanOrEqual(12);
      expect(entries.map((entry) => entry["name"])).toEqual(
        questions.map((question) => question.trim()),
      );

      // Every marked-up answer is text the reader can see on the page (no hidden FAQ content).
      const body = await page.locator("[data-fo-corridor-faq]").innerText();
      for (const entry of entries) {
        const answer = (entry["acceptedAnswer"] ?? {}) as Record<
          string,
          unknown
        >;
        expect(body).toContain(String(answer["text"]));
      }
    });
  }
});

test.describe("AC-15: the locale home carries the site identity (T-17)", () => {
  for (const path of HOMES) {
    test(`${path} emits Organization and WebSite, and no SearchAction`, async ({
      page,
    }) => {
      await page.goto(path);
      const nodes = await nodesOf(page);
      const types = nodes.flatMap((node) => node.types);

      expect(types).toContain("Organization");
      expect(types).toContain("WebSite");
      expect(types).not.toContain("SearchAction");
      expect(types).not.toContain("FAQPage");

      const organization = nodes.find((node) =>
        node.types.includes("Organization"),
      );
      // Only what `src/config/company.ts` holds while `registered` is false.
      expect(Object.keys(organization?.node ?? {}).sort()).toEqual([
        "@type",
        "logo",
        "name",
        "url",
      ]);

      const website = nodes.find((node) => node.types.includes("WebSite"));
      expect(website?.node["potentialAction"]).toBeUndefined();
    });
  }
});

/* -------------------------------------------------------------------------- */
/* The product page (spec 009 AC-18, T-18; TASK-130).                         */
/* -------------------------------------------------------------------------- */

/**
 * Every PDP, per locale: the existence set, read from the committed fixture that
 * `tests/unit/product-url-fixture.test.ts` regenerates from `listProductPages()` (Playwright cannot
 * import `modules/catalog`; `shop-reachability.spec.ts` has the same arrangement).
 */
const PDPS = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../fixtures/shop/product-urls.json"),
    "utf8",
  ),
) as Readonly<Record<string, readonly string[]>>;

/** One served PDP's problems under AC-18: its status, then the shared scan of its HTML. */
async function pdpProblems(
  request: APIRequestContext,
  path: string,
): Promise<string[]> {
  const response = await request.get(path, { maxRedirects: 0 });
  if (response.status() !== 200) {
    return [`${path}: ${String(response.status())}`];
  }
  return pdpJsonLdProblems(await response.text(), path);
}

/** How many PDPs are asked at once: enough to finish in seconds, few enough for `next start`. */
const PDP_CONCURRENCY = 8;

test.describe("AC-18: no PDP emits a forbidden type, in any locale (T-18)", () => {
  for (const [locale, paths] of Object.entries(PDPS)) {
    test(`every ${locale} PDP carries one BreadcrumbList and none of the eight`, async ({
      request,
    }, testInfo) => {
      // Raw HTML, so one viewport says everything; the phone project would repeat 2 352 requests.
      test.skip(
        testInfo.project.name !== "e2e-desktop",
        "a request-level scan: one project",
      );
      test.setTimeout(300_000);
      expect(paths.length, `${locale} has PDPs`).toBeGreaterThan(0);

      const problems: string[] = [];
      for (let start = 0; start < paths.length; start += PDP_CONCURRENCY) {
        const batch = paths.slice(start, start + PDP_CONCURRENCY);
        for (const found of await Promise.all(
          batch.map((path) => pdpProblems(request, path)),
        )) {
          problems.push(...found);
        }
      }
      expect(problems, `${String(paths.length)} PDPs scanned`).toStrictEqual(
        [],
      );
    });
  }
});

test.describe("AC-18: the served PDP BreadcrumbList is the visible trail (T-18)", () => {
  for (const path of [
    "/en/poland/product/amber-hour",
    "/en-gb/poland/product/amber-hour",
    "/de/polen/produkt/amber-hour",
    "/pl/polska/produkt/amber-hour",
  ]) {
    test(`${path} announces the trail its <nav> shows`, async ({ page }) => {
      await page.goto(path);

      const visible = await page
        .locator("[data-fo-breadcrumb-trail] li")
        .allTextContents();
      const trail = visible.map((item) =>
        item
          .replace(/^\s*\/\s*/, "")
          .replaceAll(/\s+/g, " ")
          .trim(),
      );
      expect(trail.length).toBeGreaterThanOrEqual(3);

      const breadcrumb = (await nodesOf(page)).find((node) =>
        node.types.includes("BreadcrumbList"),
      );
      const items = (breadcrumb?.node["itemListElement"] ??
        []) as readonly Record<string, unknown>[];
      expect(items.map((item) => item["name"])).toEqual(trail);
      items.forEach((item, index) => {
        expect(item["position"]).toBe(index + 1);
      });
      // The last crumb is the page and the `<h1>`'s name.
      await expect(page.locator("#pdp-h1 bdi").first()).toHaveText(
        String(items.at(-1)?.["name"]),
      );
    });
  }
});

/* -------------------------------------------------------------------------- */
/* The listing pages (spec 008 AC-17, AC-18, T-17, T-18; TASK-115).          */
/* -------------------------------------------------------------------------- */

/**
 * Every listing page, per locale: the existence set, read from the committed fixture that
 * `tests/unit/listing-url-fixture.test.ts` regenerates from `listingPages()` (Playwright cannot
 * import `modules/catalog`). Six page types, four locales.
 */
const LISTINGS = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../fixtures/shop/listing-urls.json"),
    "utf8",
  ),
) as Readonly<
  Record<
    string,
    readonly { readonly pageType: string; readonly path: string }[]
  >
>;

/**
 * T-17's paginated and sorted fixtures, served: page 2 and both sorts of the shop root and of a
 * country category over twelve products. Their `ItemList` must follow the slice and the order.
 */
const PARAMETERISED_LISTINGS = [
  "/en/poland/flowers?page=2",
  "/en/poland/flowers?sort=price-asc",
  "/en-gb/poland/flowers/roses?page=2",
  "/en-gb/poland/flowers/roses?sort=price-desc",
] as const;

/** One served listing's problems under AC-17 and AC-18: its status, then the shared scan. */
async function listingProblems(
  request: APIRequestContext,
  path: string,
  pageType: string,
): Promise<string[]> {
  const response = await request.get(path, { maxRedirects: 0 });
  if (response.status() !== 200) {
    return [`${path}: ${String(response.status())}`];
  }
  return listingJsonLdProblems(
    await response.text(),
    path,
    pageType === "occasionsIndex" ? "occasions" : "cards",
  );
}

test.describe("AC-18 + AC-17: every listing in every locale, scanned (T-17, T-18)", () => {
  for (const [locale, pages] of Object.entries(LISTINGS)) {
    test(`every ${locale} listing: one BreadcrumbList equal to the trail, an ItemList equal to the cards, none of the eight`, async ({
      request,
    }, testInfo) => {
      // Raw HTML, so one viewport says everything; the phone project would repeat every request.
      test.skip(
        testInfo.project.name !== "e2e-desktop",
        "a request-level scan: one project",
      );
      test.setTimeout(300_000);
      expect(pages.length, `${locale} has listings`).toBeGreaterThan(0);
      // All six types are in the set, so "every rendered page" includes each of them.
      expect(new Set(pages.map((page) => page.pageType)).size).toBe(6);

      const problems: string[] = [];
      for (let start = 0; start < pages.length; start += PDP_CONCURRENCY) {
        const batch = pages.slice(start, start + PDP_CONCURRENCY);
        for (const found of await Promise.all(
          batch.map((page) =>
            listingProblems(request, page.path, page.pageType),
          ),
        )) {
          problems.push(...found);
        }
      }
      expect(
        problems,
        `${String(pages.length)} listings scanned`,
      ).toStrictEqual([]);
    });
  }

  for (const path of PARAMETERISED_LISTINGS) {
    test(`${path}: the ItemList is this page's slice in this page's order`, async ({
      request,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "e2e-desktop",
        "a request-level scan: one project",
      );
      expect(
        await listingProblems(request, path, "countryShopRoot"),
      ).toStrictEqual([]);
    });
  }
});
