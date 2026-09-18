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
import { expect, test, type Page } from "@playwright/test";

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
const EVERY_PAGE = [...HOMES, ...HUBS, ...CORRIDORS];

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
  for (const path of [...CORRIDORS, ...HUBS]) {
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
