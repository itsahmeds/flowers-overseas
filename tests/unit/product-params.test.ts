/**
 * The product page's parameter policy, as values (spec 009 §5.2 `ProductSearchParamsSchema`, §5.4,
 * §6, §14 **A10**, AC-15, AC-24; T-15 and T-24 unit halves; TASK-128).
 *
 *  1. **`ProductSearchParamsSchema` and `productSearchParams()`**: strict, one key at a time, an
 *     unknown parameter dropped, a malformed value read as absent, never a throw.
 *  2. **The rewrite**, run the way Next runs `beforeFiles` (`resolve-routes.js`: in order, the
 *     first rule whose source matches *and* whose `has` holds; Next's own matcher, case-insensitive,
 *     and Next's own `matchHas`): a product address with `?tier=` or `?date=` reaches the parameter
 *     route, with only `?gclid=` / `?utm_source=` / `?sort=` it reaches the prebuilt product route,
 *     and the visitor's uppercase spelling reaches a destination the resolver refuses.
 *  3. **The shared-cache header** on exactly the addresses the rewrite sends to the parameter
 *     route, and mounted by `next.config.ts`.
 *  4. **The two route files, as source**: the product route reads no `searchParams` (A10: reading
 *     it makes the build list the route as per-request, which `tests/e2e/product-params.spec.ts`
 *     reads from the build output) and exports `productCachePolicy()`'s Phase 0 `revalidate`.
 *
 * The served half (the five value cases on the rewritten URL, `?gclid=` prebuilt, the direct
 * internal path, headers, cookies, sitemaps, links) is `tests/e2e/product-params.spec.ts`; the
 * route called as Next calls it is `tests/unit/product-params-route.test.tsx`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { LOCALES } from "../../src/config/locales";
import {
  PRODUCT_QUERY_KEY,
  PRODUCT_QUERY_KEYS,
  QUERY_KEYS,
} from "../../src/config/url-keys";
import { LISTING_CACHE_CONTROL } from "../../src/lib/listing-cache-headers";
import {
  LISTING_REWRITE_LOCALES,
  listingRewriteRules,
} from "../../src/lib/listing-rewrites";
import { isRedactedKey } from "../../src/lib/logger";
import {
  PRODUCT_PARAMETER_ROUTE_PREFIX,
  productParameterCacheHeaderRules,
  productParameterRewriteRules,
  productRewriteRules,
} from "../../src/lib/product-rewrites";
import {
  ProductSearchParamsSchema,
  listProductPages,
  productSearchParams,
  resolveLocalePath,
} from "../../src/modules/catalog";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string): string =>
  readFileSync(resolve(ROOT, path), "utf8");

const PRODUCT_ROUTE =
  "src/app/[locale]/-product/[segment]/[child]/[grandchild]/page.tsx";
const PARAMETER_ROUTE =
  "src/app/[locale]/%5Fquery/-product/[segment]/[child]/[grandchild]/page.tsx";

/* -------------------------------------------------------------------------- */
/* 1. The schema and the parser.                                              */
/* -------------------------------------------------------------------------- */

describe("`ProductSearchParamsSchema` (§5.2): strict, `{ tier?, date? }`", () => {
  it("accepts the two keys, each well formed, and nothing else", () => {
    expect(
      ProductSearchParamsSchema.parse({ tier: "stems_15", date: "2026-11-03" }),
    ).toEqual({ tier: "stems_15", date: "2026-11-03" });
    expect(ProductSearchParamsSchema.parse({})).toEqual({});
  });

  it("refuses an unknown key (strict: `.passthrough()` or `.strip()` goes red here)", () => {
    for (const extra of ["utm_source", "gclid", "sort", "Tier"]) {
      expect(
        ProductSearchParamsSchema.safeParse({ tier: "stems_15", [extra]: "x" })
          .success,
        extra,
      ).toBe(false);
    }
  });

  it("refuses a malformed tier and a malformed date", () => {
    for (const tier of [
      "",
      "STEMS_15",
      "stems 15",
      "stems-15",
      "x".repeat(33),
    ]) {
      expect(ProductSearchParamsSchema.safeParse({ tier }).success, tier).toBe(
        false,
      );
    }
    for (const date of [
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-1-01",
      "26-11-03",
      "2026-11-03T00:00",
      " 2026-11-03",
      "tomorrow",
    ]) {
      expect(ProductSearchParamsSchema.safeParse({ date }).success, date).toBe(
        false,
      );
    }
    // A leap day that exists is a date.
    expect(
      ProductSearchParamsSchema.safeParse({ date: "2028-02-29" }).success,
    ).toBe(true);
  });

  it("parses a retired tier key's shape: membership is the data's question (TASK-240)", () => {
    expect(ProductSearchParamsSchema.parse({ tier: "stems_18" })).toEqual({
      tier: "stems_18",
    });
  });
});

describe("`productSearchParams()`: never throws, drops the unknown, keeps each key on its own", () => {
  it("returns the valid tier and date as the selection, and every key it saw", () => {
    expect(
      productSearchParams({
        tier: "stems_15",
        date: "2026-11-03",
        utm_source: "newsletter",
      }),
    ).toEqual({
      keys: ["date", "tier", "utm_source"],
      selection: { tierKey: "stems_15", date: "2026-11-03" },
    });
  });

  it("drops an unknown parameter beside the two keys", () => {
    const parsed = productSearchParams({ tier: "stems_15", gclid: "abc" });
    expect(parsed.selection).toStrictEqual({ tierKey: "stems_15" });
  });

  it("reads a malformed date as absent and keeps the valid tier beside it", () => {
    expect(
      productSearchParams({ tier: "stems_15", date: "2026-02-30" }).selection,
    ).toStrictEqual({ tierKey: "stems_15" });
    expect(
      productSearchParams({ tier: "STEMS_15", date: "2026-11-03" }).selection,
    ).toStrictEqual({ date: "2026-11-03" });
  });

  it("reads a repeated key's first value, and an empty value as absent", () => {
    expect(
      productSearchParams({ tier: ["stems_21", "stems_11"] }).selection,
    ).toStrictEqual({ tierKey: "stems_21" });
    expect(productSearchParams({ tier: "", date: "" })).toStrictEqual({
      keys: ["date", "tier"],
      selection: {},
    });
  });

  it("lists no key for an undefined value, so the route's guard reads only what was sent", () => {
    expect(productSearchParams({ gclid: "x", tier: undefined })).toStrictEqual({
      keys: ["gclid"],
      selection: {},
    });
  });
});

describe("the product keys (spec 001 §14 A20's rule, applied to the product's own list)", () => {
  it("are `tier` and `date`, the form's field names, and neither is personal data", () => {
    expect([...PRODUCT_QUERY_KEYS]).toEqual(["tier", "date"]);
    expect(PRODUCT_QUERY_KEY).toEqual({ tier: "tier", date: "date" });
    for (const key of PRODUCT_QUERY_KEYS)
      expect(isRedactedKey(key), key).toBe(false);
    // The form fields carry exactly these names (`TierSelector`, `DateChip`).
    expect(read("src/modules/ui/product/TierSelector.tsx")).toMatch(
      /^\s*name = "tier",$/mu,
    );
    expect(read("src/modules/ui/product/DateChip.tsx")).toMatch(
      /name = "date"/u,
    );
  });

  it("are not listing keys: a listing does not learn `?tier=` or `?date=`", () => {
    for (const key of PRODUCT_QUERY_KEYS) {
      expect(QUERY_KEYS as readonly string[], key).not.toContain(key);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The rewrite, as Next runs it.                                           */
/* -------------------------------------------------------------------------- */

/** Next's matcher as `buildCustomRoute()` builds it: strict, case-insensitive (no `caseSensitiveRoutes`). */
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

interface Rule {
  readonly source: string;
  readonly destination: string;
  readonly has?: readonly { type: "query"; key: string }[];
}

/** `next.config.ts`'s `beforeFiles`, in its order (pinned from source below). */
const BEFORE_FILES: readonly Rule[] = [
  ...listingRewriteRules(),
  ...productParameterRewriteRules(),
  ...productRewriteRules(),
];

/** Where Next's `beforeFiles` pass sends `url`: the first rule whose source and `has` hold. */
function rewrite(url: string): string | undefined {
  const parsed = new URL(url, "https://example.test");
  const query = Object.fromEntries(parsed.searchParams.entries());
  for (const rule of BEFORE_FILES) {
    const params = nextMatch(rule.source, parsed.pathname);
    if (params === false) continue;
    if (
      rule.has !== undefined &&
      matchHas({ headers: {} } as never, query, [...rule.has], []) === false
    ) {
      continue;
    }
    return rule.destination.replace(
      /:([a-z]+)/giu,
      (_, name: string) => params[name] ?? "",
    );
  }
  return undefined;
}

const PARAMETER_PREFIX = `/${PRODUCT_PARAMETER_ROUTE_PREFIX}/`;

describe("the product parameter rewrite (A10)", () => {
  it("is one rule per routed locale and key, from the registry's own `product` segment", () => {
    const rules = productParameterRewriteRules();
    const locales = LOCALES.filter((locale) =>
      LISTING_REWRITE_LOCALES.includes(locale.code),
    );
    expect(rules).toHaveLength(locales.length * PRODUCT_QUERY_KEYS.length);
    expect(rules).toEqual(
      locales.flatMap((locale) =>
        PRODUCT_QUERY_KEYS.map((key) => ({
          source: `/:locale(${locale.code})/:country/:product(${locale.pathSegments.product})/:slug`,
          destination: "/:locale/_query/-product/:country/:product/:slug",
          has: [{ type: "query", key }],
        })),
      ),
    );
    expect(PRODUCT_PARAMETER_ROUTE_PREFIX).toBe("_query/-product");
  });

  it("sends `?tier=` and `?date=` on a product address to the parameter route", () => {
    for (const url of [
      "/en/poland/product/amber-hour?tier=stems_15",
      "/en/poland/product/amber-hour?date=2026-11-03",
      "/en-gb/poland/product/amber-hour?tier=stems_15&date=2026-11-03",
      "/de/polen/produkt/amber-hour?tier=stems_15",
      "/pl/polska/produkt/amber-hour?date=2026-11-03&utm_source=x",
    ]) {
      const path = new URL(url, "https://example.test").pathname;
      const [, locale] = path.split("/");
      expect(rewrite(url), url).toBe(
        `/${locale ?? ""}${PARAMETER_PREFIX}${path.split("/").slice(2).join("/")}`,
      );
    }
  });

  it("sends a product address with only campaign, click-id or sort parameters to the prebuilt product route", () => {
    for (const url of [
      "/en/poland/product/amber-hour",
      "/en/poland/product/amber-hour?gclid=abc",
      "/en/poland/product/amber-hour?utm_source=newsletter&utm_medium=email",
      "/en/poland/product/amber-hour?fbclid=x",
      "/en/poland/product/amber-hour?sort=price-asc",
      "/en/poland/product/amber-hour?tiers=stems_15",
      "/en/poland/product/amber-hour?dates=2026-11-03",
      // An empty value is no value to Next's `has` (it reads the bare page; recorded in the brief).
      "/en/poland/product/amber-hour?tier=",
    ]) {
      expect(rewrite(url), url).toBe("/en/-product/poland/product/amber-hour");
    }
  });

  it("matches no listing address, and no listing rule matches a product address", () => {
    for (const url of [
      "/en/poland/flowers?tier=stems_15",
      "/en/poland/flowers/roses?date=2026-11-03",
      "/en/poland/occasions/mothers-day?tier=stems_15",
      "/en/flowers/roses?tier=stems_15",
    ]) {
      expect(rewrite(url) ?? "", url).not.toContain(PARAMETER_PREFIX);
    }
    for (const rule of productParameterRewriteRules()) {
      expect(
        nextMatch(rule.source, "/en/poland/flowers/roses"),
        rule.source,
      ).toBe(false);
    }
  });

  it("carries the visitor's uppercase spelling to a destination the resolver refuses", async () => {
    for (const url of [
      "/EN/poland/product/amber-hour?tier=stems_15",
      "/en/poland/PRODUCT/amber-hour?tier=stems_15",
      "/en/POLAND/product/amber-hour?date=2026-11-03",
      "/en/poland/product/Amber-Hour?tier=stems_15",
    ]) {
      const destination = rewrite(url) ?? "";
      // Next's matcher is case-insensitive, so the rule does take it…
      expect(destination, url).toContain(PARAMETER_PREFIX);
      // …and the captured spelling is the visitor's, which the route's resolver 404s.
      const [, locale = "", , , ...segments] = destination.split("/");
      expect((await resolveLocalePath(locale, segments)).kind, url).toBe(
        "notFound",
      );
    }
  });

  it("sends every product page that exists to a destination the parameter route resolves to that product", async () => {
    const pages = await listProductPages();
    expect(pages.length).toBeGreaterThan(100);
    for (const page of pages) {
      const destination = rewrite(`${page.path}?tier=x`) ?? "";
      const [, locale = "", , , ...segments] = destination.split("/");
      const match = await resolveLocalePath(locale, segments);
      expect(match.kind, page.path).toBe("product");
      expect(match.kind === "product" ? match.sku : "", page.path).toBe(
        page.sku,
      );
    }
  });

  it("points at a route that exists, under the listing parameter route's `_query` segment", () => {
    expect(existsSync(resolve(ROOT, PARAMETER_ROUTE))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The shared-cache header.                                                */
/* -------------------------------------------------------------------------- */

describe("the shared-cache header on a parameterised product response (AC-24)", () => {
  /** The header rules whose source and `has` hold for `url`. */
  const headersFor = (url: string): string[] => {
    const parsed = new URL(url, "https://example.test");
    const query = Object.fromEntries(parsed.searchParams.entries());
    return productParameterCacheHeaderRules()
      .filter(
        (rule) =>
          nextMatch(rule.source, parsed.pathname) !== false &&
          matchHas({ headers: {} } as never, query, rule.has, []) !== false,
      )
      .flatMap((rule) =>
        rule.headers.map((header) => `${header.key}: ${header.value}`),
      );
  };

  it("is spec 008 §5.4's value, on exactly the rewrite's sources and conditions", () => {
    expect(LISTING_CACHE_CONTROL).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(productParameterCacheHeaderRules()).toEqual(
      productParameterRewriteRules().map((rule) => ({
        source: rule.source,
        has: rule.has,
        headers: [{ key: "Cache-Control", value: LISTING_CACHE_CONTROL }],
      })),
    );
  });

  it("applies to `?tier=` and `?date=`, and not to the bare URL or a campaign parameter", () => {
    expect(headersFor("/en/poland/product/amber-hour?tier=stems_15")).toContain(
      `Cache-Control: ${LISTING_CACHE_CONTROL}`,
    );
    expect(
      headersFor("/de/polen/produkt/amber-hour?date=2026-11-03"),
    ).toContain(`Cache-Control: ${LISTING_CACHE_CONTROL}`);
    for (const url of [
      "/en/poland/product/amber-hour",
      "/en/poland/product/amber-hour?gclid=x",
      "/en/poland/product/amber-hour?sort=price-asc",
      "/en/poland/flowers/roses?tier=stems_15",
    ]) {
      expect(headersFor(url), url).toEqual([]);
    }
  });

  it("is mounted by `next.config.ts`, and the parameter rules sit before the product rule (source)", () => {
    const config = read("next.config.ts");
    expect(config).toContain("...productParameterCacheHeaderRules(),");
    expect(config).toMatch(
      /beforeFiles: \[\s*\.\.\.listingRewriteRules\(\),\s*\.\.\.productParameterRewriteRules\(\),\s*\.\.\.productRewriteRules\(\),\s*\]/u,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The two route files.                                                    */
/* -------------------------------------------------------------------------- */

/** Every identifier and property name in `source` that spells `name` (comments are not code). */
function identifiersNamed(source: string, name: string): number {
  const file = ts.createSourceFile(
    "route.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
      node.text === name
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

describe("the product route reads no query string (A10, T-15's source check)", () => {
  it("names `searchParams` nowhere in its code", () => {
    expect(identifiersNamed(read(PRODUCT_ROUTE), "searchParams")).toBe(0);
    // The shared module it renders through reads none either: the request is handed in.
    expect(
      identifiersNamed(
        read("src/app/[locale]/product-route.tsx"),
        "searchParams",
      ),
    ).toBe(0);
  });

  it("the check sees `searchParams` where it is code (its own control)", () => {
    expect(
      identifiersNamed(read(PARAMETER_ROUTE), "searchParams"),
    ).toBeGreaterThan(0);
    expect(
      identifiersNamed(
        "export default async function P({ searchParams }: { searchParams: Promise<{}> }) { await searchParams; }",
        "searchParams",
      ),
    ).toBe(3);
    expect(
      identifiersNamed(
        "// reads no searchParams\n/* searchParams */",
        "searchParams",
      ),
    ).toBe(0);
  });

  it("renders the bare URL (`parameterised: false`); the parameter route renders `parameterised: true`", () => {
    expect(read(PRODUCT_ROUTE)).toMatch(
      /const BARE = \{ parameterised: false \} as const;/u,
    );
    expect(read(PARAMETER_ROUTE)).toMatch(
      /return \{ parameterised: true, selection: request\.selection \};/u,
    );
  });

  it("is per request only in the parameter route", () => {
    expect(read(PARAMETER_ROUTE)).toMatch(
      /export const dynamic = "force-dynamic";/u,
    );
    expect(read(PRODUCT_ROUTE)).not.toMatch(/export const dynamic\b/u);
    expect(read(PRODUCT_ROUTE)).toMatch(/export const revalidate = 3600;/u);
  });
});
