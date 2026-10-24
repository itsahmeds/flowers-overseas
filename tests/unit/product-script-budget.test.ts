/**
 * The product page's own script budget and its own route file (spec 004 §14
 * A-founder-2026-10-18a, AC-56, T-61; spec 009 §14 A-founder-2026-10-18a, AC-37, T-41's unit half;
 * TASK-228).
 *
 *  - **AC-56 / T-61:** `pnpm budget:client-js` measures the two product URLs against 133 120 B and
 *    every other URL against 131 072 B, and `lighthouserc.json` asserts the same split by URL
 *    pattern. Red with a product route at 133 121 B, red with a listing given 133 120 B, red with
 *    the product pattern widened to match `/poland/flowers/roses`.
 *  - **AC-37:** the route file the country category and occasion share no longer reaches the
 *    product island, because every product address is rewritten to the product route; the build
 *    check `productIslandHits()` fails a listing that fetches the island and a product page that
 *    does not. The served half is `tests/e2e/client-js-budget.spec.ts`.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  budgetFor,
  CLIENT_JS_BUDGET_BYTES,
  DEFAULT_URLS,
  main,
  measurePages,
  type PageMeasurement,
  PRODUCT_CLIENT_JS_BUDGET_BYTES,
  PRODUCT_ISLAND_MARKERS,
  productIslandHits,
  withinBudgetFor,
} from "../../scripts/client-js-budget.ts";
import { LOCALES } from "../../src/config/locales";
import {
  PRODUCT_ROUTE_HEADER_SOURCE,
  PRODUCT_ROUTE_ROBOTS,
  PRODUCT_ROUTE_SEGMENT,
  productRewriteRules,
  productRouteHeaderRules,
  productRoutePathFor,
} from "../../src/lib/product-rewrites";
import { listingRewriteRules } from "../../src/lib/listing-rewrites";
import {
  CARD_TEXT_SELECTOR,
  TIER_SLOT_SELECTOR,
} from "../../src/modules/ui/product/CardMessageField";

import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(__dirname, "../..");
const read = (file: string): string =>
  readFileSync(resolve(repoRoot, file), "utf8");

const PRODUCT = "/en/poland/product/amber-hour";
const PRODUCT_GB = "/en-gb/poland/product/amber-hour";
const LISTINGS = [
  "/en/poland/flowers/roses",
  "/en-gb/poland/flowers/roses",
  "/en-gb/poland/occasions/mothers-day",
] as const;

describe("AC-56: the product page's budget is 133 120 B, every other URL's 131 072 B", () => {
  it("names the two numbers", () => {
    expect(CLIENT_JS_BUDGET_BYTES).toBe(131_072);
    expect(PRODUCT_CLIENT_JS_BUDGET_BYTES).toBe(133_120);
  });

  it("measures both product URLs and the three listings that share their depth", () => {
    for (const url of [PRODUCT, PRODUCT_GB, ...LISTINGS]) {
      expect(DEFAULT_URLS).toContain(url);
    }
  });

  it("gives a product URL 133 120 B and refuses 133 121 B", () => {
    for (const url of [PRODUCT, PRODUCT_GB]) {
      expect(budgetFor(url)).toBe(133_120);
      expect(withinBudgetFor(url, 133_120)).toBe(true);
      expect(withinBudgetFor(url, 133_121)).toBe(false);
    }
  });

  it("refuses a listing at 133 120 B: every other measured URL keeps 131 072 B", () => {
    for (const url of DEFAULT_URLS) {
      if (url === PRODUCT || url === PRODUCT_GB) continue;
      expect(budgetFor(url), url).toBe(131_072);
      expect(withinBudgetFor(url, 131_072), url).toBe(true);
      expect(withinBudgetFor(url, 133_120), url).toBe(false);
    }
  });
});

/** `lighthouserc.json`'s `assertMatrix`, as LHCI reads it: `new RegExp(pattern).test(url)`. */
interface MatrixEntry {
  matchingUrlPattern?: string;
  assertions: Record<string, [string, { maxNumericValue?: number }]>;
}
const matrix = (
  JSON.parse(read("lighthouserc.json")) as {
    ci: { assert: { assertMatrix: MatrixEntry[] } };
  }
).ci.assert.assertMatrix;

/** Every script budget LHCI would assert on `url`, in matrix order. */
function scriptBudgetsOn(url: string): number[] {
  return matrix
    .filter(
      (entry) =>
        entry.matchingUrlPattern === undefined ||
        new RegExp(entry.matchingUrlPattern).test(url),
    )
    .flatMap((entry) => {
      const assertion = entry.assertions["resource-summary:script:size"];
      return assertion === undefined
        ? []
        : [assertion[1].maxNumericValue ?? Number.NaN];
    });
}

describe("AC-56: lighthouserc.json asserts the same split by URL", () => {
  const origin = "http://127.0.0.1:3100";

  it("asserts 133 120 B and nothing else on a product URL, in every locale's product segment", () => {
    for (const locale of LOCALES) {
      const url = `${origin}/${locale.code}/poland/${locale.pathSegments.product}/amber-hour`;
      expect(scriptBudgetsOn(url), url).toEqual([133_120]);
    }
  });

  it("asserts 131 072 B and nothing else on the listings, the homes and the hubs", () => {
    for (const path of [
      ...LISTINGS,
      "/en",
      "/en-gb",
      "/en/poland/flowers",
      "/en/flowers/roses",
      "/en/send-flowers-to/poland",
    ]) {
      expect(scriptBudgetsOn(`${origin}${path}`), path).toEqual([131_072]);
    }
  });

  it("names exactly the registry's product segments", () => {
    const product = matrix.find(
      (entry) =>
        entry.assertions["resource-summary:script:size"]?.[1]
          .maxNumericValue === 133_120,
    )?.matchingUrlPattern;
    const named = /\(\?:([^)]+)\)/u.exec(product ?? "")?.[1]?.split("|");
    expect(new Set(named)).toEqual(
      new Set(LOCALES.map((locale) => locale.pathSegments.product)),
    );
  });
});

/** Next's own matcher, built as `buildCustomRoute()` builds a rewrite (case-insensitive). */
const nextMatch = (
  source: string,
  path: string,
): Record<string, string> | false => {
  const match = getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    sensitive: false,
  })(path);
  return match === false ? false : (match as Record<string, string>);
};

function rewrite(path: string): string | undefined {
  for (const rule of productRewriteRules()) {
    const params = nextMatch(rule.source, path);
    if (params === false) continue;
    return rule.destination.replace(
      /:([a-z]+)/gu,
      (_, name: string) => params[name] ?? `:${name}`,
    );
  }
  return undefined;
}

describe("AC-37: every product address is served by the product route", () => {
  it("rewrites each locale's product address to `-product`, keeping the visitor's spelling", () => {
    for (const locale of LOCALES) {
      const path = `/${locale.code}/poland/${locale.pathSegments.product}/amber-hour`;
      const internal = `/${locale.code}/${PRODUCT_ROUTE_SEGMENT}/poland/${locale.pathSegments.product}/amber-hour`;
      expect(rewrite(path), path).toBe(internal);
      expect(productRoutePathFor(path), path).toBe(internal);
    }
    expect(rewrite("/EN/poland/PRODUCT/amber-hour")).toBe(
      "/EN/-product/poland/PRODUCT/amber-hour",
    );
  });

  it("rewrites no listing, hub, home or shallower or deeper path", () => {
    for (const locale of LOCALES) {
      const { shopCategory, occasions, product } = locale.pathSegments;
      for (const path of [
        `/${locale.code}/poland/${shopCategory}/roses`,
        `/${locale.code}/poland/${occasions}/mothers-day`,
        `/${locale.code}/poland/${shopCategory}`,
        `/${locale.code}/${shopCategory}/roses`,
        `/${locale.code}/poland/${product}`,
        `/${locale.code}/poland/${product}/amber-hour/more`,
        `/${locale.code}`,
      ]) {
        expect(rewrite(path), path).toBeUndefined();
        expect(productRoutePathFor(path), path).toBeNull();
      }
    }
  });

  it("keeps every locale's product segment apart from its listing segments", () => {
    for (const locale of LOCALES) {
      const { shopCategory, occasions, product } = locale.pathSegments;
      expect([shopCategory, occasions]).not.toContain(product);
    }
  });

  it("mounts the product rules in `beforeFiles` beside the listing rules, and the robots header for a direct hit", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(
      /beforeFiles: \[\.\.\.listingRewriteRules\(\), \.\.\.productRewriteRules\(\)\]/u,
    );
    expect(config).toContain("...productRouteHeaderRules(),");
    expect(productRouteHeaderRules()).toEqual([
      {
        source: "/:locale/-product/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]);
    expect(PRODUCT_ROUTE_HEADER_SOURCE).toBe("/:locale/-product/:path*");
    expect(PRODUCT_ROUTE_ROBOTS).toBe("noindex, nofollow");
    // A product address never reaches a listing parameter rule either.
    for (const rule of listingRewriteRules()) {
      expect(nextMatch(rule.source, PRODUCT)).toBe(false);
    }
  });

  it("the shared depth-4 route reaches no client module of the product page, and the product route reaches the island", () => {
    const productUi = "src/modules/ui/product/";
    const reach = (entry: string): string[] =>
      [...importClosure(resolve(repoRoot, entry)).files].map((file) =>
        relative(repoRoot, file),
      );
    const shared = reach(
      "src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx",
    );
    // The listings render product cards and share server components with the PDP; what they must
    // not reach is a client module of it, because Turbopack ships every client module a route
    // file reaches in that route's script set.
    expect(
      shared.filter(
        (file) =>
          file.startsWith(productUi) &&
          /^\s*["']use client["']/u.test(read(file)),
      ),
    ).toEqual([]);
    expect(shared).not.toContain(`${productUi}CardMessageField.tsx`);
    const product = reach(
      "src/app/[locale]/-product/[segment]/[child]/[grandchild]/page.tsx",
    );
    expect(product).toContain(`${productUi}CardMessageField.tsx`);
  });
});

describe("AC-37: the build check fails a listing that fetches the island", () => {
  it("watches the island's own selectors", () => {
    expect([...PRODUCT_ISLAND_MARKERS]).toEqual([
      CARD_TEXT_SELECTOR,
      TIER_SLOT_SELECTOR,
    ]);
  });

  const page = (url: string, assets: string[]): PageMeasurement => ({
    url,
    assets: assets.map((asset) => ({
      asset,
      noModule: false,
      kind: "document",
      rawBytes: 0,
      gzipBytes: 0,
      brotliBytes: 0,
    })),
    references: [],
    fetchedGzipBytes: 0,
    fetchedBrotliBytes: 0,
    documentBrotliBytes: 0,
    lazyBrotliBytes: 0,
    budgetBytes: budgetFor(url),
    withinBudget: true,
  });

  it("passes the product page with its island and a listing without it, and fails the opposite", () => {
    const dist = mkdtempSync(join(tmpdir(), "fo-island-"));
    try {
      mkdirSync(join(dist, "static/chunks"), { recursive: true });
      writeFileSync(
        join(dist, "static/chunks/island.js"),
        `document.querySelectorAll("${CARD_TEXT_SELECTOR}");document.querySelectorAll("${TIER_SLOT_SELECTOR}")`,
      );
      writeFileSync(join(dist, "static/chunks/shared.js"), "export{}");

      expect(
        productIslandHits(dist, [
          page(PRODUCT, ["static/chunks/shared.js", "static/chunks/island.js"]),
          page(LISTINGS[0], ["static/chunks/shared.js"]),
        ]),
      ).toEqual([]);

      const listingWithIsland = productIslandHits(dist, [
        page(LISTINGS[2], [
          "static/chunks/shared.js",
          "static/chunks/island.js",
        ]),
      ]);
      expect(listingWithIsland).toEqual([
        {
          url: LISTINGS[2],
          product: false,
          marker: CARD_TEXT_SELECTOR,
          asset: "static/chunks/island.js",
        },
        {
          url: LISTINGS[2],
          product: false,
          marker: TIER_SLOT_SELECTOR,
          asset: "static/chunks/island.js",
        },
      ]);

      expect(
        productIslandHits(dist, [page(PRODUCT, ["static/chunks/shared.js"])]),
      ).toEqual([
        { url: PRODUCT, product: true, marker: CARD_TEXT_SELECTOR },
        { url: PRODUCT, product: true, marker: TIER_SLOT_SELECTOR },
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

/**
 * Breaker H1 and H2 (round 1 on `6ff55192`): the budget and the island check as the real run wires
 * them, over a fake build output laid out the way `next build` lays out the two route files.
 */
describe("AC-56 and AC-37 through `measurePages()` and `main()` (breaker H1, H2)", () => {
  const PRODUCT_SERVED = "en/-product/poland/product/amber-hour";
  const GB_PRODUCT_SERVED = "en-gb/-product/poland/product/amber-hour";
  let dist = "";

  /** Bytes that Brotli cannot shrink: its output is the input plus a few bytes of framing. */
  function incompressible(length: number): Buffer {
    const out = Buffer.alloc(length);
    let state = 0x2545f491;
    for (let index = 0; index < length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      out[index] = state & 0xff;
    }
    return out;
  }

  const doc = (relative: string, chunks: readonly string[]): void => {
    const file = join(dist, "server/app", `${relative}.html`);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      chunks
        .map((chunk) => `<script src="/_next/static/chunks/${chunk}"></script>`)
        .join(""),
    );
  };

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "fo-product-budget-"));
    mkdirSync(join(dist, "static/chunks"), { recursive: true });
    writeFileSync(
      join(dist, "app-path-routes-manifest.json"),
      JSON.stringify({
        "/[locale]/[segment]/[child]/[grandchild]/page":
          "/[locale]/[segment]/[child]/[grandchild]",
        "/[locale]/-product/[segment]/[child]/[grandchild]/page":
          "/[locale]/-product/[segment]/[child]/[grandchild]",
      }),
    );
    writeFileSync(join(dist, "static/chunks/shared.js"), "export const a=1;");
    writeFileSync(
      join(dist, "static/chunks/island.js"),
      PRODUCT_ISLAND_MARKERS.map((marker) => `q("${marker}");`).join(""),
    );
    // Between the two budgets: over 131 072 B, under 133 120 B, with the other chunks.
    writeFileSync(join(dist, "static/chunks/big.js"), incompressible(132_000));
    // The product page's own document, under the product route; and a decoy at the bare address,
    // which a measurement that forgot the rewrite would read instead.
    doc(PRODUCT_SERVED, ["shared.js", "island.js", "big.js"]);
    doc("en/poland/product/amber-hour", ["shared.js"]);
    // A product page whose island is missing.
    doc(GB_PRODUCT_SERVED, ["shared.js"]);
    // A listing between the budgets, a listing that loads the island, a clean listing.
    doc("en/poland/flowers/roses", ["shared.js", "big.js"]);
    doc("en-gb/poland/occasions/mothers-day", ["shared.js", "island.js"]);
    doc("en-gb/poland/flowers/roses", ["shared.js"]);
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("measures a product URL from the product route's document, against 133 120 B", () => {
    const [product] = measurePages(dist, [PRODUCT]);
    expect(product?.assets.map((asset) => asset.asset).sort()).toEqual([
      "static/chunks/big.js",
      "static/chunks/island.js",
      "static/chunks/shared.js",
    ]);
    expect(product?.budgetBytes).toBe(133_120);
    expect(product?.fetchedBrotliBytes).toBeGreaterThan(131_072);
    expect(product?.fetchedBrotliBytes).toBeLessThanOrEqual(133_120);
    expect(product?.withinBudget).toBe(true);
  });

  it("holds a listing of the same size to 131 072 B", () => {
    const [listing] = measurePages(dist, [LISTINGS[0]]);
    expect(listing?.budgetBytes).toBe(131_072);
    expect(listing?.fetchedBrotliBytes).toBeGreaterThan(131_072);
    expect(listing?.withinBudget).toBe(false);
  });

  const run = (url: string): { code: number; out: string } => {
    const out: string[] = [];
    const write = (chunk: string): number => out.push(chunk);
    const code = main(["--dist", dist, "--url", url], { write }, { write });
    return { code, out: out.join("") };
  };

  it("fails the run when a listing fetches the product island", () => {
    const { code, out } = run(LISTINGS[2]);
    expect(code).toBe(1);
    expect(out).toContain(
      `${LISTINGS[2]} fetches the product island (static/chunks/island.js`,
    );
  });

  it("fails the run when a product page fetches no island", () => {
    const { code, out } = run(PRODUCT_GB);
    expect(code).toBe(1);
    expect(out).toContain(
      `${PRODUCT_GB} fetches no chunk with the product island's`,
    );
  });

  it("passes a clean listing", () => {
    const { code, out } = run(LISTINGS[1]);
    expect(code, out).toBe(0);
  });
});
