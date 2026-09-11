/**
 * The tier and add-on read API (spec 005 §2 "Tiers and add-ons", §7, §8, §12, AC-19; T-17;
 * TASK-064).
 *
 * Five claims are pinned here, and each is a rule from a plan section or a directive rather than
 * a preference:
 *
 *  1. **An add-on cannot default to selected.** `Addon` has no `defaultSelected` / `preselected`
 *     field (a type-level assertion, so it is a compile failure and not a runtime hope),
 *     `AddonSchema` refuses one at the boundary, and `pnpm catalogue:check`'s
 *     `addon-preselection` mode refuses one in the dataset and in the declaring sources
 *     (`tests/unit/catalogue-check.test.ts`). CRD Art. 22 is discharged **by absence**
 *     (`plan/07` §2.1, AC-19).
 *  2. **Every add-on carries its own VAT rate** for the destination: PL chocolates at 2 300 bp
 *     while PL flowers are 800 bp (`plan/06` §4 item 4, spec 005 §13 Q3, spec 002 §14 A1 (a)).
 *     And no amount: an add-on price is a whole `PricePoint` from `pricing/*` (TASK-065) or it is
 *     nothing, so a partial price is unrepresentable (AC-8).
 *  3. **The preselected tier is data.** `defaultTier()` reads `product_tier.is_default`, so
 *     `plan/04` §16's A/B test #2 ("12 vs 18 stems") is an `isDefault` flip; zero or two defaults
 *     throw rather than being picked silently (spec 002 §14 A1 (b), spec 005 §13 Q6).
 *  4. **Wine is a flag, not a branch.** `addon.wine.{country}` is read through the seam of
 *     `flags.ts`, closed by default, and off in every destination in Phase 0 — `plan/07` §6's
 *     alcohol row. Licensing a country is a row flip, proved here by swapping the provider and
 *     changing no code (spec 005 §12).
 *  5. **A tier has no name and an add-on has no label.** Every string in either read model is a
 *     message key that `messages/en.json` resolves (spec 005 §7, §13 Q4: tier *names* do not
 *     exist).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADDONS,
  addonFlagKey,
} from "../../src/config/catalogue/addons.data.ts";
import {
  ADDON_COUNTRY_PRICES,
  DESTINATION_PRICING,
} from "../../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import {
  addonKeys,
  scopedFlagKey,
} from "../../src/config/catalogue/schemas.ts";
import { PRODUCT_TIERS } from "../../src/config/catalogue/tiers.data.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { CURRENCIES } from "../../src/config/currencies.ts";
import { isFlagEnabled } from "../../src/modules/catalog/flags.ts";
import {
  defaultTier,
  listAddons,
  listTiers,
} from "../../src/modules/catalog/read.ts";
import {
  AddonSchema,
  FORBIDDEN_ADDON_FIELDS,
  ProductTierSchema,
} from "../../src/modules/catalog/schemas.ts";
import type { Addon, Tier } from "../../src/modules/catalog/types.ts";
import { PHASE_0_FLAGS } from "../../src/modules/catalog/static/index.ts";
import messages from "../../messages/en.json" with { type: "json" };

const LIVE = "PL" as const;
const STATIC_MODULE = "../../src/modules/catalog/static/index.ts";

const plPricing = DESTINATION_PRICING.find(
  (destination) => destination.countryIso2 === LIVE,
);

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

/* -------------------------------------------------------------------------- */
/* Type-level assertions — the half of AC-19 a runtime test cannot make.       */
/* -------------------------------------------------------------------------- */

/**
 * `true` only when `T` declares none of the preselection field names. A `never` here is a
 * **typecheck failure** (`pnpm typecheck` covers `tests/`), which is what "adding the field is not
 * possible" has to mean if CRD Art. 22 is discharged by absence rather than by review.
 */
type WithoutFields<T, Fields extends string> = [
  Extract<keyof T, Fields>,
] extends [never]
  ? true
  : never;

const addonCarriesNoPreselectionField: WithoutFields<
  Addon,
  "defaultSelected" | "preselected" | "defaultOn" | "selected" | "checked"
> = true;

/** The same technique for money: a price is a whole `PricePoint` or it is not in the model. */
const addonCarriesNoAmount: WithoutFields<
  Addon,
  "amountMinor" | "retailMinor" | "priceMinor" | "price" | "currency"
> = true;

const tierCarriesNoAmount: WithoutFields<
  Tier,
  "amountMinor" | "retailMinor" | "priceMinor" | "price" | "currency"
> = true;

/* -------------------------------------------------------------------------- */
/* Tiers.                                                                     */
/* -------------------------------------------------------------------------- */

describe("listTiers (spec 005 §2, §13 Q4)", () => {
  it("returns the authored ladder in sort order, as keys and counts only", async () => {
    await expect(listTiers("FO-BQ-001")).resolves.toEqual([
      {
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
      },
      {
        tierKey: "stems_18",
        labelKey: "catalog.tier.stems",
        stems: 18,
        sort: 1,
        isDefault: true,
      },
      {
        tierKey: "stems_24",
        labelKey: "catalog.tier.stems",
        stems: 24,
        sort: 2,
        isDefault: false,
      },
    ]);
  });

  it("carries the five documented fields and no price and no SKU", async () => {
    const [tier] = await listTiers("FO-BQ-001");

    expect(Object.keys(tier ?? {}).sort()).toEqual([
      "isDefault",
      "labelKey",
      "sort",
      "stems",
      "tierKey",
    ]);
    // The read model is per product, so the key is the argument; and the stepped amounts are
    // authored `country_price` rows read by `resolvePrice()` (TASK-065), never a field here.
    expect(Object.keys(tier ?? {})).not.toContain("sku");
    for (const field of Object.keys(tier ?? {})) {
      expect(field, field).not.toMatch(
        /price|amount|minor|currency|vat|percent/i,
      );
    }
  });

  it("labels an S/M/L arrangement and a single plant by key, never by name", async () => {
    const arrangement = PRODUCTS.find(
      (product) => product.productType === "arrangement",
    );
    const plant = PRODUCTS.find((product) => product.productType === "plant");
    expect(arrangement).toBeDefined();
    expect(plant).toBeDefined();
    if (arrangement === undefined || plant === undefined) return;

    const sizes = await listTiers(arrangement.sku);
    const single = await listTiers(plant.sku);

    expect(sizes.map((tier) => tier.tierKey)).toEqual([
      "size_s",
      "size_m",
      "size_l",
    ]);
    expect(sizes.map((tier) => tier.labelKey)).toEqual([
      "catalog.tier.size.s",
      "catalog.tier.size.m",
      "catalog.tier.size.l",
    ]);
    expect(sizes.every((tier) => tier.stems === null)).toBe(true);
    expect(single).toEqual([
      {
        tierKey: "single",
        labelKey: "catalog.tier.single",
        stems: null,
        sort: 0,
        isDefault: true,
      },
    ]);
  });

  it("resolves every label key it can emit against messages/en.json (spec 005 §7)", async () => {
    const keys = new Set<string>();
    for (const product of PRODUCTS) {
      for (const tier of await listTiers(product.sku)) keys.add(tier.labelKey);
    }

    expect(keys.size).toBeGreaterThan(1);
    for (const key of keys) expect(typeof message(key), key).toBe("string");
    // The stem label is an ICU plural, which is why Polish few/many can ever be right (AC-23 is
    // TASK-068's; this pins that the key the dataset points at is the plural one).
    expect(message("catalog.tier.stems")).toContain("plural");
  });

  it("throws on an unknown SKU and on a malformed one, rather than answering `[]`", async () => {
    await expect(listTiers("FO-BQ-999")).rejects.toThrow(
      "is not a product in the catalogue",
    );
    await expect(listTiers("not-a-sku")).rejects.toThrow();
  });

  it("parses every authored ladder through the read boundary", () => {
    for (const tier of PRODUCT_TIERS) {
      expect(
        ProductTierSchema.safeParse({
          tierKey: tier.tierKey,
          labelKey: tier.labelKey,
          stems: tier.stems,
          sort: tier.sort,
          isDefault: tier.isDefault,
        }).success,
        `${tier.sku} ${tier.tierKey}`,
      ).toBe(true);
    }
    // …and refuses a tier that smuggles an amount or drops the preselection.
    expect(
      ProductTierSchema.safeParse({
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
        isDefault: false,
        retailMinor: 14_900,
      }).success,
    ).toBe(false);
    expect(
      ProductTierSchema.safeParse({
        tierKey: "stems_12",
        labelKey: "catalog.tier.stems",
        stems: 12,
        sort: 0,
      }).success,
    ).toBe(false);
  });
});

describe("defaultTier (spec 002 §14 A1 (b), spec 005 §13 Q6)", () => {
  it("is the authored `isDefault` row, so the A/B test is a data change", async () => {
    await expect(defaultTier("FO-BQ-001")).resolves.toMatchObject({
      tierKey: "stems_18",
      stems: 18,
      isDefault: true,
    });
  });

  it("is the middle tier of every seeded product, as authored", async () => {
    for (const product of PRODUCTS) {
      const tiers = await listTiers(product.sku);
      const chosen = await defaultTier(product.sku);
      const middle = tiers[Math.floor((tiers.length - 1) / 2)];

      expect(chosen.tierKey, product.sku).toBe(middle?.tierKey);
    }
  });

  it("throws on zero and on two defaults — never a silent pick", async () => {
    const sku = "FO-BQ-001";
    const cases: readonly [string, boolean][] = [
      ["0 default tiers", false],
      ["3 default tiers", true],
    ];

    for (const [expected, isDefault] of cases) {
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
            tiers: () =>
              Promise.resolve(
                PRODUCT_TIERS.map((tier) =>
                  tier.sku === sku ? { ...tier, isDefault } : tier,
                ),
              ),
          },
        };
      });
      const read = await import("../../src/modules/catalog/read.ts");

      await expect(read.defaultTier(sku)).rejects.toThrow(expected);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Add-ons.                                                                   */
/* -------------------------------------------------------------------------- */

describe("listAddons (spec 005 §2, §8, AC-19, T-17)", () => {
  it("offers the unflagged add-ons of the destination, in listing order", async () => {
    const offered = await listAddons(LIVE);

    // Five of the six: `wine` is flagged and the flag is off in Phase 0 (`plan/07` §6).
    expect(offered.map((addon) => addon.key)).toEqual([
      "chocolates",
      "vase",
      "balloon",
      "plush",
      "card",
    ]);
    expect(offered.map((addon) => addon.sort)).toEqual([0, 1, 2, 3, 5]);
  });

  it("returns `card` even though it is priced 0, so the lines agree (spec 005 §2)", async () => {
    const offered = await listAddons(LIVE);
    const card = ADDON_COUNTRY_PRICES.find(
      (row) => row.addonKey === "card" && row.countryIso2 === LIVE,
    );

    expect(card?.retailMinor).toBe(0);
    expect(offered.map((addon) => addon.key)).toContain("card");
  });

  it("carries every add-on's own `vatRateBp`: PL chocolates 2300, PL flowers 800", async () => {
    const offered = await listAddons(LIVE);
    const chocolates = offered.find((addon) => addon.key === "chocolates");

    expect(plPricing?.flowersVatRateBp).toBe(800);
    expect(plPricing?.standardVatRateBp).toBe(2300);
    expect(chocolates?.vatRateBp).toBe(2300);
    for (const addon of offered) {
      expect(addon.vatRateBp, addon.key).toBe(plPricing?.standardVatRateBp);
      expect(addon.vatRateBp, addon.key).not.toBe(plPricing?.flowersVatRateBp);
    }
  });

  it("carries no preselection field and no amount (CRD Art. 22, AC-8, AC-19)", async () => {
    const offered = await listAddons(LIVE);

    expect(addonCarriesNoPreselectionField).toBe(true);
    expect(addonCarriesNoAmount).toBe(true);
    expect(tierCarriesNoAmount).toBe(true);
    for (const addon of offered) {
      expect(Object.keys(addon).sort()).toEqual([
        "allergenNoteRequired",
        "descriptionKey",
        "flagKey",
        "key",
        "kind",
        "nameKey",
        "partnerOnly",
        "sort",
        "vatRateBp",
      ]);
      for (const field of FORBIDDEN_ADDON_FIELDS) {
        expect(Object.keys(addon), `${addon.key}.${field}`).not.toContain(
          field,
        );
      }
      for (const field of Object.keys(addon)) {
        expect(field, `${addon.key}.${field}`).not.toMatch(
          /amount|minor|price|currency|total/i,
        );
      }
    }
  });

  it("refuses a preselection field at the boundary, in any of its spellings", async () => {
    const [addon] = await listAddons(LIVE);
    expect(addon).toBeDefined();
    if (addon === undefined) return;

    expect(AddonSchema.parse(addon)).toEqual(addon);
    for (const field of FORBIDDEN_ADDON_FIELDS) {
      expect(
        AddonSchema.safeParse({ ...addon, [field]: true }).success,
        field,
      ).toBe(false);
    }
    // A missing rate is a parse error too: "every add-on carries `vatRateBp`" (AC-19).
    const withoutRate: Record<string, unknown> = { ...addon };
    delete withoutRate.vatRateBp;
    expect(AddonSchema.safeParse(withoutRate).success).toBe(false);
    expect(AddonSchema.safeParse({ ...addon, retailMinor: 2500 }).success).toBe(
      false,
    );
  });

  it("keeps the `partnerOnly` seam `cake` needs, and every string a message key", async () => {
    const offered = await listAddons(LIVE);

    // `cake` is `partner_only` and is not seeded in Phase 0 (`plan/10` §1.1, §2.1's six):
    // the field exists so adding it is one row rather than a schema change (spec 005 §2).
    expect(addonKeys).not.toContain("cake");
    for (const addon of offered) {
      expect(typeof addon.partnerOnly, addon.key).toBe("boolean");
      expect(addon.nameKey).toBe(`catalog.addon.${addon.key}.name`);
      expect(addon.descriptionKey).toBe(
        `catalog.addon.${addon.key}.description`,
      );
      expect(typeof message(addon.nameKey), addon.nameKey).toBe("string");
      expect(typeof message(addon.descriptionKey), addon.key).toBe("string");
    }
  });

  it("prices add-ons per destination, and takes no geography but the destination", async () => {
    // The same add-on has its own rate in every destination it is priced for (spec 005 §13 Q3);
    // EU 2018/302's gate is AC-18's whole-module enumeration (TASK-069), and this is its
    // add-on-shaped half: the only argument is the destination.
    const priced = COUNTRIES.filter(
      (country) => country.status === "live" || country.status === "demo",
    );
    expect(priced.length).toBe(DESTINATION_PRICING.length);

    for (const country of priced) {
      const pricing = DESTINATION_PRICING.find(
        (destination) => destination.countryIso2 === country.iso2,
      );
      const offered = await listAddons(country.iso2);

      expect(offered.length, country.iso2).toBe(ADDONS.length - 1);
      for (const addon of offered) {
        expect(addon.vatRateBp, `${country.iso2} ${addon.key}`).toBe(
          pricing?.standardVatRateBp,
        );
      }
    }
    await expect(listAddons("XX" as never)).rejects.toThrow();
  });

  it("throws on two active rows for one (add-on, destination)", async () => {
    const duplicate = ADDON_COUNTRY_PRICES.find(
      (row) => row.addonKey === "vase" && row.countryIso2 === LIVE,
    );
    expect(duplicate).toBeDefined();
    if (duplicate === undefined) return;

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
          addonCountryPrices: () =>
            Promise.resolve([...ADDON_COUNTRY_PRICES, duplicate]),
        },
      };
    });
    const read = await import("../../src/modules/catalog/read.ts");

    await expect(read.listAddons(LIVE)).rejects.toThrow(
      "2 active `addon_country_price` rows",
    );
  });

  it("omits an add-on the destination has no active row for", async () => {
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
          addonCountryPrices: () =>
            Promise.resolve(
              ADDON_COUNTRY_PRICES.filter(
                (row) => !(row.addonKey === "vase" && row.countryIso2 === LIVE),
              ),
            ),
        },
      };
    });
    const read = await import("../../src/modules/catalog/read.ts");

    expect((await read.listAddons(LIVE)).map((addon) => addon.key)).toEqual([
      "chocolates",
      "balloon",
      "plush",
      "card",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* The flag seam (spec 005 §12).                                              */
/* -------------------------------------------------------------------------- */

describe("the `addon.wine.{country}` flag seam", () => {
  afterEach(() => {
    vi.doUnmock(STATIC_MODULE);
    vi.resetModules();
  });

  it("authors one row per configured country, all off in Phase 0 (plan/07 §6)", () => {
    const wine = PHASE_0_FLAGS.filter((flag) =>
      flag.key.startsWith("addon.wine."),
    );
    expect(wine.map((flag) => flag.key)).toEqual(
      COUNTRIES.map((country) =>
        scopedFlagKey("addon.wine", country.iso2),
      ).sort((left, right) => (left < right ? -1 : 1)),
    );
    expect(wine.every((flag) => !flag.enabled)).toBe(true);
    expect(wine.map((flag) => flag.key)).toContain(addonFlagKey("wine", LIVE));
  });

  // The other scope in the table is TASK-067's `currency.{code}` (spec 005 §13 Q11): every
  // configured currency has a row, and only the three we can actually charge are on.
  it("authors one `currency.{code}` row per configured currency, three on", () => {
    const currency = PHASE_0_FLAGS.filter((flag) =>
      flag.key.startsWith("currency."),
    );
    expect(currency).toHaveLength(CURRENCIES.length);
    expect(
      currency.filter((flag) => flag.enabled).map((flag) => flag.key),
    ).toEqual(["currency.EUR", "currency.GBP", "currency.PLN"]);
  });

  it("is closed by default: an absent or unknown key is off, never on", async () => {
    await expect(isFlagEnabled("addon.wine.PL")).resolves.toBe(false);
    await expect(isFlagEnabled("addon.wine.GB")).resolves.toBe(false);
    // `currency.PLN` is on (§13 Q11); a currency nobody enabled — and a key nobody authored —
    // is off, which is what "closed by default" means for this scope.
    await expect(isFlagEnabled("currency.PLN")).resolves.toBe(true);
    await expect(isFlagEnabled("currency.CZK")).resolves.toBe(false);
    await expect(isFlagEnabled("currency.USD")).resolves.toBe(false);
    await expect(isFlagEnabled("not a flag key")).rejects.toThrow();
  });

  it("offers wine where the flag is on — a data flip, with no code change", async () => {
    vi.resetModules();
    vi.doMock(STATIC_MODULE, async () => {
      const actual =
        await vi.importActual<
          typeof import("../../src/modules/catalog/static/index.ts")
        >(STATIC_MODULE);
      return {
        ...actual,
        staticFlagProvider: {
          flags: () =>
            Promise.resolve([
              { key: scopedFlagKey("addon.wine", LIVE), enabled: true },
            ]),
        },
      };
    });
    const read = await import("../../src/modules/catalog/read.ts");
    const offered = await read.listAddons(LIVE);

    expect(offered.map((addon) => addon.key)).toContain("wine");
    expect(offered.find((addon) => addon.key === "wine")?.flagKey).toBe(
      "addon.wine.PL",
    );
    // Every other add-on is unflagged, so nothing else moved.
    expect(
      offered
        .filter((addon) => addon.key !== "wine")
        .every((addon) => addon.flagKey === null),
    ).toBe(true);
  });
});
