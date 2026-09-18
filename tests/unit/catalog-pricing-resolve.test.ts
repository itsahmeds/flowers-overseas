/**
 * Price resolution and dated surcharges (spec 005 §2 "Pricing", §5.2 `pricing/resolve.ts`, §8,
 * AC-8, AC-16; T-06, T-14; TASK-065).
 *
 * This is the compliance content of spec 005, so the tests are shaped as the four claims the spec
 * makes rather than as a walk over the functions:
 *
 *  1. **A price cannot be partial** (AC-8, T-06). `PricePointSchema` refuses
 *     `deliveryIncluded: false` and a net + VAT ≠ gross row (pinned in
 *     `catalog-barrel.test.ts`); here the *other* half is pinned — **no exported function returns
 *     a price type lacking those fields**, as a type-level assertion that fails `pnpm typecheck`
 *     rather than a runtime hope, plus the runtime key set of every price the module hands over.
 *     That is `plan/07` §4's drip-pricing prohibition (CRD Art. 6 as amended by Omnibus, the
 *     Price Indication Directive, the UK DMCC ban) made unexpressible.
 *  2. **Surcharges are dated rows with label keys** (AC-16, T-14). `dateSurcharges()` returns the
 *     Sunday and the 8 Mar 2027 rows with their exact amounts and message keys, so spec 009 can
 *     put the figure on the date chip **before** the date is selected; `resolvePrice()` with that
 *     date has the amount inside `amountMinor`; and a source scan proves there is no multiplier
 *     and no percentage in the surcharge path.
 *  3. **One active row, or a throw.** Zero rows and two rows are data errors, never a silent pick
 *     and never a fake zero (spec 005 §5.2, §5.3) — exercised by swapping the provider, which is
 *     also how the seam is shown to work.
 *  4. **The destination is the only geography.** No pricing signature admits a buyer country, an
 *     IP, a header or a locale (EU 2018/302, ADR-0006; the whole-module enumeration is AC-18 on
 *     TASK-069).
 *
 * Expectations come from the authored dataset's own destination record rather than from
 * transcribed amounts: `tests/fixtures/catalogue.ts` — the shared band/FX/VAT corpus — is
 * TASK-069's file, and inventing a second copy of the ladder here would be the drift that fixture
 * exists to prevent. What *is* written out is the arithmetic (which ladder step, which surcharge,
 * which VAT split), because that is what this task implements.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCT_TIER_GROUPS } from "../../src/config/catalogue/tiers.data.ts";
import {
  DESTINATION_PRICING,
  PRICE_ACTIVE_FROM,
} from "../../src/config/catalogue/prices.data.ts";
import type { CurrencyCode } from "../../src/config/currencies.ts";
import type { CountryPriceRecord } from "../../src/modules/catalog/providers.ts";
import {
  dateSurcharges,
  fromPrice,
  resolvePrice,
  tierPrices,
} from "../../src/modules/catalog/pricing/resolve.ts";
import { addMoney, sumMoney } from "../../src/modules/catalog/pricing/money.ts";
import { netFromGross } from "../../src/modules/catalog/pricing/vat.ts";
import { MAX_SURCHARGE_RANGE_DAYS } from "../../src/modules/catalog/schemas.ts";
import type {
  IntegerMoney,
  PricePoint,
  Surcharge,
  TierPrice,
  VatSplit,
} from "../../src/modules/catalog/types.ts";
import messages from "../../messages/en.json" with { type: "json" };

const LIVE = "PL" as const;
const SKU = "FO-BQ-001" as const;
const STATIC_MODULE = "../../src/modules/catalog/static/index.ts";

/** A Sunday and a Monday in the authored window, plus the two authored peak days. */
const SUNDAY = "2026-10-04";
const MONDAY = "2026-10-05";
const WOMENS_DAY = "2027-03-08";
const VALENTINES = "2027-02-14";

const pl = DESTINATION_PRICING.find(
  (destination) => destination.countryIso2 === LIVE,
);
if (pl === undefined) throw new Error("PL is not a priced destination");

const bouquetTiers =
  PRODUCT_TIER_GROUPS.find((group) => group.sku === SKU)?.tiers ?? [];

/** The authored PL ladder for the bouquet's band, smallest step first. */
const plLadder = pl.ladders.classic ?? [];

/**
 * The destination the **surcharge** cases run against (TASK-120).
 *
 * Poland is the one `live` destination and, since spec 004 §14 A19, a `live` destination with no
 * agreed `country.sunday_delivery` carries no `sunday` row at all — a surcharge for a day nobody
 * has agreed to work is the cutoff fabrication in money. What these cases exercise is the
 * *mechanism* (a dated row, never a multiplier; both rows when a peak day falls on a Sunday; the
 * VAT re-split; the `+sunday@` price version), so they move to a destination that still carries
 * the row. `resolvePrice` reads the destination off the row set, so nothing else in them changes.
 */
const SURCHARGED = "DE" as const;
const de = DESTINATION_PRICING.find(
  (destination) => destination.countryIso2 === SURCHARGED,
);
if (de === undefined) throw new Error("DE is not a priced destination");
/** The authored DE ladder for the bouquet's band, smallest step first. */
const deLadder = de.ladders.classic ?? [];

/* -------------------------------------------------------------------------- */
/* AC-8, the type-level half of T-06.                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every field a whole price carries (spec 005 §5.2 `PricePoint`).
 *
 * `currency` and `priceVersion` are in the list on `/review 47`'s instruction: an amount without
 * its currency is not a price a buyer can be shown (and `Omit<PricePoint, "currency">` would
 * otherwise satisfy this constraint and pass), and a price without its version cannot be traced
 * from a charge back to the row the buyer saw — the two ways a `PricePoint` can be *narrowed* on
 * its way out of the module rather than widened.
 */
interface WholePrice {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly vatRateBp: number;
  readonly vatAmountMinor: number;
  readonly netAmountMinor: number;
  readonly deliveryIncluded: true;
  readonly surcharges: readonly Surcharge[];
  readonly priceVersion: string;
}

/**
 * Every type in `T`'s tree that carries a gross amount **without** being a whole price.
 *
 * Recursion is over arrays and object properties, so a price nested one or more levels down — as
 * in `tierPrices()`'s `{ tierKey, isDefault, price }` — is inspected too. A `never` result means
 * "no partial price is reachable from this return type", which is the exact claim AC-8 makes
 * about the *exported* functions.
 */
type PartialPrices<T> = T extends readonly (infer Element)[]
  ? PartialPrices<Element>
  : T extends object
    ? T extends { readonly amountMinor: number }
      ? T extends WholePrice
        ? never
        : T
      : { [K in keyof T]: PartialPrices<T[K]> }[keyof T]
    : never;

type Asserted<T> = [PartialPrices<T>] extends [never] ? true : never;

/**
 * The four price-producing exports. A compile error on any line is a partial price escaping the
 * module — a `PricePoint` with `deliveryIncluded` widened to `boolean`, a `{ amountMinor,
 * vatRateBp }` summary, an `Offer`-shaped object without its VAT split — and it fails
 * `pnpm typecheck`, which covers `tests/`.
 */
const resolvePriceReturnsAWholePrice: Asserted<
  Awaited<ReturnType<typeof resolvePrice>>
> = true;
const tierPricesReturnWholePrices: Asserted<
  Awaited<ReturnType<typeof tierPrices>>
> = true;
const fromPriceReturnsAWholePrice: Asserted<
  Awaited<ReturnType<typeof fromPrice>>
> = true;
const tierPriceModelIsWhole: Asserted<TierPrice> = true;

/**
 * The guard on the guard: the detector must actually detect. A `PricePoint` with the delivery
 * literal widened, and a hand-rolled "price summary", are both partial prices — if these two
 * lines compiled as `true` the four above would prove nothing.
 */
type DrippedPrice = Omit<PricePoint, "deliveryIncluded"> & {
  readonly deliveryIncluded: boolean;
};
type PriceSummary = { readonly amountMinor: number; readonly currency: "EUR" };

const detectorSeesAWidenedDeliveryFlag: PartialPrices<DrippedPrice> extends never
  ? never
  : true = true;
const detectorSeesABareAmount: PartialPrices<{
  readonly price: PriceSummary;
}> extends never
  ? never
  : true = true;
/** …and an amount that is *not* a price — an `IntegerMoney` — is deliberately caught too. */
const detectorSeesAnAmount: PartialPrices<IntegerMoney> extends never
  ? never
  : true = true;
/** An amount that lost its currency, and one that lost its version: both are partial. */
const detectorSeesAMissingCurrency: PartialPrices<
  Omit<PricePoint, "currency">
> extends never
  ? never
  : true = true;
const detectorSeesAMissingPriceVersion: PartialPrices<
  Omit<PricePoint, "priceVersion">
> extends never
  ? never
  : true = true;
/** A VAT split carries no `amountMinor`, so it is not a price and is not flagged. */
const vatSplitIsNotAPrice: Asserted<readonly VatSplit[]> = true;

/* -------------------------------------------------------------------------- */
/* Provider swapping, for the zero-row and two-row cases.                     */
/* -------------------------------------------------------------------------- */

/**
 * Re-import the pricing module with the `country_price` rows transformed.
 *
 * The mutation is of the *provider's* rows, not of the dataset: the authored dataset cannot hold
 * two active rows (`pnpm catalogue:check` mode `ambiguous-price` refuses it), which is precisely
 * why the ambiguity has to be injected at the seam to be observable at all.
 */
async function withRows(
  transform: (
    rows: readonly CountryPriceRecord[],
  ) => readonly CountryPriceRecord[],
): Promise<typeof import("../../src/modules/catalog/pricing/resolve.ts")> {
  vi.resetModules();
  vi.doMock(STATIC_MODULE, async () => {
    const actual =
      await vi.importActual<
        typeof import("../../src/modules/catalog/static/index.ts")
      >(STATIC_MODULE);
    return {
      ...actual,
      staticPriceProvider: {
        ...actual.staticPriceProvider,
        countryPrices: async () =>
          transform(await actual.staticPriceProvider.countryPrices()),
      },
    };
  });
  return import("../../src/modules/catalog/pricing/resolve.ts");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(STATIC_MODULE);
});

/* -------------------------------------------------------------------------- */
/* resolvePrice.                                                              */
/* -------------------------------------------------------------------------- */

describe("resolvePrice: the whole price of a tier in a destination (AC-8, T-06)", () => {
  it("returns the authored ladder step, all-in, with its VAT split", async () => {
    const step = plLadder[0];
    if (step === undefined) throw new Error("no authored PL ladder");
    const { netMinor, vatMinor } = netFromGross(step, pl.flowersVatRateBp);

    await expect(
      resolvePrice({
        productId: SKU,
        tierKey: "stems_12",
        countryIso: LIVE,
      }),
    ).resolves.toEqual({
      amountMinor: step,
      currency: pl.currency,
      vatRateBp: pl.flowersVatRateBp,
      vatAmountMinor: vatMinor,
      netAmountMinor: netMinor,
      deliveryIncluded: true,
      surcharges: [],
      activeFrom: PRICE_ACTIVE_FROM,
      activeTo: null,
      priceVersion: `cp:${SKU}:${LIVE}:stems_12:${PRICE_ACTIVE_FROM}`,
    });
  });

  it("carries exactly the `PricePoint` field set, so no consumer can render a partial price", async () => {
    const price = await resolvePrice({
      productId: SKU,
      tierKey: "stems_18",
      countryIso: LIVE,
    });

    expect(Object.keys(price).sort()).toEqual(
      [
        "activeFrom",
        "activeTo",
        "amountMinor",
        "currency",
        "deliveryIncluded",
        "netAmountMinor",
        "priceVersion",
        "surcharges",
        "vatAmountMinor",
        "vatRateBp",
      ].sort(),
    );
    expect(price.deliveryIncluded).toBe(true);
    expect(price.netAmountMinor + price.vatAmountMinor).toBe(price.amountMinor);
    expect(resolvePriceReturnsAWholePrice).toBe(true);
    expect(tierPricesReturnWholePrices).toBe(true);
    expect(fromPriceReturnsAWholePrice).toBe(true);
    expect(tierPriceModelIsWhole).toBe(true);
    expect(vatSplitIsNotAPrice).toBe(true);
    for (const detected of [
      detectorSeesAWidenedDeliveryFlag,
      detectorSeesABareAmount,
      detectorSeesAnAmount,
      detectorSeesAMissingCurrency,
      detectorSeesAMissingPriceVersion,
    ]) {
      expect(detected).toBe(true);
    }
  });

  it("prices in the destination's own currency, never a buyer's", async () => {
    const price = await resolvePrice({
      productId: SKU,
      tierKey: "stems_12",
      countryIso: LIVE,
    });

    expect(price.currency).toBe("PLN");
  });

  it("refuses a buyer country, an IP, a locale or any other geography (EU 2018/302)", async () => {
    for (const rejected of [
      { buyerCountry: "GB" },
      { ipAddress: "203.0.113.9" },
      { locale: "en-gb" },
      { visitorCountry: "DE" },
      { geo: "GB" },
    ]) {
      await expect(
        resolvePrice({
          productId: SKU,
          tierKey: "stems_12",
          countryIso: LIVE,
          ...rejected,
        } as Parameters<typeof resolvePrice>[0]),
      ).rejects.toThrow();
    }
  });

  it("refuses an unknown SKU, an unknown tier and a non-destination", async () => {
    await expect(
      resolvePrice({ productId: SKU, tierKey: "stems_99", countryIso: LIVE }),
    ).rejects.toThrow(/no active `country_price` row/);
    await expect(
      resolvePrice({
        productId: "FO-BQ-999",
        tierKey: "stems_12",
        countryIso: LIVE,
      }),
    ).rejects.toThrow(/no active `country_price` row/);
    await expect(
      resolvePrice({
        productId: SKU,
        tierKey: "stems_12",
        countryIso: "GB" as typeof LIVE,
      }),
    ).rejects.toThrow();
  });

  it("throws on two active rows rather than picking one (spec 005 §5.2)", async () => {
    const pricing = await withRows((rows) => {
      const row = rows.find(
        (candidate) =>
          candidate.sku === SKU &&
          candidate.countryIso2 === LIVE &&
          candidate.tierKey === "stems_12" &&
          candidate.surchargeKind === null &&
          candidate.activeTo === null,
      );
      if (row === undefined) throw new Error("no retail row to duplicate");
      return [...rows, { ...row, retailMinor: row.retailMinor + 1000 }];
    });

    await expect(
      pricing.resolvePrice({
        productId: SKU,
        tierKey: "stems_12",
        countryIso: LIVE,
      }),
    ).rejects.toThrow(/2 active `country_price` rows/);
  });

  it("throws on zero active rows rather than returning a fake zero", async () => {
    const pricing = await withRows((rows) =>
      rows.filter(
        (row) =>
          !(
            row.sku === SKU &&
            row.countryIso2 === LIVE &&
            row.tierKey === "stems_12" &&
            row.surchargeKind === null
          ),
      ),
    );

    await expect(
      pricing.resolvePrice({
        productId: SKU,
        tierKey: "stems_12",
        countryIso: LIVE,
      }),
    ).rejects.toThrow(/no active `country_price` row/);
  });

  it("ignores a superseded row and prices from the active one", async () => {
    const pricing = await withRows((rows) => {
      const row = rows.find(
        (candidate) =>
          candidate.sku === SKU &&
          candidate.countryIso2 === LIVE &&
          candidate.tierKey === "stems_12" &&
          candidate.surchargeKind === null &&
          candidate.activeTo === null,
      );
      if (row === undefined) throw new Error("no retail row to supersede");
      return [
        ...rows,
        {
          ...row,
          retailMinor: row.retailMinor - 1000,
          activeFrom: "2026-08-01",
          activeTo: PRICE_ACTIVE_FROM,
        },
      ];
    });

    const price = await pricing.resolvePrice({
      productId: SKU,
      tierKey: "stems_12",
      countryIso: LIVE,
    });

    expect(price.amountMinor).toBe(plLadder[0]);
    expect(price.activeTo).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Surcharges (AC-16, T-14).                                                  */
/* -------------------------------------------------------------------------- */

describe("dateSurcharges: the amount on the date chip before selection (AC-16, T-14)", () => {
  it("returns the Sunday row with its amount and its message key", async () => {
    const found = await dateSurcharges(SURCHARGED, {
      from: SUNDAY,
      to: SUNDAY,
    });

    expect(found).toEqual([
      {
        kind: "sunday",
        amountMinor: de.sundaySurchargeMinor,
        currency: de.currency,
        // The Sunday row is open-ended, so the window it reports is the delivery day itself:
        // "this amount applies on this day" is what the date chip states, and the row's own
        // September start date would be a date no buyer can pick.
        appliesFrom: SUNDAY,
        appliesTo: SUNDAY,
        labelKey: "catalog.surcharge.sunday",
        date: SUNDAY,
      },
    ]);
  });

  it("returns nothing for a Monday", async () => {
    await expect(
      dateSurcharges(LIVE, { from: MONDAY, to: MONDAY }),
    ).resolves.toEqual([]);
  });

  it("returns the peak-day row for 8 Mar 2027 and for 14 Feb 2027", async () => {
    for (const date of [WOMENS_DAY, VALENTINES]) {
      const found = await dateSurcharges(LIVE, { from: date, to: date });
      const peak = found.find((entry) => entry.kind === "peak_day");

      expect(peak, date).toMatchObject({
        kind: "peak_day",
        amountMinor: pl.peakDaySurchargeMinor,
        currency: pl.currency,
        labelKey: "catalog.surcharge.peakDay",
        date,
      });
      // The window is the named day itself, stated inclusively for a caller to render.
      expect(peak?.appliesFrom, date).toBe(date);
      expect(peak?.appliesTo, date).toBe(date);
    }
  });

  it("reports both surcharges when a peak day falls on a Sunday", async () => {
    // 14 Feb 2027 is a Sunday: a buyer choosing it pays both authored rows, and the chip has to
    // show both amounts *before* the date is picked (`plan/07` §4).
    const found = await dateSurcharges(SURCHARGED, {
      from: VALENTINES,
      to: VALENTINES,
    });

    expect(found.map((entry) => entry.kind)).toEqual(["peak_day", "sunday"]);
  });

  it("enumerates a range one entry per (date, surcharge), in date order", async () => {
    const found = await dateSurcharges(SURCHARGED, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    const dates = found.map((entry) => entry.date);

    // The four Sundays of October 2026 — 4, 11, 18, 25 — and no other day carries a surcharge.
    expect(dates).toEqual([
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
    ]);
    expect(new Set(found.map((entry) => entry.kind))).toEqual(
      new Set(["sunday"]),
    );
    expect([...dates].sort()).toEqual(dates);
  });

  it("carries a label key that `messages/en.json` resolves, never a label", async () => {
    const found = await dateSurcharges(LIVE, { from: SUNDAY, to: WOMENS_DAY });

    expect(found.length).toBeGreaterThan(0);
    for (const entry of found) {
      expect(typeof message(entry.labelKey), entry.labelKey).toBe("string");
    }
  });

  it("refuses an inverted range, a non-date and a range past the cap", async () => {
    await expect(
      dateSurcharges(LIVE, { from: MONDAY, to: SUNDAY }),
    ).rejects.toThrow();
    await expect(
      dateSurcharges(LIVE, { from: "04/10/2026", to: "04/10/2026" }),
    ).rejects.toThrow();
    await expect(
      dateSurcharges(LIVE, { from: "2026-01-01", to: "2027-12-31" }),
    ).rejects.toThrow(new RegExp(String(MAX_SURCHARGE_RANGE_DAYS)));
  });

  it("throws when two products disagree about a destination's surcharge amount", async () => {
    const pricing = await withRows((rows) =>
      rows.map((row) =>
        row.countryIso2 === SURCHARGED &&
        row.surchargeKind === "sunday" &&
        row.sku === "FO-BQ-002"
          ? { ...row, retailMinor: row.retailMinor + 500 }
          : row,
      ),
    );

    await expect(
      pricing.dateSurcharges(SURCHARGED, { from: SUNDAY, to: SUNDAY }),
    ).rejects.toThrow(/one amount per destination/);
  });
});

describe("resolvePrice includes the date's surcharges in the amount (AC-16)", () => {
  it("adds the Sunday row to the ladder step and re-splits the VAT", async () => {
    const step = deLadder[1];
    if (step === undefined) throw new Error("no authored DE ladder");
    const gross = addMoney(
      { amountMinor: step, currency: de.currency },
      { amountMinor: de.sundaySurchargeMinor, currency: de.currency },
    );
    const { netMinor, vatMinor } = netFromGross(
      gross.amountMinor,
      de.flowersVatRateBp,
    );

    const price = await resolvePrice({
      productId: SKU,
      tierKey: "stems_18",
      countryIso: SURCHARGED,
      deliveryDate: SUNDAY,
    });

    expect(price.amountMinor).toBe(gross.amountMinor);
    expect(price.netAmountMinor).toBe(netMinor);
    expect(price.vatAmountMinor).toBe(vatMinor);
    expect(price.surcharges.map((surcharge) => surcharge.kind)).toEqual([
      "sunday",
    ]);
    expect(price.priceVersion).toContain("+sunday@");
  });

  it("adds both rows when a peak day falls on a Sunday, and neither on a plain Monday", async () => {
    const step = deLadder[0];
    if (step === undefined) throw new Error("no authored DE ladder");
    const both = await resolvePrice({
      productId: SKU,
      tierKey: "stems_12",
      countryIso: SURCHARGED,
      deliveryDate: VALENTINES,
    });
    const plain = await resolvePrice({
      productId: SKU,
      tierKey: "stems_12",
      countryIso: SURCHARGED,
      deliveryDate: MONDAY,
    });

    expect(both.amountMinor).toBe(
      sumMoney([
        { amountMinor: step, currency: de.currency },
        { amountMinor: de.sundaySurchargeMinor, currency: de.currency },
        { amountMinor: de.peakDaySurchargeMinor, currency: de.currency },
      ]).amountMinor,
    );
    expect(plain.amountMinor).toBe(step);
    expect(plain.surcharges).toEqual([]);
  });

  it("keeps the surcharge legible on the price: amount, dates and label key", async () => {
    const price = await resolvePrice({
      productId: SKU,
      tierKey: "stems_12",
      countryIso: LIVE,
      deliveryDate: WOMENS_DAY,
    });
    const [surcharge] = price.surcharges;

    expect(surcharge).toMatchObject({
      kind: "peak_day",
      amountMinor: pl.peakDaySurchargeMinor,
      currency: pl.currency,
      labelKey: "catalog.surcharge.peakDay",
      appliesFrom: WOMENS_DAY,
      appliesTo: WOMENS_DAY,
    });
  });
});

describe("no multiplier or percentage in the surcharge path (AC-16, T-14)", () => {
  const sources = [
    "src/modules/catalog/pricing/resolve.ts",
    "src/modules/catalog/pricing/money.ts",
    "src/config/catalogue/prices.data.ts",
  ] as const;

  it("multiplies no amount by a rate, a factor or a percentage", () => {
    for (const file of sources) {
      const code = sourceOf(file);

      // A multiplier on a surcharge would read as `× amount`, `× rate`, `× factor`,
      // `× percent`/`Pct`, or a decimal literal such as `1.04`.
      expect(code, file).not.toMatch(/[Mm]inor\s*\*\s*(?!1\b)/);
      expect(code, file).not.toMatch(/\*\s*(?:surcharge|multiplier|factor)/i);
      expect(code, file).not.toMatch(/(?:percent|pct|multiplier)/i);
    }
  });

  it("names the surcharge as rows with dates and a label key, in one map", () => {
    const code = sourceOf("src/modules/catalog/pricing/resolve.ts");

    expect(code).toContain("catalog.surcharge.sunday");
    expect(code).toContain("catalog.surcharge.peakDay");
    // The one multiplication in the pricing core is the VAT rate's, and it is in `vat.ts`.
    expect(sourceOf("src/modules/catalog/pricing/vat.ts")).toContain(
      "divideMinorHalfUp",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* tierPrices and fromPrice.                                                  */
/* -------------------------------------------------------------------------- */

describe("tierPrices and fromPrice (spec 005 §5.2, §6)", () => {
  it("prices every authored tier in ladder order, with the preselection marked", async () => {
    const prices = await tierPrices({ productId: SKU, countryIso: LIVE });

    expect(prices.map((entry) => entry.tierKey)).toEqual(
      bouquetTiers.map((tier) => tier.tierKey),
    );
    expect(prices.map((entry) => entry.price.amountMinor)).toEqual([
      ...plLadder,
    ]);
    expect(prices.filter((entry) => entry.isDefault)).toHaveLength(1);
    for (const entry of prices) {
      expect(entry.price.deliveryIncluded).toBe(true);
      expect(entry.price.netAmountMinor + entry.price.vatAmountMinor).toBe(
        entry.price.amountMinor,
      );
    }
  });

  it("prices every tier with the delivery date's surcharge", async () => {
    const prices = await tierPrices({
      productId: SKU,
      countryIso: SURCHARGED,
      deliveryDate: SUNDAY,
    });

    for (const [index, entry] of prices.entries()) {
      expect(entry.price.amountMinor).toBe(
        (deLadder[index] ?? 0) + de.sundaySurchargeMinor,
      );
    }
  });

  it("hands back the cheapest tier's whole price as the `from` figure", async () => {
    const cheapest = await fromPrice({ productId: SKU, countryIso: LIVE });

    expect(cheapest.amountMinor).toBe(plLadder[0]);
    expect(cheapest.deliveryIncluded).toBe(true);
    expect(cheapest.surcharges).toEqual([]);
  });

  it("takes no delivery date on a `from` figure and no currency anywhere", () => {
    // A "from" price with a Sunday surcharge in it would be the price of a configuration the
    // card does not describe (spec 005 §6); a currency override would be a second price (AC-9,
    // whose gate is TASK-068's `priceTable`).
    const signatures = sourceOf("src/modules/catalog/pricing/resolve.ts");

    expect(signatures).not.toMatch(/fromPrice[\s\S]{0,200}deliveryDate/);
    expect(signatures).not.toMatch(/displayCurrency|currencyOverride/);
  });

  it("throws for a product with no tiers rather than answering an empty ladder", async () => {
    await expect(
      tierPrices({ productId: "FO-BQ-999", countryIso: LIVE }),
    ).rejects.toThrow();
    await expect(
      fromPrice({ productId: "FO-BQ-999", countryIso: LIVE }),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */

function sourceOf(file: string): string {
  return readFileSync(resolvePath(__dirname, "../..", file), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    "",
  );
}

/** A dotted key resolved against the committed `en` catalogue, or `undefined`. */
function message(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      messages,
    );
}
