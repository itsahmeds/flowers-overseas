/**
 * The draft's quote with an injected clock (spec 010 §2 "Money", §5.2 `pricing.ts`, AC-17, T-17;
 * AC-11's arithmetic half; TASK-203).
 *
 * Every case builds a draft in memory with a real spec 005 quote (the committed dataset, the real
 * signing path) and moves the clock: fresh → used as is; expired and the same → reissued with no
 * notice; changed → the notice names both amounts; tampered → discarded and re-derived. The draft
 * service and the actions that store these verdicts are covered against Postgres in
 * `tests/integration/checkout-draft.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";
import {
  addonPriceProjection,
  listAddons,
  listProducts,
  listTiers,
  priceProjection,
  quote,
  type Quote,
} from "@/modules/catalog";
import {
  ADDON_TIER_PREFIX,
  type Draft,
  deriveQuote,
  draftTotals,
  priceChange,
  verifyDraftQuote,
} from "@/modules/checkout";

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const minutes = (n: number): Date => new Date(T0.getTime() + n * 60_000);

const [product] = await listProducts({ countryIso: "PL" });
if (product === undefined) throw new Error("the dataset prices nothing for PL");
const SKU = product.sku;
const TIERS_ALL = await listTiers(SKU);
const [TIER] = TIERS_ALL;
if (TIER === undefined) throw new Error(`${SKU} has no tier`);
const ADDONS = await listAddons("PL");
const [ADDON] = ADDONS;
if (ADDON === undefined) throw new Error("PL offers no add-on");

function draftWith(
  signed: Quote | null,
  addonKeys: readonly string[] = [],
): Draft {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    locale: "pl",
    countryIso: "PL",
    sku: SKU,
    tierKey: TIER?.tierKey ?? "",
    deliveryDate: null,
    addonKeys,
    recipient: null,
    buyer: null,
    card: null,
    quote: signed,
    expected: null,
    confirmed:
      signed === null
        ? null
        : { amountMinor: signed.totalMinor, currency: signed.currency },
    mode: "demo",
    stepsCompleted: 0,
    orderId: null,
    lastActivityAt: T0,
    expiresAt: minutes(24 * 60),
    quoteStamp: signed?.digest ?? null,
  };
}

const selection = (addonKeys: readonly string[] = []) => ({
  locale: "pl" as const,
  countryIso: "PL" as const,
  sku: SKU,
  tierKey: TIER.tierKey,
  deliveryDate: null,
  addonKeys,
});

/** A correctly signed quote for this selection at an amount the provider does not give. */
async function signedAtWrongAmount(at: Date, delta: number): Promise<Quote> {
  const projection = await priceProjection("pl", {
    productId: SKU,
    tierKey: TIER?.tierKey ?? "",
    countryIso: "PL",
    now: at,
  });
  return quote(
    [
      {
        productId: SKU,
        tierKey: TIER?.tierKey ?? "",
        projection: {
          ...projection,
          displayPrice: {
            ...projection.displayPrice,
            amountMinor: toMinor(projection.displayPrice.amountMinor + delta),
          },
        },
      },
    ],
    at,
  );
}

describe("verifyDraftQuote with an injected clock (AC-17, T-17)", () => {
  it("uses a quote younger than 30 minutes as is", async () => {
    const signed = await deriveQuote(selection(), T0);
    const check = await verifyDraftQuote(draftWith(signed), minutes(29));
    expect(check.verdict).toBe("ok");
    expect(check.quote.digest).toBe(signed.digest);
  });

  it("reissues an expired quote whose re-derived total is unchanged, with no notice", async () => {
    const signed = await deriveQuote(selection(), T0);
    const check = await verifyDraftQuote(draftWith(signed), minutes(31));
    expect(check.verdict).toBe("reissued");
    expect(check.quote.totalMinor).toBe(signed.totalMinor);
    expect(check.quote.digest).not.toBe(signed.digest);
    expect(Date.parse(check.quote.expiresAt)).toBe(minutes(61).getTime());
    expect(
      priceChange({
        quote: check.quote,
        confirmed: draftWith(signed).confirmed,
      }),
    ).toBeNull();
  });

  it("answers `changed` when the re-derived total moved, and the notice names both amounts", async () => {
    const stale = await signedAtWrongAmount(T0, 500);
    for (const at of [minutes(5), minutes(31)]) {
      const draft = draftWith(stale);
      const check = await verifyDraftQuote(draft, at);
      expect(check.verdict).toBe("changed");
      const fresh = await deriveQuote(selection(), at);
      expect(check.quote.totalMinor).toBe(fresh.totalMinor);
      expect(
        priceChange({ quote: check.quote, confirmed: draft.confirmed }),
      ).toEqual({
        previous: { amountMinor: stale.totalMinor, currency: stale.currency },
        current: { amountMinor: fresh.totalMinor, currency: fresh.currency },
      });
    }
  });

  it("discards a tampered quote: a changed amount, a forged digest, a quote that is not one", async () => {
    const signed = await deriveQuote(selection(), T0);
    const fresh = await deriveQuote(selection(), minutes(1));
    const forged: Quote[] = [
      { ...signed, totalMinor: toMinor(signed.totalMinor - 1) },
      { ...signed, digest: "0".repeat(64) },
      {
        ...signed,
        lines: signed.lines.map((line) => ({
          ...line,
          amountMinor: toMinor(line.amountMinor - 1),
        })),
        totalMinor: toMinor(signed.totalMinor - signed.lines.length),
      },
    ];
    for (const candidate of forged) {
      const check = await verifyDraftQuote(draftWith(candidate), minutes(1));
      expect(check.verdict).toBe("tampered");
      expect(check.quote.totalMinor).toBe(fresh.totalMinor);
    }
    const missing = await verifyDraftQuote(draftWith(null), minutes(1));
    expect(missing.verdict).toBe("tampered");
  });

  it("keeps a quote with an add-on line inside its 30 minutes and reissues it after", async () => {
    const signed = await deriveQuote(selection([ADDON.key]), T0);
    const draft = draftWith(signed, [ADDON.key]);
    const inside = await verifyDraftQuote(draft, minutes(10));
    expect(inside.verdict).toBe("ok");
    expect(inside.quote.digest).toBe(signed.digest);
    const after = await verifyDraftQuote(draft, minutes(30));
    expect(after.verdict).toBe("reissued");
  });
});

describe("priceChange", () => {
  it("is null while the buyer has seen the quote's total, and names both amounts otherwise", () => {
    const quoteLike = { totalMinor: 18_900, currency: "PLN" as const };
    expect(
      priceChange({
        quote: quoteLike,
        confirmed: { amountMinor: 18_900, currency: "PLN" },
      }),
    ).toBeNull();
    expect(
      priceChange({
        quote: quoteLike,
        confirmed: { amountMinor: 17_900, currency: "PLN" },
      }),
    ).toEqual({
      previous: { amountMinor: 17_900, currency: "PLN" },
      current: { amountMinor: 18_900, currency: "PLN" },
    });
    expect(
      priceChange({
        quote: quoteLike,
        confirmed: { amountMinor: 18_900, currency: "EUR" },
      }),
    ).not.toBeNull();
    expect(priceChange({ quote: null, confirmed: null })).toBeNull();
  });
});

describe("the quote carries every amount, add-ons included (AC-11 arithmetic)", () => {
  it("adds exactly the add-on's projected price, signed as an add-on line", async () => {
    const bare = await deriveQuote(selection(), T0);
    const withAddon = await deriveQuote(selection([ADDON.key]), T0);
    const projected = await addonPriceProjection(ADDON.key, "PL", "pl", {
      now: T0,
    });
    expect(withAddon.totalMinor - bare.totalMinor).toBe(
      projected.displayPrice.amountMinor,
    );
    expect(withAddon.lines.map((line) => line.tierKey)).toEqual([
      TIER.tierKey,
      `${ADDON_TIER_PREFIX}${ADDON.key}`,
    ]);
  });

  it("keeps a free add-on (card, 0) as a summary line and out of the signed quote", async () => {
    const free = ADDONS.find((addon) => addon.key === "card");
    expect(free).toBeDefined();
    const bare = await deriveQuote(selection(), T0);
    const signed = await deriveQuote(selection(["card", ADDON.key]), T0);
    expect(signed.lines.map((line) => line.tierKey)).toEqual([
      TIER.tierKey,
      `${ADDON_TIER_PREFIX}${ADDON.key}`,
    ]);
    const totals = await draftTotals(
      draftWith(signed, ["card", ADDON.key]),
      T0,
    );
    expect(
      totals?.lines.map((line) => [line.kind, line.amount.amountMinor]),
    ).toEqual([
      ["product", bare.totalMinor],
      ["addon", 0],
      ["addon", signed.totalMinor - bare.totalMinor],
    ]);
  });

  it("draftTotals reads lines and total from the quote, and the VAT split sums to it", async () => {
    const signed = await deriveQuote(selection([ADDON.key]), T0);
    const totals = await draftTotals(draftWith(signed, [ADDON.key]), T0);
    expect(totals?.total).toEqual({
      amountMinor: signed.totalMinor,
      currency: signed.currency,
    });
    expect(totals?.lines.map((line) => line.amount.amountMinor)).toEqual(
      signed.lines.map((line) => line.amountMinor),
    );
    expect(totals?.lines[1]).toMatchObject({
      kind: "addon",
      addonKey: ADDON.key,
    });
    expect(totals?.vat.reduce((sum, split) => sum + split.grossMinor, 0)).toBe(
      signed.totalMinor,
    );
    expect(await draftTotals(draftWith(null), T0)).toBeNull();
  });
});

describe("the quote must price exactly the draft's selection (/review 275 change 1, /break 275 holes 1, 10)", () => {
  const OTHER = TIERS_ALL[1];

  it("answers `changed` for a quote signed for another size, and the notice opens", async () => {
    if (OTHER === undefined) throw new Error(`${SKU} needs two tiers`);
    const forOther = await deriveQuote(
      { ...selection(), tierKey: OTHER.tierKey },
      T0,
    );
    const draft = draftWith(forOther);
    const check = await verifyDraftQuote(draft, minutes(1));
    expect(check.verdict).toBe("changed");
    expect(check.quote.lines.map((line) => line.tierKey)).toEqual([
      TIER.tierKey,
    ]);
    expect(
      priceChange({ quote: check.quote, confirmed: draft.confirmed }),
    ).not.toBeNull();
  });

  it("answers `changed` for a quote missing a paid add-on, and gives no totals for it", async () => {
    const bare = await deriveQuote(selection(), T0);
    const draft = draftWith(bare, [ADDON.key]);
    const check = await verifyDraftQuote(draft, minutes(1));
    expect(check.verdict).toBe("changed");
    expect(check.quote.totalMinor).toBeGreaterThan(bare.totalMinor);
    expect(
      priceChange({ quote: check.quote, confirmed: draft.confirmed }),
    ).not.toBeNull();
    expect(await draftTotals(draft, minutes(1))).toBeNull();
  });

  it("answers `changed` for a quote pricing an add-on the draft does not have", async () => {
    const withAddon = await deriveQuote(selection([ADDON.key]), T0);
    const draft = draftWith(withAddon, []);
    expect((await verifyDraftQuote(draft, minutes(1))).verdict).toBe("changed");
    expect(await draftTotals(draft, minutes(1))).toBeNull();
  });

  it("answers `changed` for the same total in another currency", async () => {
    const projection = await priceProjection("pl", {
      productId: SKU,
      tierKey: TIER.tierKey,
      countryIso: "PL",
      now: T0,
    });
    const inEuro = quote(
      [
        {
          productId: SKU,
          tierKey: TIER.tierKey,
          projection: {
            ...projection,
            displayPrice: { ...projection.displayPrice, currency: "EUR" },
          },
        },
      ],
      T0,
    );
    const check = await verifyDraftQuote(draftWith(inEuro), minutes(5));
    expect(check.verdict).toBe("changed");
    expect(check.quote.currency).toBe("PLN");
    expect(check.quote.totalMinor).toBe(inEuro.totalMinor);
  });

  it("answers `changed` for the same total split differently between the lines", async () => {
    const at = T0;
    const bouquet = await priceProjection("pl", {
      productId: SKU,
      tierKey: TIER.tierKey,
      countryIso: "PL",
      now: at,
    });
    const addon = await addonPriceProjection(ADDON.key, "PL", "pl", {
      now: at,
    });
    const shifted = quote(
      [
        {
          productId: SKU,
          tierKey: TIER.tierKey,
          projection: {
            ...bouquet,
            displayPrice: {
              ...bouquet.displayPrice,
              amountMinor: toMinor(bouquet.displayPrice.amountMinor + 100),
            },
          },
        },
        {
          productId: SKU,
          tierKey: `${ADDON_TIER_PREFIX}${ADDON.key}`,
          projection: {
            ...bouquet,
            displayPrice: {
              ...addon.displayPrice,
              amountMinor: toMinor(addon.displayPrice.amountMinor - 100),
            },
            priceVersion: addon.priceVersion,
          },
        },
      ],
      at,
    );
    const fresh = await deriveQuote(selection([ADDON.key]), at);
    expect(shifted.totalMinor).toBe(fresh.totalMinor);
    const check = await verifyDraftQuote(
      draftWith(shifted, [ADDON.key]),
      minutes(5),
    );
    expect(check.verdict).toBe("changed");
  });
});

describe("the VAT split by rate, by value (/break 275 hole 3)", () => {
  it("splits a PL bouquet at 8 % and a paid add-on at 23 %", async () => {
    const signed = await deriveQuote(selection([ADDON.key]), T0);
    const totals = await draftTotals(draftWith(signed, [ADDON.key]), T0);
    const [bouquetLine, addonLine] = signed.lines;
    const bouquetGross = bouquetLine?.amountMinor ?? -1;
    const addonGross = addonLine?.amountMinor ?? -1;
    const vatOf = (gross: number, rateBp: number): number =>
      Math.round((gross * rateBp) / (10_000 + rateBp));
    expect(totals?.vat).toEqual([
      {
        rateBp: 800,
        grossMinor: bouquetGross,
        vatMinor: vatOf(bouquetGross, 800),
        netMinor: bouquetGross - vatOf(bouquetGross, 800),
      },
      {
        rateBp: 2300,
        grossMinor: addonGross,
        vatMinor: vatOf(addonGross, 2300),
        netMinor: addonGross - vatOf(addonGross, 2300),
      },
    ]);
  });
});
