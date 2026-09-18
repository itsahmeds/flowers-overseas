/**
 * `isProductIndexable()` — the SEO keystone (spec 005 §6, AC-21, T-19; `plan/02` §10, ADR-0007;
 * TASK-068).
 *
 * Two things are proved here, and the second is the one that matters in a year's time.
 *
 * **The truth table.** The predicate is `true` only when all six terms of spec 005 §6 hold — live
 * country, active product, active price row, a non-null description in the locale, a `reviewed`
 * translation, and spec 003's `isLocaleIndexable(locale)`. The conjunction is checked over the
 * whole 2^6 space (the Phase 0 dataset can only produce a handful of the combinations, and a
 * predicate that is only tested where the data happens to go is a predicate nobody has tested),
 * and each real term is then shown to reach it.
 *
 * **The single call site.** "A `noindex` product can never appear in a sitemap" (`plan/02` §10) is
 * not a promise two consumers are asked to keep: the robots decision and the sitemap-membership
 * query call the *same function*, and nothing else in `src/` computes indexability from the
 * terms. That is asserted structurally — one call site for `productIndexability()`, no other
 * reader of `.indexable`, and `hasIndexableProducts()` written in terms of the predicate — so it
 * stays true when spec 007's sitemap builder and robots route arrive.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

import { describe, expect, it } from "vitest";

import { COUNTRIES } from "../../src/config/countries.ts";
import type { LocaleCode } from "../../src/config/locales.ts";
import {
  hasIndexableProducts,
  indexabilityVerdict,
  isProductIndexable,
  listProducts,
  productIndexability,
} from "../../src/modules/catalog/read.ts";
import type { ProductIndexability } from "../../src/modules/catalog/types.ts";

const LIVE = "PL" as const;
const DEMO = "DE" as const;
const SKU = "FO-BQ-001" as const;
const LOCALES = [
  "en",
  "en-gb",
  "de",
  "pl",
] as const satisfies readonly LocaleCode[];

/** The six terms of spec 005 §6, in the order the record declares them. */
const TERMS = [
  "countryLive",
  "productActive",
  "activePrice",
  "descriptionPresent",
  "translationReviewed",
  "localeIndexable",
] as const satisfies readonly (keyof Omit<ProductIndexability, "indexable">)[];

/* -------------------------------------------------------------------------- */
/* AC-21, half one: all six terms, and only all six.                          */
/* -------------------------------------------------------------------------- */

describe("the six-term conjunction (AC-21, T-19)", () => {
  it("carries exactly the six terms spec 005 §6 names", async () => {
    const terms = await productIndexability(SKU, "en", LIVE);
    expect(Object.keys(terms).sort()).toEqual(
      [...TERMS, "indexable"].slice().sort(),
    );
  });

  it("is true for exactly one of the 64 term combinations", () => {
    let trueCases = 0;
    for (let mask = 0; mask < 1 << TERMS.length; mask += 1) {
      const terms = Object.fromEntries(
        TERMS.map((term, index) => [term, (mask & (1 << index)) !== 0]),
      ) as Omit<ProductIndexability, "indexable">;

      const verdict = indexabilityVerdict(terms);
      expect(verdict, JSON.stringify(terms)).toBe(
        TERMS.every((term) => terms[term]),
      );
      if (verdict) trueCases += 1;
    }
    expect(trueCases).toBe(1);
  });

  it("fails on each single missing term, one at a time", () => {
    const all = Object.fromEntries(TERMS.map((term) => [term, true])) as Omit<
      ProductIndexability,
      "indexable"
    >;
    expect(indexabilityVerdict(all)).toBe(true);

    for (const term of TERMS) {
      expect(indexabilityVerdict({ ...all, [term]: false }), term).toBe(false);
    }
  });

  it("reads each real term from data: demo country, unlaunched locale, missing copy", async () => {
    await expect(productIndexability(SKU, "en", DEMO)).resolves.toMatchObject({
      countryLive: false,
      indexable: false,
    });
    await expect(productIndexability(SKU, "de", LIVE)).resolves.toMatchObject({
      localeIndexable: false,
      indexable: false,
    });
    // Phase 0 ships no description and no reviewed translation, so the copy terms are the two
    // that hold everything back — the intended outcome, and a data flip when spec 006 lands.
    await expect(productIndexability(SKU, "en", LIVE)).resolves.toMatchObject({
      countryLive: true,
      productActive: true,
      activePrice: true,
      descriptionPresent: false,
      translationReviewed: false,
      localeIndexable: true,
      indexable: false,
    });
  });

  it("is false for every product in every (destination, locale) in Phase 0", async () => {
    for (const country of COUNTRIES) {
      for (const locale of LOCALES) {
        await expect(
          isProductIndexable(SKU, locale, country.iso2),
          `${country.iso2}/${locale}`,
        ).resolves.toBe(false);
      }
    }
  });

  it("throws for an unknown SKU rather than answering `false`", async () => {
    await expect(isProductIndexable("FO-BQ-999", "en", LIVE)).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* AC-21, half two: one call site (plan/02 §10).                              */
/* -------------------------------------------------------------------------- */

describe("the sitemap query and the robots decision call one function (AC-21, T-19)", () => {
  const srcRoot = resolvePath(process.cwd(), "src");

  /** Every `.ts`/`.tsx` file under `src/`, comments stripped: the rule is about code. */
  function sourceFiles(dir: string): readonly { path: string; code: string }[] {
    const found: { path: string; code: string }[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        found.push(...sourceFiles(path));
        continue;
      }
      if (!/\.tsx?$/u.test(entry.name)) continue;
      found.push({
        path,
        code: readFileSync(path, "utf8")
          .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
          .replaceAll(/\/\/.*$/gmu, ""),
      });
    }
    return found;
  }

  const files = sourceFiles(srcRoot);

  it("`productIndexability()` has exactly one call site, inside `isProductIndexable()`", () => {
    const callSites = files.flatMap(({ path, code }) =>
      // The declaration is not a call site: `function productIndexability(` is skipped.
      [...code.matchAll(/(?<!function )productIndexability\(/gu)].map(
        () => path,
      ),
    );
    expect(callSites).toEqual([
      resolvePath(srcRoot, "modules/catalog/read.ts"),
    ]);

    const read = files.find((file) => file.path.endsWith("catalog/read.ts"));
    expect(read).toBeDefined();
    const body = read?.code.split(
      "export async function isProductIndexable",
    )[1];
    expect(body).toContain("productIndexability(sku, locale, countryIso)");
  });

  /**
   * The property, not the prefix. TASK-089 added `occasion_country.indexable_override` to
   * `src/modules/geo/occasions` — spec 002 §5.1's column, carried through untouched — and a
   * substring test for `.indexable` reads `.indexableOverride` as a second indexability decision,
   * which it is not: nothing in `geo` decides anything from it, it is a stored per-occasion
   * override that spec 008's occasion pages will hand to the one rule engine. The assertion is
   * therefore anchored on a word boundary, which is what it always meant.
   */
  it("nothing outside that one function reads `.indexable` to make a decision", () => {
    for (const { path, code } of files) {
      if (path.endsWith(join("modules", "catalog", "read.ts"))) continue;
      // TASK-107: `catalog/listing.ts` reads `verdict.indexable` — spec **007**'s engine answer
      // for a *page*, carried onto the listing view model so the rendered meta, the sitemap
      // membership and the JSON-LD read one verdict. It decides nothing: the decision is
      // `pageIndexability()`'s, and this spec's own product predicate is still `read.ts` alone.
      // The exception is that **one read**, not the file (`/review 76`): any other `.indexable`
      // appearing there fails this test exactly as it would anywhere else.
      if (path.endsWith(join("modules", "catalog", "listing.ts"))) {
        expect(
          [...code.matchAll(/[\w$.]*\.indexable\b/gu)].map((match) => match[0]),
          path,
        ).toEqual(["verdict.indexable"]);
        continue;
      }
      expect(code, path).not.toMatch(/\.indexable\b/);
    }
  });

  it("`hasIndexableProducts()` — the sitemap-membership question — is the predicate, quantified", async () => {
    for (const country of COUNTRIES) {
      for (const locale of LOCALES) {
        const products = await listProducts({ countryIso: country.iso2 });
        let any = false;
        for (const product of products) {
          if (await isProductIndexable(product.sku, locale, country.iso2)) {
            any = true;
            break;
          }
        }
        await expect(
          hasIndexableProducts(country.iso2, locale),
          `${country.iso2}/${locale}`,
        ).resolves.toBe(any);
      }
    }
  });

  it("the barrel exposes the predicate and not the term-by-term diagnostic", async () => {
    const barrel = await import("../../src/modules/catalog/index.ts");
    expect(Object.keys(barrel)).toContain("isProductIndexable");
    expect(Object.keys(barrel)).not.toContain("productIndexability");
    expect(Object.keys(barrel)).not.toContain("indexabilityVerdict");
  });
});
