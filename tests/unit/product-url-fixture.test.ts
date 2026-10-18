/**
 * The committed product URL set is the existence set, not a transcription of it (spec 009 §2,
 * AC-3, AC-18; TASK-130) — `listing-url-fixture.test.ts`'s sibling, one page type down.
 *
 * `tests/e2e/schema.spec.ts` scans the served JSON-LD of **every** PDP in every locale (AC-18's
 * type scan), and Playwright cannot import `modules/catalog` (the `next/dynamic` wall that
 * `scripts/shop/generate-listing-url-fixture.ts` documents). So the scan reads its targets from
 * `tests/fixtures/shop/product-urls.json`, and this test regenerates that file from
 * `listProductPages()` — the function the route's `generateStaticParams` reads — and compares it
 * byte for byte. A scan over a stale list could pass by not visiting a page; this keeps the list
 * moving with the catalogue in the same commit.
 *
 *     UPDATE_SHOP_FIXTURES=1 pnpm test tests/unit/product-url-fixture.test.ts
 *
 * The write happens before the comparison, so a refresh run is green and a normal run never
 * touches the tree.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { listProductPages, listingLocales } from "../../src/modules/catalog";

const FIXTURE = resolve(
  import.meta.dirname,
  "../fixtures/shop/product-urls.json",
);

const generated: Record<string, string[]> = {};
for (const locale of listingLocales()) {
  generated[locale] = (await listProductPages(locale)).map((page) => page.path);
}
const bytes = `${JSON.stringify(generated, null, 2)}\n`;

if (process.env["UPDATE_SHOP_FIXTURES"] === "1") {
  writeFileSync(FIXTURE, bytes, "utf8");
}

describe("tests/fixtures/shop/product-urls.json is generated, not written", () => {
  it("matches listProductPages() byte for byte", () => {
    expect(readFileSync(FIXTURE, "utf8")).toBe(bytes);
  });

  it("names every listing locale, every product page once, and nothing else", () => {
    expect(Object.keys(generated)).toEqual([...listingLocales()]);
    let total = 0;
    for (const [locale, paths] of Object.entries(generated)) {
      expect(new Set(paths).size, locale).toBe(paths.length);
      for (const path of paths) {
        expect(path).toMatch(
          new RegExp(`^/${locale}/[a-z0-9-]+/[a-z]+/[a-z0-9-]+$`, "u"),
        );
      }
      total += paths.length;
    }
    // 84 products x 7 published destinations x 4 locales on 2026-10-18 (spec 009 §14 A6); a floor,
    // because the catalogue grows.
    expect(total).toBeGreaterThanOrEqual(2352);
  });
});
