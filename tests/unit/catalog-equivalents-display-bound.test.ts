/**
 * The equivalents line's display bound and order (spec 004 §14 A-founder-2026-10-24a item 7 (b)
 * and (d); **AC-105** (the order and the absent displayed currency), **AC-106**; T-111's unit
 * half, **T-112**; TASK-389).
 *
 * `displayRateFor()` returns a rate through the end of day `as_of + EQUIVALENTS_MAX_AGE_DAYS`
 * (UTC) and `null` one millisecond later; inside 48 hours it is `fxRateFor()`'s rate exactly; and
 * `fxRateFor()` still fails closed on its own 48-hour bound, so the display bound can never price
 * a charged amount. Spec 005 AC-35's own tests (`catalog-pricing-fx.test.ts`) are not edited.
 *
 * The committed snapshot is dated 2026-09-08, so the display bound's last instant is
 * 2026-09-22T23:59:59.999Z.
 */
import { describe, expect, it } from "vitest";

import { EQUIVALENTS_MAX_AGE_DAYS } from "../../src/config/commerce.ts";
import {
  EQUIVALENT_CURRENCIES,
  equivalentsOrder,
  priceEquivalents,
} from "../../src/modules/catalog/pricing/equivalents.ts";
import {
  displayRateFor,
  displayRateStaleAfter,
  fxRateFor,
} from "../../src/modules/catalog/pricing/fx.ts";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";

const AS_OF = "2026-09-08";
const LAST_INSTANT = new Date("2026-09-22T23:59:59.999Z");
const ONE_MS_AFTER = new Date("2026-09-23T00:00:00.000Z");
const FRESH = new Date("2026-09-09T12:00:00Z");
/** Past `fxRateFor()`'s two working days, inside the display bound. */
const CHARGE_STALE = new Date("2026-09-15T12:00:00Z");

const PAIRS = [
  ["EUR", "GBP"],
  ["GBP", "EUR"],
  ["PLN", "GBP"],
  ["GBP", "USD"],
  ["EUR", "PLN"],
] as const;

describe("displayRateFor — the display bound (AC-106, T-112)", () => {
  it("is fourteen calendar days", () => {
    expect(EQUIVALENTS_MAX_AGE_DAYS).toBe(14);
    expect(displayRateStaleAfter(AS_OF)).toBe(ONE_MS_AFTER.getTime());
  });

  it("returns a rate at the bound's last instant and null one millisecond after", async () => {
    for (const [base, quote] of PAIRS) {
      const last = await displayRateFor(base, quote, LAST_INSTANT);
      expect(last?.asOf, `${base}->${quote}`).toBe(AS_OF);
      expect(
        await displayRateFor(base, quote, ONE_MS_AFTER),
        `${base}->${quote}`,
      ).toBeNull();
    }
  });

  it("equals fxRateFor() inside 48 hours", async () => {
    for (const [base, quote] of PAIRS) {
      const charged = await fxRateFor(base, quote, FRESH);
      expect(charged).not.toBeNull();
      expect(await displayRateFor(base, quote, FRESH)).toEqual(charged);
    }
  });

  it("never lends its bound to a charged amount: fxRateFor() is null where the display rate is not", async () => {
    expect(await displayRateFor("EUR", "GBP", CHARGE_STALE)).not.toBeNull();
    expect(await fxRateFor("EUR", "GBP", CHARGE_STALE)).toBeNull();
  });

  it("refuses a currency against itself and a date that is not a day", async () => {
    await expect(displayRateFor("EUR", "EUR", FRESH)).rejects.toThrow(
      /against itself/u,
    );
    expect(() => displayRateStaleAfter("2026-02-30")).toThrow(
      /not a calendar day/u,
    );
  });
});

describe("priceEquivalents — item 7's order and bound (AC-105, T-111)", () => {
  const pln = {
    displayPrice: { amountMinor: toMinor(19_900), currency: "PLN" as const },
    destinationCurrencyPrice: {
      amountMinor: toMinor(19_900),
      currency: "PLN" as const,
    },
  };

  it("orders GBP, EUR, USD, PLN, never the displayed currency", () => {
    expect(EQUIVALENT_CURRENCIES).toEqual(["GBP", "EUR", "USD", "PLN"]);
    expect(equivalentsOrder("EUR")).toEqual(["GBP", "USD", "PLN"]);
    expect(equivalentsOrder("GBP")).toEqual(["EUR", "USD", "PLN"]);
    expect(equivalentsOrder("PLN")).toEqual(["GBP", "EUR", "USD"]);
  });

  it("puts the locale's display currency first when it is not the displayed one", () => {
    expect(equivalentsOrder("PLN", "EUR")).toEqual(["EUR", "GBP", "USD"]);
    expect(equivalentsOrder("PLN", "GBP")).toEqual(["GBP", "EUR", "USD"]);
    expect(equivalentsOrder("EUR", "PLN")).toEqual(["PLN", "GBP", "USD"]);
    // The displayed currency is never listed, even as the lead.
    expect(equivalentsOrder("EUR", "EUR")).toEqual(["GBP", "USD", "PLN"]);
  });

  it("reads the lead from the locale: a PLN price on /en leads with EUR, on /en-gb with GBP", async () => {
    const en = await priceEquivalents(pln, FRESH, { locale: "en" });
    expect(en?.amounts.map((amount) => amount.currency)).toEqual([
      "EUR",
      "GBP",
      "USD",
    ]);
    const enGb = await priceEquivalents(pln, FRESH, { locale: "en-gb" });
    expect(enGb?.amounts.map((amount) => amount.currency)).toEqual([
      "GBP",
      "EUR",
      "USD",
    ]);
  });

  it("shows the line through the display bound's last instant and hides it after", async () => {
    const last = await priceEquivalents(pln, LAST_INSTANT, { locale: "pl" });
    expect(last?.asOf).toBe(AS_OF);
    // 199 zł at the mid rate, half up: the same amounts as inside 48 hours (one snapshot).
    expect(last).toEqual(await priceEquivalents(pln, FRESH, { locale: "pl" }));
    expect(
      await priceEquivalents(pln, ONE_MS_AFTER, { locale: "pl" }),
    ).toBeNull();
  });

  it("hides the line for a price carrying fxReasonKey, inside the bound", async () => {
    expect(
      await priceEquivalents(
        { ...pln, fxReasonKey: "catalog.availability.fxUnavailable" },
        FRESH,
        { locale: "en" },
      ),
    ).toBeNull();
  });
});
