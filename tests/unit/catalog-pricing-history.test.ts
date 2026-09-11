/**
 * The Omnibus Art. 6a 30-day figure (spec 005 §2 "Pricing", §8, AC-14, T-12; `plan/07` §2.1;
 * TASK-068).
 *
 * The history a price has is the rows it superseded, so the fixture below is a real supersession
 * chain — one row closed, the next opened the same day — injected at the provider seam, exactly
 * as `catalog-pricing-resolve.test.ts` injects the zero-row and two-row cases. The authored
 * dataset holds no superseded row (nothing has been repriced yet), which is why the history has
 * to be injected to be observable at all, and why injecting it is the honest test rather than a
 * convenience.
 *
 * The window boundary is pinned **from both sides**, because it is the whole legal content of the
 * function: a row that was the price only on the window's first day counts, and a row whose last
 * day of force was the day before that — the window's "day 31" — does not.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CountryPriceRecord } from "../../src/modules/catalog/providers.ts";

const STATIC_MODULE = "../../src/modules/catalog/static/index.ts";
const LIVE = "PL" as const;
const SKU = "FO-BQ-001" as const;
const TIER = "stems_12" as const;

/** `asOf` for every case below; the window is therefore [2026-08-11, 2026-09-10]. */
const AS_OF = "2026-09-10";
/** `AS_OF` minus 30 days — the window's first day, inclusive. */
const WINDOW_START = "2026-08-11";

/** One `country_price` retail row, with only the fields the figure reads spelled out. */
function retailRow(
  amountMinor: number,
  activeFrom: string,
  activeTo: string | null,
): CountryPriceRecord {
  return {
    sku: SKU,
    countryIso2: LIVE,
    tierKey: TIER,
    surchargeKind: null,
    retailMinor: amountMinor,
    currency: "PLN",
    vatRateBp: 800,
    activeFrom,
    activeTo,
  };
}

/** Re-import `pricing/history.ts` with the price rows replaced by an authored history. */
async function withHistory(
  rows: readonly CountryPriceRecord[],
): Promise<typeof import("../../src/modules/catalog/pricing/history.ts")> {
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
        countryPrices: () => Promise.resolve(rows),
      },
    };
  });
  return import("../../src/modules/catalog/pricing/history.ts");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(STATIC_MODULE);
});

/* -------------------------------------------------------------------------- */

describe("lowestPriceInLast30Days (AC-14, T-12)", () => {
  it("is the minimum over every row in force in the window, not the current price", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(19_900, "2026-06-01", "2026-08-20"),
      retailRow(14_900, "2026-08-20", "2026-09-01"),
      retailRow(17_900, "2026-09-01", null),
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).resolves.toEqual({ amountMinor: 14_900, currency: "PLN" });
  });

  it("returns the current price when no cheaper row exists in the window", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(21_900, "2026-01-01", "2026-09-01"),
      retailRow(17_900, "2026-09-01", null),
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).resolves.toEqual({ amountMinor: 17_900, currency: "PLN" });
  });

  it("counts a row that was the price only on the window's first day (inclusive)", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      // In force over [2026-08-11, 2026-08-12) — the window's first day and no other.
      retailRow(9_900, "2026-07-01", "2026-08-12"),
      retailRow(17_900, "2026-08-12", null),
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).resolves.toEqual({ amountMinor: 9_900, currency: "PLN" });
  });

  it("excludes a row whose last day of force was the day before the window (day 31)", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      // `activeTo` is exclusive, so this row's last day was 2026-08-10 — outside the window.
      retailRow(9_900, "2026-07-01", WINDOW_START),
      retailRow(17_900, WINDOW_START, null),
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).resolves.toEqual({ amountMinor: 17_900, currency: "PLN" });
  });

  it("ignores a row that only starts after `asOf`: a future price is not a past one", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(17_900, "2026-08-01", null),
      retailRow(11_900, "2026-09-20", null),
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).resolves.toEqual({ amountMinor: 17_900, currency: "PLN" });
  });

  it("ignores surcharge rows: Art. 6a compares the product's own price", async () => {
    const surcharge = {
      ...retailRow(400, "2026-01-01", null),
      surchargeKind: "sunday",
    } as CountryPriceRecord;
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(17_900, "2026-08-01", null),
      surcharge,
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).resolves.toEqual({ amountMinor: 17_900, currency: "PLN" });
  });

  it("moves with the injected clock rather than with today's date", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(9_900, "2026-06-01", "2026-07-01"),
      retailRow(17_900, "2026-07-01", null),
    ]);

    // A window that still touches the cheap row, and one that no longer does.
    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, "2026-07-25"),
    ).resolves.toMatchObject({ amountMinor: 9_900 });
    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, "2026-08-15"),
    ).resolves.toMatchObject({ amountMinor: 17_900 });
  });

  it("throws when no row was in force in the window at all", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(17_900, "2026-01-01", "2026-02-01"),
    ]);

    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, AS_OF),
    ).rejects.toThrow("Omnibus Art. 6a");
  });

  it("rejects a malformed SKU, tier, destination or date at the boundary", async () => {
    const { lowestPriceInLast30Days } = await withHistory([
      retailRow(17_900, "2026-08-01", null),
    ]);

    await expect(
      lowestPriceInLast30Days("not-a-sku", TIER, LIVE, AS_OF),
    ).rejects.toThrow();
    await expect(
      lowestPriceInLast30Days(SKU, "", LIVE, AS_OF),
    ).rejects.toThrow();
    await expect(
      lowestPriceInLast30Days(SKU, TIER, "US" as unknown as typeof LIVE, AS_OF),
    ).rejects.toThrow();
    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, "10/09/2026"),
    ).rejects.toThrow();
  });

  it("reads the authored dataset when nothing is injected, and finds today's price", async () => {
    const { lowestPriceInLast30Days } =
      await import("../../src/modules/catalog/pricing/history.ts");
    const { resolvePrice } =
      await import("../../src/modules/catalog/pricing/resolve.ts");

    const today = await resolvePrice({
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
    });
    // No row in the authored dataset has been superseded, so the 30-day minimum is the current
    // price — the honest answer, and the one a "was/now" claim could not be built on.
    await expect(
      lowestPriceInLast30Days(SKU, TIER, LIVE, "2027-01-15"),
    ).resolves.toEqual({
      amountMinor: today.amountMinor,
      currency: today.currency,
    });
  });
});
