/**
 * Spec 047's pure core (§5.2; TASK-445): T-02 (schema half), T-11, T-17 (property half), T-29,
 * T-30 (unit half), and the config pinned to migration `0037_discount_codes`.
 *
 *  - AC-2: `DiscountCodeInputSchema` refuses each rule of §5.1 on its own field;
 *  - AC-11: `normaliseCode`'s table, the dotted capital I and an emoji refused, and no query for
 *    either (`lookupTypedCode` with a spying connection);
 *  - AC-17: 1 000 seeded random purchases through `discountAmount`, `allocateDiscount` and
 *    `vatBreakdown`: shares are integers within their lines, sum to the discount, and the per-rate
 *    gross values sum to the charged total;
 *  - AC-29: `EvaluationContext` has exactly its keys, none for the buyer's country, IP, locale or
 *    user agent; a Poland-only code gives the same result whoever the buyer is;
 *  - AC-30: `issueCode` accepts `source: 'referral'` with an `issuerRef`;
 *  - `evaluateCode` returns each refusal reason, in §5.2's order.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DISCOUNT_CODE_MAX_LENGTH,
  DISCOUNT_CODE_MIN_LENGTH,
  DISCOUNT_GENERATED_ALPHABET,
  DISCOUNT_GENERATED_LENGTH,
  DISCOUNT_LABEL_MAX_LENGTH,
  DISCOUNT_PERCENT_MAX_BP,
  DISCOUNT_PERCENT_MIN_BP,
} from "../../src/config/discounts.ts";
import {
  VatLineSchema,
  vatBreakdown,
} from "../../src/modules/catalog/index.ts";
import {
  allocateDiscount,
  discountAmount,
  DiscountCodeInputSchema,
  emailKey,
  evaluateCode,
  type EvaluationContext,
  generateCode,
  issueCode,
  lookupTypedCode,
  normaliseCode,
  type PurchaseLine,
  toBaseMinor,
} from "../../src/modules/discounts/index.ts";

const MIGRATION = readFileSync(
  resolve(import.meta.dirname, "../../db/migrations/0037_discount_codes.sql"),
  "utf8",
);

const PL = "00000000-0000-4000-8000-0000000000a1";
const DE = "00000000-0000-4000-8000-0000000000a2";
const ROSES = "00000000-0000-4000-8000-0000000000b1";
const TULIPS = "00000000-0000-4000-8000-0000000000b2";

describe("config pinned to 0037_discount_codes", () => {
  it("uses the migration's bounds", () => {
    expect(MIGRATION).toContain(
      `percent_bp BETWEEN ${String(DISCOUNT_PERCENT_MIN_BP)} AND ${String(DISCOUNT_PERCENT_MAX_BP)}`,
    );
    expect(MIGRATION).toContain(
      `'^[A-Z0-9]{${String(DISCOUNT_CODE_MIN_LENGTH)},${String(DISCOUNT_CODE_MAX_LENGTH)}}$'`,
    );
    expect(MIGRATION).toContain(
      `char_length(campaign_label) BETWEEN 1 AND ${String(DISCOUNT_LABEL_MAX_LENGTH)}`,
    );
    expect(MIGRATION).toContain("amount_off_minor * 2 <= min_order_minor");
  });
});

describe("normaliseCode (AC-11)", () => {
  it.each([
    [" polonia-10 ", "POLONIA10"],
    ["POLONIA 10", "POLONIA10"],
    ["Polonia10", "POLONIA10"],
    ["\tab-cd ef\n", "ABCDEF"],
  ])("maps %j to %s", (raw, expected) => {
    expect(normaliseCode(raw)).toBe(expected);
  });

  it.each([
    ["POLİA10X", "dotted capital I"],
    ["POLONIA10🌷", "emoji"],
    ["polonıa10", "dotless i"],
    ["STRAßE10", "sharp s (toUpperCase would make SS)"],
    ["ŁÓDŹ2026", "Polish letters"],
    ["ABCDE", "five characters"],
    ["A".repeat(33), "33 characters"],
    ["POLONIA_10", "underscore"],
  ])("refuses %j (%s)", (raw) => {
    expect(normaliseCode(raw)).toBeNull();
  });

  it("refuses the dotted capital I of AC-11 exactly", () => {
    expect(normaliseCode("POLONİA10")).toBeNull();
  });

  it("looks nothing up for a value that cannot be a code", async () => {
    const queries: SQL[] = [];
    const connection = {
      db: {
        execute: (query: SQL) => {
          queries.push(query);
          return Promise.resolve([]);
        },
      },
    };
    expect(await lookupTypedCode("POLONİA10", connection)).toBeNull();
    expect(await lookupTypedCode("🌷🌷🌷🌷🌷🌷", connection)).toBeNull();
    expect(queries).toHaveLength(0);
    expect(await lookupTypedCode("polonia10", connection)).toBeNull();
    expect(queries).toHaveLength(1);
  });
});

describe("emailKey", () => {
  it("folds case and a +tag to one key, SHA-256 hex", () => {
    const key = emailKey("anna@example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(emailKey("Anna+x@Example.com")).toBe(key);
    expect(emailKey(" ANNA+newsletter+2@EXAMPLE.COM ")).toBe(key);
    expect(emailKey("anna2@example.com")).not.toBe(key);
    expect(emailKey("anna@example.org")).not.toBe(key);
  });
});

describe("generateCode", () => {
  it("draws 10 characters from the look-alike-free alphabet", () => {
    for (let run = 0; run < 50; run += 1) {
      const code = generateCode();
      expect(code).toHaveLength(DISCOUNT_GENERATED_LENGTH);
      expect(code).toMatch(/^[A-HJKMNP-TV-Z2-9]{10}$/u);
      expect(normaliseCode(code)).toBe(code);
    }
    expect(DISCOUNT_GENERATED_ALPHABET).not.toMatch(/[ILOU01]/u);
  });
});

describe("discountAmount", () => {
  const percent = (bp: number) => ({
    kind: "percent" as const,
    percentBp: bp,
    currencies: [],
  });
  it("rounds a percent half up in integers", () => {
    expect(
      discountAmount(percent(1000), { amountMinor: 1005, currency: "PLN" }),
    ).toEqual({
      amountMinor: 101,
      currency: "PLN",
    });
    expect(
      discountAmount(percent(1000), { amountMinor: 1004, currency: "PLN" })
        .amountMinor,
    ).toBe(100);
    expect(
      discountAmount(percent(1250), { amountMinor: 4999, currency: "GBP" })
        .amountMinor,
    ).toBe(625);
    expect(
      discountAmount(percent(5000), { amountMinor: 1, currency: "GBP" })
        .amountMinor,
    ).toBe(1);
    expect(
      discountAmount(percent(100), { amountMinor: 0, currency: "GBP" })
        .amountMinor,
    ).toBe(0);
  });

  it("takes a fixed code's amount for the currency, never above the subtotal (AC-9)", () => {
    const fixed = {
      kind: "fixed" as const,
      percentBp: null,
      currencies: [
        { currency: "GBP", amountOffMinor: 500 },
        { currency: "EUR", amountOffMinor: 600 },
      ],
    };
    expect(
      discountAmount(fixed, { amountMinor: 4000, currency: "GBP" }).amountMinor,
    ).toBe(500);
    expect(
      discountAmount(fixed, { amountMinor: 4000, currency: "EUR" }).amountMinor,
    ).toBe(600);
    expect(
      discountAmount(fixed, { amountMinor: 4000, currency: "PLN" }).amountMinor,
    ).toBe(0);
    expect(
      discountAmount(fixed, { amountMinor: 300, currency: "GBP" }).amountMinor,
    ).toBe(300);
  });
});

describe("allocateDiscount", () => {
  it("is proportional, largest remainder, ties to the earlier line", () => {
    const lines = [
      { grossMinor: 100, currency: "PLN" },
      { grossMinor: 100, currency: "PLN" },
      { grossMinor: 100, currency: "PLN" },
    ];
    expect(
      allocateDiscount(lines, { amountMinor: 100, currency: "PLN" }).map(
        (l) => l.shareMinor,
      ),
    ).toEqual([34, 33, 33]);
    expect(
      allocateDiscount(lines, { amountMinor: 2, currency: "PLN" }).map(
        (l) => l.shareMinor,
      ),
    ).toEqual([1, 1, 0]);
    const mixed = [
      { grossMinor: 15999, currency: "PLN" },
      { grossMinor: 3999, currency: "PLN" },
      { grossMinor: 1000, currency: "PLN" },
    ];
    const shares = allocateDiscount(mixed, {
      amountMinor: 2100,
      currency: "PLN",
    });
    expect(shares.map((l) => l.shareMinor)).toEqual([1600, 400, 100]);
    expect(shares.map((l) => l.paidMinor)).toEqual([14399, 3599, 900]);
  });

  it("refuses a discount above the lines and a line in another currency", () => {
    expect(() =>
      allocateDiscount([{ grossMinor: 10, currency: "PLN" }], {
        amountMinor: 11,
        currency: "PLN",
      }),
    ).toThrow(RangeError);
    expect(() =>
      allocateDiscount([{ grossMinor: 10, currency: "EUR" }], {
        amountMinor: 1,
        currency: "PLN",
      }),
    ).toThrow(RangeError);
  });
});

describe("toBaseMinor", () => {
  it("converts at the order's ppm, half up, at least one unit", () => {
    expect(toBaseMinor(500, null)).toBe(500);
    // 1 PLN base = 0.2 GBP buyer: 200 000 ppm; a 500-unit GBP discount is 2 500 PLN units.
    expect(toBaseMinor(500, 200_000)).toBe(2500);
    expect(toBaseMinor(1, 3_000_000)).toBe(1);
    expect(toBaseMinor(5, 2_000_000)).toBe(3);
    expect(toBaseMinor(0, 2_000_000)).toBe(0);
  });
});

/** A purchase: a PLN bouquet at 8 %, chocolates at 23 % and a date surcharge at 8 % (AC-8's fixture). */
function plnPurchase(): (PurchaseLine & { readonly vatRateBp: number })[] {
  return [
    {
      grossMinor: 15999,
      currency: "PLN",
      destinationCountryId: PL,
      productId: ROSES,
      vatRateBp: 800,
    },
    {
      grossMinor: 3999,
      currency: "PLN",
      destinationCountryId: PL,
      productId: ROSES,
      vatRateBp: 2300,
    },
    {
      grossMinor: 1000,
      currency: "PLN",
      destinationCountryId: PL,
      productId: ROSES,
      vatRateBp: 800,
    },
  ];
}

function context(
  overrides: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    code: {
      id: "00000000-0000-4000-8000-0000000000c1",
      codeNormalised: "POLONIA10",
      kind: "percent",
      percentBp: 1000,
      startsAt: new Date("2026-11-01T00:00:00Z"),
      endsAt: new Date("2026-12-01T00:00:00Z"),
      maxRedemptions: 3,
      maxPerEmail: 1,
      status: "active",
    },
    currencies: [
      { currency: "PLN", amountOffMinor: null, minOrderMinor: 5000 },
    ],
    countryIds: [PL],
    productIds: [],
    now: new Date("2026-11-08T12:00:00Z"),
    purchase: { currency: "PLN", lines: plnPurchase() },
    emailKey: emailKey("anna@example.com"),
    counts: { uses: 0, usesForEmail: 0 },
    locked: false,
    ...overrides,
  };
}

describe("evaluateCode", () => {
  it("applies a valid 10 % code over the whole purchase (AC-8 values)", () => {
    const result = evaluateCode(context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.amount).toEqual({ amountMinor: 2100, currency: "PLN" });
    expect(result.allocation.map((line) => line.shareMinor)).toEqual([
      1600, 400, 100,
    ]);
  });

  it("returns each reason, in §5.2's order", () => {
    const base = context();
    const code = base.code;
    if (code === null) throw new Error("fixture");
    const reason = (ctx: EvaluationContext) => {
      const result = evaluateCode(ctx);
      return result.ok ? "ok" : result.reason;
    };
    expect(reason(context({ locked: true, code: null }))).toBe("locked");
    expect(reason(context({ code: null }))).toBe("unknown");
    expect(reason(context({ code: { ...code, status: "disabled" } }))).toBe(
      "unknown",
    );
    expect(reason(context({ now: new Date("2026-10-31T23:59:59Z") }))).toBe(
      "not_started",
    );
    expect(reason(context({ now: new Date("2026-12-01T00:00:00Z") }))).toBe(
      "ended",
    );
    expect(reason(context({ countryIds: [DE] }))).toBe("wrong_destination");
    expect(reason(context({ productIds: [TULIPS] }))).toBe("wrong_product");
    expect(
      reason(
        context({
          code: { ...code, kind: "fixed", percentBp: null },
          currencies: [
            { currency: "GBP", amountOffMinor: 500, minOrderMinor: 1000 },
          ],
        }),
      ),
    ).toBe("wrong_currency");
    expect(
      reason(
        context({
          currencies: [
            { currency: "PLN", amountOffMinor: null, minOrderMinor: 20999 },
          ],
        }),
      ),
    ).toBe("below_minimum");
    expect(
      reason(
        context({
          currencies: [
            { currency: "PLN", amountOffMinor: null, minOrderMinor: 20998 },
          ],
        }),
      ),
    ).toBe("ok");
    expect(reason(context({ counts: { uses: 3, usesForEmail: 0 } }))).toBe(
      "used_up",
    );
    expect(reason(context({ counts: { uses: 2, usesForEmail: 1 } }))).toBe(
      "already_used_by_you",
    );
    expect(
      reason(context({ counts: { uses: 2, usesForEmail: 1 }, emailKey: null })),
    ).toBe("ok");
    // Earlier reasons win: an ended code that is also used up says "ended".
    expect(
      reason(
        context({
          now: new Date("2026-12-02T00:00:00Z"),
          counts: { uses: 9, usesForEmail: 9 },
        }),
      ),
    ).toBe("ended");
  });

  it("spreads over in-scope lines only, and refuses scope only when no line is eligible", () => {
    const lines = [
      ...plnPurchase(),
      {
        grossMinor: 9999,
        currency: "PLN",
        destinationCountryId: PL,
        productId: TULIPS,
        vatRateBp: 800,
      },
    ];
    const result = evaluateCode(
      context({ purchase: { currency: "PLN", lines }, productIds: [TULIPS] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.amount.amountMinor).toBe(1000);
    expect(result.allocation.map((line) => line.shareMinor)).toEqual([
      0, 0, 0, 1000,
    ]);
  });

  it("has no parameter for the buyer's country, IP, locale or user agent (AC-29)", () => {
    expectTypeOf<keyof EvaluationContext>().toEqualTypeOf<
      | "code"
      | "currencies"
      | "countryIds"
      | "productIds"
      | "now"
      | "purchase"
      | "emailKey"
      | "counts"
      | "locked"
    >();
    expectTypeOf<keyof EvaluationContext["purchase"]>().toEqualTypeOf<
      "currency" | "lines"
    >();
    expectTypeOf<keyof PurchaseLine>().toEqualTypeOf<
      "grossMinor" | "currency" | "destinationCountryId" | "productId"
    >();
  });

  it("applies a Poland-only code identically whoever the buyer is (AC-29)", () => {
    const results = ["GB", "DE", "PL"].map((residence) =>
      evaluateCode({
        ...context(),
        residence,
        ip: "203.0.113.9",
        locale: residence,
      } as EvaluationContext),
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]?.ok).toBe(true);
  });
});

describe("DiscountCodeInputSchema (AC-2, schema half)", () => {
  const valid = {
    code: "polonia-10",
    campaignLabel: "Polish Saturday school, Ealing",
    kind: "percent",
    percentBp: 1000,
    currencies: [{ currency: "GBP", minOrderMinor: 2000 }],
    startsAt: "2026-11-01T00:00:00+00:00",
    endsAt: "2026-11-30T23:59:00+00:00",
    countryIds: [PL],
    productIds: [],
  };
  const fields = (input: unknown) => {
    const result = DiscountCodeInputSchema.safeParse(input);
    return result.success
      ? []
      : result.error.issues.map(
          (issue) => `${issue.path.join(".")}:${issue.message}`,
        );
  };

  it("accepts a valid code", () => {
    expect(fields(valid)).toEqual([]);
  });

  it.each([
    [{ percentBp: 99 }, "percentBp:percentRange"],
    [{ percentBp: 5001 }, "percentBp:percentRange"],
    [{ kind: "fixed", percentBp: undefined }, "currencies:fixedNeedsAmount"],
    [
      {
        kind: "fixed",
        percentBp: undefined,
        currencies: [
          { currency: "GBP", amountOffMinor: 1001, minOrderMinor: 2000 },
        ],
      },
      "currencies.0.amountOffMinor:amountAboveCeiling",
    ],
    [{ endsAt: "2026-11-01T00:00:00+00:00" }, "endsAt:endsBeforeStart"],
    [{ endsAt: "2026-10-31T23:00:00+00:00" }, "endsAt:endsBeforeStart"],
    [{ code: "abc-123" }, null],
    [{ code: "ABC12" }, "code:codeShape"],
    [{ code: "A".repeat(33) }, "code:codeShape"],
    [{ code: "POLONİA10" }, "code:codeShape"],
    [
      {
        currencies: [
          { currency: "GBP", amountOffMinor: 500, minOrderMinor: 2000 },
        ],
      },
      "currencies.0.amountOffMinor:percentHasAmount",
    ],
    [{ campaignLabel: "x".repeat(81) }, "campaignLabel:labelLength"],
    [
      { currencies: [{ currency: "XXX", minOrderMinor: 0 }] },
      "currencies.0.currency:currencyUnknown",
    ],
  ])("refuses %j on its field", (patch, expected) => {
    const issues = fields({ ...valid, ...patch });
    if (expected === null) expect(issues).toEqual([]);
    else expect(issues).toContain(expected);
  });

  it("accepts a fixed amount at exactly half the minimum", () => {
    expect(
      fields({
        ...valid,
        kind: "fixed",
        percentBp: undefined,
        currencies: [
          { currency: "GBP", amountOffMinor: 1000, minOrderMinor: 2000 },
        ],
      }),
    ).toEqual([]);
  });
});

describe("issueCode with source referral (AC-30)", () => {
  it("parses the referral hook and inserts with it", async () => {
    const dialect = new PgDialect();
    const statements: { sql: string; params: unknown[] }[] = [];
    const connection = {
      db: {
        execute: (query: SQL) => {
          const built = dialect.sqlToQuery(query);
          statements.push({ sql: built.sql, params: built.params });
          return Promise.resolve(
            /RETURNING id/u.test(built.sql)
              ? [{ id: "00000000-0000-4000-8000-0000000000d1" }]
              : [],
          );
        },
      },
    };
    const result = await issueCode(
      {
        code: "FRIEND-ANNA-01",
        campaignLabel: "Referral",
        kind: "percent",
        percentBp: 1000,
        currencies: [],
        startsAt: "2026-11-01T00:00:00Z",
        countryIds: [],
        productIds: [],
        source: "referral",
        issuerRef: "customer:42",
      },
      { userId: null },
      connection,
    );
    expect(result).toEqual({
      ok: true,
      id: "00000000-0000-4000-8000-0000000000d1",
      codeNormalised: "FRIENDANNA01",
    });
    const insert = statements.find((s) =>
      /INSERT INTO public\.discount_code\s/u.test(s.sql),
    );
    expect(insert?.params).toContain("referral");
    expect(insert?.params).toContain("customer:42");
    // The default per-email cap of one applies when none is given (§13 Q4).
    expect(insert?.params).toContain(1);
  });

  it("refuses an unknown source", async () => {
    const connection = { db: { execute: () => Promise.resolve([]) } };
    const result = await issueCode(
      {
        code: "FRIENDANNA01",
        campaignLabel: "Referral",
        kind: "percent",
        percentBp: 1000,
        currencies: [],
        startsAt: "2026-11-01T00:00:00Z",
        countryIds: [],
        productIds: [],
        source: "partner",
      },
      { userId: null },
      connection,
    );
    expect(result.ok).toBe(false);
  });
});

/** A small seeded PRNG (mulberry32), so a failure reproduces. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("1 000 random purchases (AC-17, property half)", () => {
  it("keeps every share an integer within its line, summing to the discount and the total", () => {
    const random = prng(47_047);
    const int = (min: number, max: number) =>
      min + Math.floor(random() * (max - min + 1));
    const currencies = ["GBP", "EUR", "PLN"] as const;
    const rates = [0, 500, 800, 2000, 2300];
    for (let run = 0; run < 1000; run += 1) {
      const currency = currencies[int(0, 2)] ?? "PLN";
      const lines = Array.from({ length: int(1, 6) }, () => ({
        grossMinor: int(0, 60_000),
        currency,
        vatRateBp: rates[int(0, rates.length - 1)] ?? 0,
      }));
      const subtotal = lines.reduce((sum, line) => sum + line.grossMinor, 0);
      const isPercent = random() < 0.5;
      const amount = discountAmount(
        isPercent
          ? { kind: "percent", percentBp: int(100, 5000), currencies: [] }
          : {
              kind: "fixed",
              percentBp: null,
              currencies: [{ currency, amountOffMinor: int(1, 20_000) }],
            },
        { amountMinor: subtotal, currency },
      );
      expect(Number.isInteger(amount.amountMinor)).toBe(true);
      expect(amount.amountMinor).toBeLessThanOrEqual(subtotal);
      const allocation = allocateDiscount(lines, amount);
      let shares = 0;
      for (const line of allocation) {
        expect(Number.isInteger(line.shareMinor)).toBe(true);
        expect(line.shareMinor).toBeGreaterThanOrEqual(0);
        expect(line.shareMinor).toBeLessThanOrEqual(line.grossMinor);
        expect(line.paidMinor).toBe(line.grossMinor - line.shareMinor);
        shares += line.shareMinor;
      }
      expect(shares).toBe(amount.amountMinor);
      const charged = subtotal - amount.amountMinor;
      const split = vatBreakdown(
        allocation.map((line) =>
          VatLineSchema.parse({
            rateBp: line.vatRateBp,
            grossMinor: line.paidMinor,
            currency,
          }),
        ),
      );
      expect(split.reduce((sum, entry) => sum + entry.grossMinor, 0)).toBe(
        charged,
      );
      for (const entry of split)
        expect(entry.netMinor + entry.vatMinor).toBe(entry.grossMinor);
    }
  });
});
