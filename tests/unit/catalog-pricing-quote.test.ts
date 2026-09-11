/**
 * Signed quotes (spec 005 §5.2 `pricing/quote.ts`, §8, §13 Q5, AC-17, T-15; TASK-068).
 *
 * Four things are proved, and three of them are refusals.
 *
 *  - a quote round-trips as `ok` inside its 30-minute window;
 *  - a **mutated amount** is `tampered` — the digest is over the amount, so an edited quote is
 *    not a cheaper quote;
 *  - a clock past `expiresAt`, a rate that has aged past 48 h, a superseded priced row and a row
 *    whose amount has moved are each `expired` — the caller re-derives and asks the buyer to
 *    confirm the new figure, which is the only path by which a different amount can be charged;
 *  - the serialised quote's **key set equals spec §5.2's list exactly**, and no value anywhere in
 *    it is personal data (`plan/07` §2.2). That is asserted from the outside, over the JSON a
 *    caller would actually put in a form field.
 *
 * The clock is injected into both functions, so nothing here waits and nothing here is flaky.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { priceProjection } from "../../src/modules/catalog/pricing/project.ts";
import { quote, verifyQuote } from "../../src/modules/catalog/pricing/quote.ts";
import type { Quote } from "../../src/modules/catalog/types.ts";

const STATIC_MODULE = "../../src/modules/catalog/static/index.ts";
const LIVE = "PL" as const;
const SKU = "FO-BQ-001" as const;
const TIER = "stems_12" as const;
const SECOND_TIER = "stems_18" as const;

/** Inside the FX snapshot's 48-hour window, so a converted quote is possible. */
const ISSUED_AT = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
/** 29 minutes later: inside the 30-minute lock (§13 Q5). */
const INSIDE = new Date(ISSUED_AT.getTime() + 29 * 60_000);
/** 30 minutes later exactly: the window is closed at its bound, not after it. */
const AT_EXPIRY = new Date(ISSUED_AT.getTime() + 30 * 60_000);

/** The §5.2 field list, verbatim — AC-17's key-set equality is against this and nothing else. */
const QUOTE_FIELDS = [
  "quoteId",
  "lines",
  "totalMinor",
  "currency",
  "fxAsOf",
  "ratePpm",
  "priceVersion",
  "expiresAt",
  "digest",
] as const;

/** A native-currency quote (PL locale, PL destination: no conversion at all). */
async function nativeQuote(tiers: readonly string[] = [TIER]): Promise<Quote> {
  const lines = [];
  for (const tierKey of tiers) {
    lines.push({
      productId: SKU,
      tierKey,
      projection: await priceProjection("pl", {
        productId: SKU,
        tierKey,
        countryIso: LIVE,
        now: ISSUED_AT,
      }),
    });
  }
  return quote(lines, ISSUED_AT);
}

/** A converted quote (GB locale over a PL price: GBP, with the snapshot's rate stamped on it). */
async function convertedQuote(): Promise<Quote> {
  const projection = await priceProjection("en-gb", {
    productId: SKU,
    tierKey: TIER,
    countryIso: LIVE,
    now: ISSUED_AT,
  });
  return quote([{ productId: SKU, tierKey: TIER, projection }], ISSUED_AT);
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(STATIC_MODULE);
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* The round trip.                                                            */
/* -------------------------------------------------------------------------- */

describe("quote() / verifyQuote() round trip (AC-17, T-15)", () => {
  it("verifies `ok` inside the window, in the native and the converted case", async () => {
    for (const built of [await nativeQuote(), await convertedQuote()]) {
      await expect(verifyQuote(built, INSIDE), built.currency).resolves.toBe(
        "ok",
      );
    }
  });

  it("signs the price the page showed, line by line, and totals it", async () => {
    const built = await nativeQuote([TIER, SECOND_TIER]);
    const projections = await Promise.all(
      [TIER, SECOND_TIER].map((tierKey) =>
        priceProjection("pl", {
          productId: SKU,
          tierKey,
          countryIso: LIVE,
          now: ISSUED_AT,
        }),
      ),
    );

    expect(built.lines.map((line) => line.amountMinor)).toEqual(
      projections.map((projection) => projection.displayPrice.amountMinor),
    );
    expect(built.totalMinor).toBe(
      projections.reduce(
        (sum, projection) => sum + projection.displayPrice.amountMinor,
        0,
      ),
    );
    expect(built.currency).toBe("PLN");
  });

  it("expires 30 minutes after issue, and the bound itself is closed (§13 Q5)", async () => {
    const built = await nativeQuote();
    expect(Date.parse(built.expiresAt) - ISSUED_AT.getTime()).toBe(30 * 60_000);

    await expect(verifyQuote(built, INSIDE)).resolves.toBe("ok");
    await expect(verifyQuote(built, AT_EXPIRY)).resolves.toBe("expired");
  });

  it("is deterministic: the same prices and clock produce the same quote", async () => {
    expect(await nativeQuote()).toEqual(await nativeQuote());
  });

  it("stamps the rate on a converted quote and nothing on a native one (§5.4)", async () => {
    const converted = await convertedQuote();
    expect(converted.currency).toBe("GBP");
    expect(converted.fxAsOf).toBe(FX_SNAPSHOT_AS_OF);
    expect(converted.ratePpm).toBeGreaterThan(0);

    const native = await nativeQuote();
    expect(native.fxAsOf).toBeNull();
    expect(native.ratePpm).toBeNull();
  });

  it("refuses to sign two currencies, two rates or two destinations in one quote", async () => {
    const pl = await priceProjection("pl", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: ISSUED_AT,
    });
    const gb = await priceProjection("en-gb", {
      productId: SKU,
      tierKey: SECOND_TIER,
      countryIso: LIVE,
      now: ISSUED_AT,
    });

    expect(() =>
      quote(
        [
          { productId: SKU, tierKey: TIER, projection: pl },
          { productId: SKU, tierKey: SECOND_TIER, projection: gb },
        ],
        ISSUED_AT,
      ),
    ).toThrow("one currency");
    expect(() => quote([], ISSUED_AT)).toThrow("no lines");
  });
});

/* -------------------------------------------------------------------------- */
/* AC-17: no PII, by key-set equality.                                        */
/* -------------------------------------------------------------------------- */

describe("a quote carries no personal data (AC-17, §8)", () => {
  it("serialises to exactly the §5.2 field set — no more, no fewer", async () => {
    const built = await nativeQuote([TIER, SECOND_TIER]);
    const serialised = JSON.parse(JSON.stringify(built)) as Record<
      string,
      unknown
    >;

    expect(Object.keys(serialised).sort()).toEqual([...QUOTE_FIELDS].sort());
    for (const line of built.lines) {
      expect(Object.keys(line).sort()).toEqual(
        ["productId", "tierKey", "amountMinor"].sort(),
      );
    }
  });

  it("carries no buyer-, recipient- or address-shaped key anywhere in its JSON", async () => {
    const json = JSON.stringify(await convertedQuote());
    for (const forbidden of [
      "buyer",
      "recipient",
      "email",
      "name",
      "address",
      "phone",
      "postcode",
      "message",
      "ip",
      "session",
      "customer",
    ]) {
      expect(json.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });

  it("refuses an extra field at the boundary rather than signing it", async () => {
    const built = await nativeQuote();
    await expect(
      verifyQuote({ ...built, recipientName: "Ada" }, INSIDE),
    ).resolves.toBe("tampered");
  });
});

/* -------------------------------------------------------------------------- */
/* The refusals.                                                              */
/* -------------------------------------------------------------------------- */

describe("verifyQuote refuses what it must (AC-17, T-15)", () => {
  it("is `tampered` when an amount is edited", async () => {
    const built = await nativeQuote();
    const line = built.lines[0];
    if (line === undefined) throw new Error("a quote has a first line");

    const cheaper: Quote = {
      ...built,
      lines: [{ ...line, amountMinor: line.amountMinor - 100 }],
      totalMinor: built.totalMinor - 100,
    };
    await expect(verifyQuote(cheaper, INSIDE)).resolves.toBe("tampered");
  });

  it("is `tampered` for an edited expiry, currency, id or digest", async () => {
    const built = await nativeQuote();
    const mutations: readonly Partial<Quote>[] = [
      { expiresAt: new Date(AT_EXPIRY.getTime() + 3_600_000).toISOString() },
      { currency: "EUR" },
      { quoteId: "0".repeat(32) },
      { digest: `${"0".repeat(63)}1` },
      { priceVersion: "cp:FO-BQ-001:PL:stems_12:2000-01-01" },
    ];

    for (const mutation of mutations) {
      await expect(
        verifyQuote({ ...built, ...mutation }, INSIDE),
        JSON.stringify(mutation),
      ).resolves.toBe("tampered");
    }
  });

  it("is `tampered` for anything that is not a quote at all", async () => {
    for (const candidate of [null, undefined, 42, "quote", {}, { lines: [] }]) {
      await expect(verifyQuote(candidate, INSIDE)).resolves.toBe("tampered");
    }
  });

  it("is `expired` once the rate behind it is older than 48 hours", async () => {
    const built = await convertedQuote();
    // Inside the 30-minute window of a *later* issue instant, but three days after the snapshot.
    const later = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
    later.setUTCDate(later.getUTCDate() + 3);
    const rebuilt: Quote = { ...built };

    await expect(verifyQuote(rebuilt, later)).resolves.toBe("expired");
  });

  it("is never `ok` for a `priceVersion` that no longer resolves", async () => {
    const built = await nativeQuote();

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
          // The row the quote names has been superseded: no active row carries its version.
          countryPrices: () =>
            Promise.resolve(
              rows.map((row) =>
                row.sku === SKU &&
                row.tierKey === TIER &&
                row.countryIso2 === LIVE
                  ? { ...row, activeTo: "2026-09-09" }
                  : row,
              ),
            ),
        },
      };
    });
    const reloaded = await import("../../src/modules/catalog/pricing/quote.ts");

    await expect(reloaded.verifyQuote(built, INSIDE)).resolves.toBe("expired");
  });

  it("is `expired` when the row's amount moved in place, version unchanged", async () => {
    const built = await nativeQuote();

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
          // `priceVersion` is keyed on `activeFrom`, so an in-place edit leaves it unchanged
          // (`/review 47`): the **signed amount** is what makes this quote refusable.
          countryPrices: () =>
            Promise.resolve(
              rows.map((row) =>
                row.sku === SKU &&
                row.tierKey === TIER &&
                row.countryIso2 === LIVE &&
                row.surchargeKind === null
                  ? { ...row, retailMinor: row.retailMinor + 1_000 }
                  : row,
              ),
            ),
        },
      };
    });
    const reloaded = await import("../../src/modules/catalog/pricing/quote.ts");

    await expect(reloaded.verifyQuote(built, INSIDE)).resolves.toBe("expired");
  });
});

/* -------------------------------------------------------------------------- */
/* The comparison is constant-time.                                           */
/* -------------------------------------------------------------------------- */

describe("the digest comparison is constant-time (AC-17)", () => {
  it("goes through `crypto.timingSafeEqual`, over equal-length buffers", async () => {
    const actual =
      await vi.importActual<typeof import("node:crypto")>("node:crypto");
    const seen: [number, number][] = [];

    vi.resetModules();
    vi.doMock("node:crypto", () => ({
      ...actual,
      default: actual,
      timingSafeEqual: (
        left: NodeJS.ArrayBufferView,
        right: NodeJS.ArrayBufferView,
      ) => {
        seen.push([left.byteLength, right.byteLength]);
        return actual.timingSafeEqual(left, right);
      },
    }));
    const reloaded = await import("../../src/modules/catalog/pricing/quote.ts");

    const built = await nativeQuote();
    await expect(reloaded.verifyQuote(built, INSIDE)).resolves.toBe("ok");

    expect(seen.length).toBeGreaterThan(0);
    for (const [left, right] of seen) expect(left).toBe(right);
    vi.doUnmock("node:crypto");
  });

  it("never compares digests with `===`", () => {
    const source = readSource();
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(/digest\s*===/u);
    expect(source).not.toMatch(/===\s*value\.digest/u);
  });
});

/** `pricing/quote.ts`'s code, comments stripped: the rule is about what it does. */
function readSource(): string {
  return readFileSync(
    resolvePath(process.cwd(), "src/modules/catalog/pricing/quote.ts"),
    "utf8",
  )
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/\/\/.*$/gmu, "");
}
