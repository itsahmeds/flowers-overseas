/**
 * What the module is allowed to say about itself (spec 005 §8 "Logs and PII", §11, AC-24, T-22;
 * TASK-069).
 *
 * Spec 005 §8: *"005 logs at most `{ sku, tier_key, country_iso, currency, fx_as_of, duration_ms,
 * request_id }` — no buyer, no recipient, no address, no basket contents, no quote digest."* This
 * file drives the **read** path and the **pricing** path — including the three §11 signals and
 * the two error paths that carry amounts in their messages — through a capturing logger and a
 * captured Sentry sink, collects every field of every line, and asserts the union is a subset of
 * that list.
 *
 * Why a subset rather than an equality: which fields a given call can fill is a property of that
 * call (a read with no destination has no `country_iso`), while what may **ever** appear is the
 * privacy claim. The negative assertions are therefore explicit as well: no key matching
 * buyer/recipient/address/email/phone/basket, and — the one this module could plausibly get wrong
 * — **no quote digest**, checked as a value and not only as a key, because a digest leaks as a
 * 64-character hex string long before anyone names a field after it.
 *
 * `dateSurcharges()`'s disagreement error interpolates two amounts into its message
 * (`/review 47`), and `resolvePrice()`'s missing/ambiguous errors interpolate a SKU and a tier.
 * Those are `Error`s a caller may catch and re-log — the rule this file enforces is that **this
 * module logs none of them**: an error message is thrown, a signal line is emitted, and the two
 * carry different content on purpose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureMessage,
  getCurrentScope: () => ({ setTag: (): void => undefined }),
}));

const { FX_SNAPSHOT_AS_OF } =
  await import("../../src/config/catalogue/fx.data.ts");
const { logger } = await import("../../src/lib/logger.ts");
const { CATALOG_LOG_FIELDS, CATALOG_SIGNALS } =
  await import("../../src/modules/catalog/observability.ts");
const { getProduct, listProducts } =
  await import("../../src/modules/catalog/read.ts");
const { dateSurcharges, resolvePrice, tierPrices } =
  await import("../../src/modules/catalog/pricing/resolve.ts");
const { priceProjection, priceTable, offerProjection } =
  await import("../../src/modules/catalog/pricing/project.ts");
const { quote } = await import("../../src/modules/catalog/pricing/quote.ts");
const { availability } =
  await import("../../src/modules/catalog/availability.ts");
const { lowestPriceInLast30Days } =
  await import("../../src/modules/catalog/pricing/history.ts");

const LIVE = "PL" as const;
const SKU = "FO-BQ-001" as const;
const TIER = "stems_12" as const;
const FRESH = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
/** Well past `MAX_FX_AGE_HOURS`: the snapshot has stopped converting (§11's first signal). */
const STALE = new Date("2026-10-01T10:00:00Z");

/** One captured line: its level, its message and its fields. */
interface Line {
  readonly level: string;
  readonly msg: string | undefined;
  readonly fields: Readonly<Record<string, unknown>>;
}

let lines: Line[] = [];

function capture(): void {
  lines = [];
  captureMessage.mockClear();
  for (const level of ["debug", "info", "warn", "error", "fatal"] as const) {
    vi.spyOn(logger, level).mockImplementation(
      (fields: Readonly<Record<string, unknown>>, msg?: string) => {
        lines.push({ level, msg, fields });
      },
    );
  }
}

/** Every field key emitted so far. */
function emittedKeys(): readonly string[] {
  return [...new Set(lines.flatMap((line) => Object.keys(line.fields)))].sort();
}

/** Every field value emitted so far, as strings. */
function emittedValues(): readonly string[] {
  return lines.flatMap((line) =>
    Object.values(line.fields).map((value) => String(value)),
  );
}

beforeEach(capture);
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the read and pricing paths log a bounded field set (AC-24, T-22)", () => {
  it("emits nothing outside spec 005 §8's list over the whole surface", async () => {
    // The read path.
    await listProducts({ countryIso: LIVE, limit: 5 });
    await getProduct(SKU);
    await availability({ productId: SKU, countryIso: LIVE });

    // The pricing path, including a conversion, a table, an offer and a signed quote.
    await resolvePrice({ productId: SKU, tierKey: TIER, countryIso: LIVE });
    await tierPrices({ productId: SKU, countryIso: LIVE });
    await dateSurcharges(LIVE, { from: "2026-10-01", to: "2026-10-31" });
    const projection = await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: FRESH,
    });
    offerProjection(projection);
    await priceTable({ productId: SKU, countryIso: LIVE, now: FRESH });
    await lowestPriceInLast30Days(SKU, TIER, LIVE, "2026-09-30");
    quote([{ productId: SKU, tierKey: TIER, projection }], FRESH);

    // Something was logged — otherwise the subset below is vacuously true.
    expect(lines.length).toBeGreaterThan(0);
    for (const key of emittedKeys()) {
      expect([...CATALOG_LOG_FIELDS], key).toContain(key);
    }
  });

  it("names the read line and reports an integer duration", async () => {
    await resolvePrice({ productId: SKU, tierKey: TIER, countryIso: LIVE });

    const read = lines.filter((line) => line.msg === "catalog.read");
    expect(read.length).toBeGreaterThan(0);
    for (const line of read) {
      expect(Number.isInteger(line.fields["duration_ms"])).toBe(true);
      expect(line.level === "debug" || line.level === "warn").toBe(true);
    }
  });

  it("emits no buyer, recipient, address, basket or quote digest", async () => {
    const projection = await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: FRESH,
    });
    const signed = quote(
      [{ productId: SKU, tierKey: TIER, projection }],
      FRESH,
    );

    const forbidden =
      /buyer|recipient|address|email|phone|basket|digest|message|ip\b/i;
    for (const key of emittedKeys()) {
      expect(forbidden.test(key), key).toBe(false);
    }
    // The digest as a *value*: the leak that a key-based check would miss.
    for (const value of emittedValues()) {
      expect(value).not.toContain(signed.digest);
      expect(value).not.toContain(signed.quoteId);
      expect(/^[0-9a-f]{32,}$/.test(value), value).toBe(false);
    }
  });
});

describe("the three business signals of spec 005 §11", () => {
  it("warns and captures `catalog.fx_stale` when the snapshot has aged out", async () => {
    await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: STALE,
    });

    const stale = lines.filter((line) => line.msg === CATALOG_SIGNALS.fxStale);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.every((line) => line.level === "warn")).toBe(true);
    expect(Object.keys(stale[0]?.fields ?? {}).sort()).toEqual([
      "currency",
      "fx_as_of",
    ]);
    expect(captureMessage).toHaveBeenCalledWith(
      CATALOG_SIGNALS.fxStale,
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("warns and captures `catalog.price_missing`, and logs no amount", async () => {
    await expect(
      resolvePrice({ productId: SKU, tierKey: "stems_99", countryIso: LIVE }),
    ).rejects.toThrow(/no active/);

    const missing = lines.filter(
      (line) => line.msg === CATALOG_SIGNALS.priceMissing,
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.level).toBe("warn");
    expect(Object.keys(missing[0]?.fields ?? {}).sort()).toEqual([
      "country_iso",
      "sku",
      "tier_key",
    ]);
    expect(captureMessage).toHaveBeenCalledWith(
      CATALOG_SIGNALS.priceMissing,
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("keeps the amounts an error message carries out of the log", async () => {
    // `dateSurcharges()` throws with **two amounts** interpolated when a destination's rows
    // disagree (`/review 47`). Whatever a caller does with that message, this module does not
    // log it: the signal lines above carry keys, not amounts.
    await dateSurcharges(LIVE, { from: "2027-02-13", to: "2027-02-15" });

    for (const value of emittedValues()) {
      // No line carries a bare integer that could be an amount in minor units.
      expect(/^\d{4,}$/.test(value), value).toBe(false);
    }
  });
});

describe("the Sentry side of a signal (spec 005 §11, spec 001 §8)", () => {
  it("tags the signal so it survives `beforeSend`'s free-text redaction", async () => {
    await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: STALE,
    });

    const call = captureMessage.mock.calls.find(
      ([message]) => message === CATALOG_SIGNALS.fxStale,
    );
    expect(call).toBeDefined();
    const options = call?.[1] as {
      tags?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    };
    expect(options.tags).toEqual({ signal: CATALOG_SIGNALS.fxStale });
    for (const key of Object.keys(options.extra ?? {})) {
      expect([...CATALOG_LOG_FIELDS], key).toContain(key);
    }
  });
});
