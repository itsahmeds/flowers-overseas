/**
 * The geo-blocking gate (spec 005 §2 "Read-side API, caching, boundaries", §8, AC-18, T-16;
 * TASK-069).
 *
 * EU 2018/302 forbids a price that depends on where the *buyer* is; ADR-0006 forbids acting on an
 * inferred location at all. Spec 005 §8 makes the claim structural rather than reviewed: "there is
 * no buyer-country dimension in the dataset, in `country_price` or in any function, so *a French
 * and a German buyer sending to Warsaw see the same price* is a property of the type system".
 *
 * This file is that property, enforced in three parts:
 *
 *  1. **The barrel's whole type surface is clean.** Every export of `src/modules/catalog`, every
 *     call signature, every parameter, and every property of every type reachable from them —
 *     enumerated through the TypeScript checker (`tests/unit/support/type-surface.ts`), not by
 *     grep, because the interesting offence is a parameter typed as an interface that carries
 *     `buyerCountry` three levels down and is spelled nowhere in the module.
 *  2. **The scanner bites.** The same analyser over `tests/fixtures/catalog/geo-buyer-surface.ts`
 *     — the same API as the regulation forbids it — must find every offence in it. Without this a
 *     green result would only prove the analyser ran.
 *  3. **The dataset carries no buyer-keyed dimension.** Every key of every authored record, and
 *     the declared surface of `src/config/catalogue/schemas.ts`, are checked against the same
 *     pattern: a price row keyed on the buyer would make the module's clean signatures moot.
 *
 * The pattern is AC-18's, verbatim: `/buyer(Country|Location)?|ipAddress|geo|visitor/i`.
 */
import { describe, expect, it } from "vitest";

import { ADDONS } from "../../src/config/catalogue/addons.data.ts";
import { CATEGORIES } from "../../src/config/catalogue/categories.data.ts";
import { FX_SNAPSHOT } from "../../src/config/catalogue/fx.data.ts";
import { OCCASIONS } from "../../src/config/catalogue/occasions.data.ts";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
  DESTINATION_PRICING,
} from "../../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import { PRODUCT_TIERS } from "../../src/config/catalogue/tiers.data.ts";

import { typeSurfaceOf } from "./support/type-surface.ts";

/** AC-18's pattern. Anchored nowhere: a substring match is the point. */
const BUYER_DIMENSION = /buyer(Country|Location)?|ipAddress|geo|visitor/i;

const BARREL = "src/modules/catalog/index.ts";
const DATASET_SCHEMAS = "src/config/catalogue/schemas.ts";
const CONTROL = "tests/fixtures/catalog/geo-buyer-surface.ts";

/** Every key at every depth of an authored dataset value. */
function keysOf(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into);
    return into;
  }
  if (value === null || typeof value !== "object") return into;
  for (const [key, nested] of Object.entries(value)) {
    into.add(key);
    keysOf(nested, into);
  }
  return into;
}

describe("no pricing function knows where the buyer is (AC-18, T-16)", () => {
  const surface = typeSurfaceOf(BARREL);

  it("loaded a real type surface, so an empty result cannot pass for a clean one", () => {
    // The failure this guards against is a resolution error turning every parameter into `any`.
    expect(surface.exports.length).toBeGreaterThan(50);
    expect(surface.names.size).toBeGreaterThan(80);
    expect(surface.budgetLeft).toBeGreaterThan(0);
    // Names that must be there: the destination geography the module *is* allowed to know.
    for (const expected of ["countryIso", "tierKey", "productId", "currency"]) {
      expect([...surface.names], expected).toContain(expected);
    }
  });

  it("has no parameter or property matching the buyer/IP/geo pattern", () => {
    const offences = [...surface.names]
      .filter((name) => BUYER_DIMENSION.test(name))
      .sort();

    expect(offences).toEqual([]);
  });

  it("finds every offence in the control, so a green barrel means something", () => {
    const control = typeSurfaceOf(CONTROL);
    const offences = [...control.names]
      .filter((name) => BUYER_DIMENSION.test(name))
      .sort();

    // One from a parameter name, one from a bare parameter, two properties down (`visitor`,
    // then its `ipAddress`), and one behind a type alias on the return type.
    expect(offences).toEqual([
      "buyer",
      "buyerCountry",
      "geo",
      "ipAddress",
      "visitor",
    ]);
  });

  it("carries no buyer-keyed dimension in the authored dataset", () => {
    const keys = new Set<string>();
    for (const dataset of [
      PRODUCTS,
      PRODUCT_TIERS,
      CATEGORIES,
      OCCASIONS,
      ADDONS,
      COUNTRY_PRICES,
      ADDON_COUNTRY_PRICES,
      DESTINATION_PRICING,
      FX_SNAPSHOT,
    ]) {
      keysOf(dataset, keys);
    }

    expect(keys.size).toBeGreaterThan(20);
    expect([...keys].filter((key) => BUYER_DIMENSION.test(key))).toEqual([]);
  });

  it("declares no buyer-keyed dimension in the dataset's own schemas", () => {
    const dataset = typeSurfaceOf(DATASET_SCHEMAS);

    expect(dataset.names.size).toBeGreaterThan(20);
    expect(
      [...dataset.names].filter((name) => BUYER_DIMENSION.test(name)),
    ).toEqual([]);
  });
});
