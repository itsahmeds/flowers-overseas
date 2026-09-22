/**
 * `productView()`'s money across a real calendar — `dateTotals`, the chip fees and the selected
 * date (spec 009 §2, §5.2 `DateTotalsSchema`, §8, §13 design round **Q3**; AC-9's model half,
 * AC-16, AC-21; T-09 unit half, T-32; TASK-125).
 *
 * No committed destination has an `operations` block (TASK-124 authors Poland's), so this file
 * gives Poland one — **a fixture, in this module graph only** — with Sunday delivery, which is what
 * makes the committed Sunday surcharge (18 zł) apply: `prices.data.ts` emits a `live` country's
 * Sunday rows only when its `operations` agree to a Sunday (TASK-120). The clock is Wednesday
 * 9 September 2026, 09:00 in Warsaw: inside the committed ECB snapshot's window, before the 14:00
 * cutoff, with two Sundays (13 and 20 September) in the fourteen-day grid.
 *
 * Every figure is an exact integer in minor units. The one that carries Q3 is `en` / 12 stems: its
 * Sunday chip is **€5.00** while the 18-stem chip is **€4.00**, because each is the difference of
 * two projected, individually rounded totals. A chip computed by converting 18 zł on its own would
 * be one figure for both tiers and would contradict one of the two summaries.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/countries.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/countries.ts")>();
  const operations = {
    ianaZone: "Europe/Warsaw",
    sameDayCutoffLocal: "14:00",
    deliveryDays: [1, 2, 3, 4, 5, 6, 7],
    sundayDelivery: "always",
  } as const;
  return {
    ...actual,
    countryConfig: (iso2: string) =>
      iso2 === "PL"
        ? { ...actual.countryConfig(iso2 as never), operations }
        : actual.countryConfig(iso2 as never),
  };
});

const { ProductViewSchema, dateTotals, productView } =
  await import("../../src/modules/catalog/product.ts");
const { dateSurcharges } =
  await import("../../src/modules/catalog/pricing/resolve.ts");
const { deliveryWindow } = await import("../../src/modules/geo/index.ts");
const { withActivePartnersProvider } =
  await import("../../src/modules/geo/partners.ts");
const { DeliveryWindowSchema } =
  await import("../../src/modules/geo/delivery/schemas.ts");

/** Wednesday 9 September 2026, 09:00 Europe/Warsaw. */
const MORNING = new Date("2026-09-09T07:00:00Z");
/** The same day, 15:30 Europe/Warsaw: past the 14:00 cutoff. */
const AFTERNOON = new Date("2026-09-09T13:30:00Z");
/** Three weeks on: the committed FX snapshot is stale. */
const STALE = new Date("2026-10-01T07:00:00Z");

const SUNDAYS = ["2026-09-13", "2026-09-20"] as const;
const AMBER = "FO-BQ-001";

const partnered = { hasActivePartners: (iso2: string) => iso2 === "PL" };

type ViewOptions = Partial<Parameters<typeof productView>[1]>;

async function live(locale: string, options: ViewOptions = {}) {
  const view = await withActivePartnersProvider(partnered, () =>
    productView(
      { locale, countryIso: "PL", sku: AMBER },
      { parameterised: false, now: MORNING, ...options },
    ),
  );
  if (view === undefined) throw new Error("no view");
  return view;
}

async function preview(locale: string, options: ViewOptions = {}) {
  const view = await productView(
    { locale, countryIso: "PL", sku: AMBER },
    { parameterised: false, now: MORNING, ...options },
  );
  if (view === undefined) throw new Error("no view");
  return view;
}

/** The chips that carry a fee, as `[date, amountMinor, currency]`. */
function chips(view: Awaited<ReturnType<typeof live>>) {
  return view.delivery.dates
    .filter((date) => date.surcharge !== undefined)
    .map((date) => [
      date.date,
      date.surcharge?.amountMinor,
      date.surcharge?.currency,
    ]);
}

/** A totals row with every day at `base` except the two Sundays at `sunday`. */
function row(base: number, sunday: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let day = 9; day <= 22; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    out[date] = (SUNDAYS as readonly string[]).includes(date) ? sunday : base;
  }
  return out;
}

describe("`dateTotals`: the all-in total of every tier on every selectable date (§5.2)", () => {
  it("prices fourteen selectable days per tier in PLN, the Sundays 18 zł dearer (pl, native)", async () => {
    const view = await live("pl");
    expect(view.delivery.state).toBe("live");
    expect(view.totals).toEqual({
      stems_12: row(19_900, 21_700),
      stems_18: row(22_900, 24_700),
      stems_24: row(25_900, 27_700),
    });
  });

  it("prices the same days in GBP for en-gb, each total projected on its own", async () => {
    const view = await live("en-gb");
    expect(view.fx.state).toBe("converted");
    expect(view.totals).toEqual({
      stems_12: row(4090, 4490),
      stems_18: row(4690, 5090),
      stems_24: row(5290, 5690),
    });
  });

  it("is exactly what `dateTotals()` returns for the same window and clock — one derivation", async () => {
    const view = await live("en");
    const window = withActivePartnersProvider(partnered, () =>
      deliveryWindow({ countryIso: "PL", from: MORNING }),
    );
    const table = await dateTotals("en", {
      productId: AMBER,
      countryIso: "PL",
      now: MORNING,
      window: await window,
    });
    expect(table).toEqual(view.totals);
  });

  it("carries no date that cannot be chosen: past the cutoff, today leaves the table", async () => {
    const view = await live("pl", { now: AFTERNOON });
    const today = view.delivery.dates[0];
    expect(today?.date).toBe("2026-09-09");
    expect(today?.selectable).toBe(false);
    expect(today?.reasonKey).toBe("delivery.reason.pastCutoff");
    expect(Object.keys(view.totals["stems_18"] ?? {})).not.toContain(
      "2026-09-09",
    );
    expect(Object.keys(view.totals["stems_18"] ?? {})).toHaveLength(13);
    // And the earliest date that *can* be chosen is the one preselected (§2).
    expect(view.selectedDate).toBe("2026-09-10");
  });

  it("is empty per tier in `preview`, where no date can be chosen", async () => {
    const view = await preview("en-gb");
    expect(view.delivery.state).toBe("preview");
    expect(view.delivery.dates).toHaveLength(14);
    expect(view.delivery.dates.every((date) => !date.selectable)).toBe(true);
    expect(view.totals).toEqual({ stems_12: {}, stems_18: {}, stems_24: {} });
    expect(view.selectedDate).toBeUndefined();
    expect(view.price.displayPrice).toEqual({
      amountMinor: 4690,
      currency: "GBP",
    });
  });
});

describe("the chip fee is the difference of two projected totals (design round Q3)", () => {
  it("prints the exact destination amount where no conversion happens (pl: 18 zł = `dateSurcharges()`)", async () => {
    const view = await live("pl");
    expect(chips(view)).toEqual([
      ["2026-09-13", 1800, "PLN"],
      ["2026-09-20", 1800, "PLN"],
    ]);
    const authored = await dateSurcharges("PL", {
      from: "2026-09-09",
      to: "2026-09-22",
    });
    expect(
      authored.map((row) => [row.date, row.amountMinor, row.kind]),
    ).toEqual([
      ["2026-09-13", 1800, "sunday"],
      ["2026-09-20", 1800, "sunday"],
    ]);
  });

  it("differs by tier in a converted currency, because each total is rounded on its own (en, EUR)", async () => {
    const eighteen = await live("en");
    const twelve = await live("en", { selection: { tierKey: "stems_12" } });
    expect(chips(eighteen)).toEqual([
      ["2026-09-13", 400, "EUR"],
      ["2026-09-20", 400, "EUR"],
    ]);
    expect(chips(twelve)).toEqual([
      ["2026-09-13", 500, "EUR"],
      ["2026-09-20", 500, "EUR"],
    ]);
    // The identity the rule exists for: chip + tier price = the Sunday total, for the chosen tier.
    for (const view of [eighteen, twelve]) {
      const tier = view.tiers.find(
        (option) => option.tierKey === view.selectedTierKey,
      );
      for (const sunday of SUNDAYS) {
        const chip = view.delivery.dates.find((date) => date.date === sunday);
        expect(
          (tier?.price.amountMinor ?? 0) + (chip?.surcharge?.amountMinor ?? 0),
        ).toBe(view.totals[view.selectedTierKey]?.[sunday]);
      }
    }
  });

  it("puts the fee on a closed chip in `preview` too — a surcharge is a fact about the calendar", async () => {
    const view = await preview("en-gb");
    expect(chips(view)).toEqual([
      ["2026-09-13", 400, "GBP"],
      ["2026-09-20", 400, "GBP"],
    ]);
  });

  it("falls back with the page: on stale FX the chip is the destination's own 18 zł", async () => {
    const view = await live("en-gb", { now: STALE });
    expect(view.fx.state).toBe("fallback");
    expect(view.price.displayPrice).toEqual({
      amountMinor: 22_900,
      currency: "PLN",
    });
    expect(
      chips(view).map(([, amount, currency]) => [amount, currency]),
    ).toEqual([
      [1800, "PLN"],
      [1800, "PLN"],
    ]);
  });

  it("marks every other date `included` — no fee field at all", async () => {
    const view = await live("en-gb");
    const plain = view.delivery.dates.filter(
      (date) => !(SUNDAYS as readonly string[]).includes(date.date),
    );
    expect(plain).toHaveLength(12);
    expect(plain.every((date) => date.surcharge === undefined)).toBe(true);
  });
});

describe("the selected configuration is the one price (§8, AC-9's model half)", () => {
  it("preselects the earliest selectable date, and prices it", async () => {
    const view = await live("en-gb");
    expect(view.selectedDate).toBe("2026-09-09");
    expect(view.price.displayPrice).toEqual({
      amountMinor: 4690,
      currency: "GBP",
    });
  });

  it("moves the one total, and only it, when a surcharged date is chosen", async () => {
    const view = await live("en-gb", { selection: { date: "2026-09-13" } });
    expect(view.selectedDate).toBe("2026-09-13");
    expect(view.price.displayPrice).toEqual({
      amountMinor: 5090,
      currency: "GBP",
    });
    // The surcharge rides inside the projection, as a line, not as a second charge.
    expect(view.price.surcharges.map((s) => [s.kind, s.amountMinor])).toEqual([
      ["sunday", 1800],
    ]);
    // The tier option keeps its undated price: the date's fee is on the chip, not in the tier.
    expect(
      view.tiers.find((tier) => tier.tierKey === "stems_18")?.price.amountMinor,
    ).toBe(4690);
  });

  it("prices a chosen tier on a chosen date from the totals table", async () => {
    const view = await live("en-gb", {
      selection: { tierKey: "stems_24", date: "2026-09-20" },
    });
    expect(view.price.displayPrice.amountMinor).toBe(5690);
    expect(view.price.displayPrice.amountMinor).toBe(
      view.totals["stems_24"]?.["2026-09-20"],
    );
  });

  it("falls back to the earliest date on a date outside the window or not selectable — never an error", async () => {
    for (const date of ["2026-12-25", "2026-09-08", "not-a-date"]) {
      const view = await live("en-gb", { selection: { date } });
      expect(view.selectedDate, date).toBe("2026-09-09");
    }
    const late = await live("en-gb", {
      now: AFTERNOON,
      selection: { date: "2026-09-09" },
    });
    expect(late.selectedDate).toBe("2026-09-10");
  });

  it("refuses a live view that forgot to preselect a date", async () => {
    const view = await live("en-gb");
    const unselected: Partial<typeof view> = structuredClone(view);
    delete unselected.selectedDate;
    expect(ProductViewSchema.safeParse(view).success).toBe(true);
    expect(ProductViewSchema.safeParse(unselected).success).toBe(false);
  });
});

describe("the calendar's own honesty rules hold over every view (AC-8's model half)", () => {
  it("parses the window of every state with `DeliveryWindowSchema`", async () => {
    for (const view of [
      await live("en-gb"),
      await live("pl", { now: AFTERNOON }),
      await preview("en-gb"),
      await live("en-gb", { now: STALE }),
    ]) {
      const parsed = DeliveryWindowSchema.safeParse(view.delivery);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(view.delivery.timeZone).toBe("Europe/Warsaw");
      expect(view.delivery.cutoffLocal).toBe("14:00");
    }
  });

  it("claims the local florist only where one is taking orders", async () => {
    expect((await live("en-gb")).trust).toEqual([
      "substitution",
      "freshnessGuarantee",
      "localFlorist",
    ]);
    expect((await preview("en-gb")).trust).toEqual([
      "substitution",
      "freshnessGuarantee",
    ]);
  });
});
