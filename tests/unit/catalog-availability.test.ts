/**
 * Availability, the data-flip proof and the two date seams (spec 005 §2 "Availability", §3,
 * AC-20, T-18; TASK-068).
 *
 * The centre of this file is one assertion made twice with different **data**: the same
 * `availability()` call, against a `demo` destination and against a `live` one, returns
 * `saleable: false` / `catalog.availability.countryDemo` and `InStock` / `saleable: true` — with
 * no branch, no flag and no code path in between. That is `CLAUDE.md`'s "country go-live is a
 * data flip in admin, never a code change" as a test rather than as an intention, and it is why
 * the demo and live cases below are driven from a table rather than written twice.
 *
 * The second thing it pins is an **absence**: spec 005 owns no calendar (`plan/03` §9/§10, spec
 * 005 §3), so `availability.ts` is scanned for the date arithmetic that must not be in it, and
 * `staticCutoffEvaluator` is checked to answer from its authored table rather than to compute.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import {
  availability,
  staticCutoffEvaluator,
  type FulfilmentCoverage,
} from "../../src/modules/catalog/availability.ts";
import { catalogAvailabilityKeys } from "../../src/modules/catalog/types.ts";

const STATIC_MODULE = "../../src/modules/catalog/static/index.ts";
const LIVE = "PL" as const;
const DEMO = "DE" as const;
const SKU = "FO-BQ-001" as const;

/** A florist covers nothing: the seam spec 016's routing fills (`partner_coverage`). */
const coversNothing: FulfilmentCoverage = {
  covers: () => Promise.resolve(false),
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(STATIC_MODULE);
});

/* -------------------------------------------------------------------------- */
/* AC-20: the data flip.                                                      */
/* -------------------------------------------------------------------------- */

describe("availability() is derived from data (AC-20, T-18)", () => {
  it("is the same call with two datasets: `demo` refuses, `live` sells", async () => {
    const cases = [
      {
        countryIso: DEMO,
        expected: {
          schemaAvailability: "OutOfStock",
          reasonKey: catalogAvailabilityKeys.countryDemo,
          saleable: false,
        },
      },
      {
        countryIso: LIVE,
        expected: {
          schemaAvailability: "InStock",
          reasonKey: catalogAvailabilityKeys.inStock,
          saleable: true,
        },
      },
    ] as const;

    for (const { countryIso, expected } of cases) {
      await expect(
        availability({ productId: SKU, countryIso }),
        countryIso,
      ).resolves.toEqual(expected);
    }
  });

  it("answers by `country.status` for every configured destination, with no branch per country", async () => {
    for (const country of COUNTRIES) {
      const state = await availability({
        productId: SKU,
        countryIso: country.iso2,
      });
      expect(state.saleable, country.iso2).toBe(country.status === "live");
      expect(state.reasonKey, country.iso2).toBe(
        country.status === "live"
          ? catalogAvailabilityKeys.inStock
          : catalogAvailabilityKeys.countryDemo,
      );
    }
  });

  it("puts a `disabled` destination in the same state as a `demo` one (`/review 54`)", async () => {
    // `country.status` has three values and `availability()` has two branches, deliberately:
    // "we cannot send flowers there" is the whole of what a buyer needs, and `disabled` is an
    // operational fact about us (spec 005 §14 A4). No destination is authored `disabled`, so the
    // branch is only reachable through the registry — which is exactly what is mocked here, so
    // the day spec 012 can flip one this test says what happens.
    vi.resetModules();
    vi.doMock("../../src/config/countries.ts", async () => {
      const actual = await vi.importActual<
        typeof import("../../src/config/countries.ts")
      >("../../src/config/countries.ts");
      return {
        ...actual,
        countryConfig: (iso2: string) =>
          iso2 === LIVE
            ? { ...actual.countryConfig(LIVE), status: "disabled" }
            : actual.countryConfig(iso2 as typeof LIVE),
      };
    });
    const { availability: withDisabled } =
      await import("../../src/modules/catalog/availability.ts");

    await expect(
      withDisabled({ productId: SKU, countryIso: LIVE }),
    ).resolves.toEqual({
      schemaAvailability: "OutOfStock",
      reasonKey: catalogAvailabilityKeys.countryDemo,
      saleable: false,
    });
    vi.doUnmock("../../src/config/countries.ts");
  });

  it("is `OutOfStock`/`noPartner` when no florist covers the destination", async () => {
    await expect(
      availability({
        productId: SKU,
        countryIso: LIVE,
        coverage: coversNothing,
      }),
    ).resolves.toEqual({
      schemaAvailability: "OutOfStock",
      reasonKey: catalogAvailabilityKeys.noPartner,
      saleable: false,
    });
  });

  it("is `OutOfStock` for a retired product, live destination or not", async () => {
    vi.resetModules();
    vi.doMock(STATIC_MODULE, async () => {
      const actual =
        await vi.importActual<
          typeof import("../../src/modules/catalog/static/index.ts")
        >(STATIC_MODULE);
      return {
        ...actual,
        staticCatalogueProvider: {
          ...actual.staticCatalogueProvider,
          products: () =>
            Promise.resolve(
              PRODUCTS.map((product) =>
                product.sku === SKU
                  ? { ...product, status: "retired" as const }
                  : product,
              ),
            ),
        },
      };
    });
    const reloaded = await import("../../src/modules/catalog/availability.ts");

    await expect(
      reloaded.availability({ productId: SKU, countryIso: LIVE }),
    ).resolves.toEqual({
      schemaAvailability: "OutOfStock",
      reasonKey: catalogAvailabilityKeys.outOfStock,
      saleable: false,
    });
  });

  it("is `OutOfStock` when the destination has no active price row", async () => {
    vi.resetModules();
    vi.doMock(STATIC_MODULE, async () => {
      const actual =
        await vi.importActual<
          typeof import("../../src/modules/catalog/static/index.ts")
        >(STATIC_MODULE);
      const rows = await actual.staticPriceProvider.countryPrices();
      return {
        ...actual,
        staticPriceProvider: {
          ...actual.staticPriceProvider,
          countryPrices: () =>
            Promise.resolve(rows.filter((row) => row.sku !== SKU)),
        },
      };
    });
    const reloaded = await import("../../src/modules/catalog/availability.ts");

    await expect(
      reloaded.availability({ productId: SKU, countryIso: LIVE }),
    ).resolves.toMatchObject({
      reasonKey: catalogAvailabilityKeys.outOfStock,
      saleable: false,
    });
  });

  it("throws for a SKU the catalogue does not have, rather than reporting it out of stock", async () => {
    await expect(
      availability({ productId: "FO-BQ-999", countryIso: LIVE }),
    ).rejects.toThrow("not a product in the catalogue");
  });

  it("refuses a buyer-shaped parameter and an unconfigured destination (AC-18)", async () => {
    await expect(
      availability({
        productId: SKU,
        countryIso: LIVE,
        buyerCountry: "FR",
      } as unknown as { productId: string; countryIso: typeof LIVE }),
    ).rejects.toThrow();
    await expect(
      availability({
        productId: SKU,
        countryIso: "US" as unknown as typeof LIVE,
      }),
    ).rejects.toThrow();
  });

  it("every reason key it can return has a string in `messages/en.json` (AC-22)", () => {
    const messages = JSON.parse(
      readFileSync(resolvePath(process.cwd(), "messages/en.json"), "utf8"),
    ) as { catalog: { availability: Record<string, string> } };

    for (const key of Object.values(catalogAvailabilityKeys)) {
      const leaf = key.split(".").at(-1) ?? "";
      expect(messages.catalog.availability[leaf], key).toBeTruthy();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The date seams: declared, not implemented (spec 005 §3, plan/03 §9/§10).    */
/* -------------------------------------------------------------------------- */

describe("005 owns no calendar (spec 005 §3, T-18)", () => {
  /** The file's **code**, with every comment removed: the prohibition is on what it does. */
  const source = readFileSync(
    resolvePath(process.cwd(), "src/modules/catalog/availability.ts"),
    "utf8",
  )
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/\/\/.*$/gmu, "");

  it("does no date arithmetic, evaluates no holiday and resolves no time zone", () => {
    for (const forbidden of [
      "Date.UTC",
      "getUTCDay",
      "getDay",
      "setDate",
      "Date.now",
      "Intl.DateTimeFormat",
      "toISOString",
      "holiday",
      "occasion",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("a delivery date changes no verdict here: a date answer without a calendar is a guess", async () => {
    const withoutDate = await availability({
      productId: SKU,
      countryIso: LIVE,
    });
    for (const date of ["2027-02-14", "2027-03-08", "2026-12-25"]) {
      await expect(
        availability({ productId: SKU, countryIso: LIVE, date }),
        date,
      ).resolves.toEqual(withoutDate);
    }
  });

  it("`staticCutoffEvaluator` answers from its authored table and computes nothing", async () => {
    const cutoff = { localTime: "14:00", timeZone: "Europe/Warsaw" } as const;
    const evaluator = staticCutoffEvaluator({
      dates: ["2027-02-16", "2027-02-12", "2027-02-12"],
      cutoff,
    });

    await expect(
      evaluator.isDateAvailable({ countryIso: LIVE, date: "2027-02-12" }),
    ).resolves.toBe(true);
    // A Sunday between the two authored days is *not* inferred to be available: the schedule is
    // the authored set, and weekly rules are spec 009's.
    await expect(
      evaluator.isDateAvailable({ countryIso: LIVE, date: "2027-02-14" }),
    ).resolves.toBe(false);
    await expect(
      evaluator.nextAvailableDate({ countryIso: LIVE, from: "2027-02-13" }),
    ).resolves.toBe("2027-02-16");
    await expect(
      evaluator.nextAvailableDate({ countryIso: LIVE, from: "2027-03-01" }),
    ).resolves.toBeNull();
    await expect(
      evaluator.cutoffFor({ countryIso: LIVE, date: "2027-02-12" }),
    ).resolves.toEqual(cutoff);
    await expect(
      evaluator.cutoffFor({ countryIso: LIVE, date: "2027-02-14" }),
    ).resolves.toBeNull();
  });
});
