/**
 * The card limits in graphemes (spec 010 §13 Q9, AC-10 / T-10 unit half; TASK-200), and the rest
 * of step 2's schema and the two machine posts (§5.2: `CardAndBuyerStepSchema`,
 * `CheckoutStartSchema`, `ReviewStepSchema`; AC-12's field set at the schema).
 *
 * `countGraphemes()` counts a Polish letter, a Cyrillic letter and a ZWJ emoji sequence as one
 * each, precomposed or not; the card message takes exactly 200 and refuses 201 on the server,
 * "sign as" takes 40 and refuses 41, and both are stored in NFC.
 */
import { describe, expect, it } from "vitest";

import { CHECKOUT_LIMITS } from "../../src/config/checkout.ts";
import {
  CHECKOUT_ERROR_KEYS,
  CardAndBuyerStepSchema,
  CheckoutStartSchema,
  ReviewStepSchema,
} from "../../src/modules/checkout/index.ts";
import { countGraphemes } from "../../src/modules/i18n/index.ts";

/** A family: man, woman, girl, boy, joined by three zero-width joiners. Eleven code units. */
const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
/** "ł" precomposed, and "ę" decomposed into `e` plus a combining ogonek. */
const POLISH = "ł";
const POLISH_DECOMPOSED = "ę";
const CYRILLIC = "Ж";

describe("countGraphemes() counts what a reader sees (AC-10, T-10)", () => {
  it.each([
    ["a Polish letter", POLISH],
    ["a decomposed Polish letter", POLISH_DECOMPOSED],
    ["a Cyrillic letter", CYRILLIC],
    ["a ZWJ emoji sequence", FAMILY],
    ["a flag (two regional indicators)", "\u{1F1F5}\u{1F1F1}"],
  ])("counts %s as one", (_label, text) => {
    expect(countGraphemes(text, "pl")).toBe(1);
  });

  it("is not the code-unit length", () => {
    expect(FAMILY.length).toBe(11);
    expect(countGraphemes(`${FAMILY}${POLISH}${CYRILLIC}`, "en")).toBe(3);
    expect(countGraphemes("Wszystkiego najlepszego!", "pl")).toBe(24);
    expect(countGraphemes("", "de")).toBe(0);
  });

  it("refuses an unknown locale", () => {
    expect(() => countGraphemes("a", "xx" as "en")).toThrow(/unknown locale/u);
  });
});

const BUYER = {
  email: "sample.buyer@example.com",
  buyerName: "Sam Sample",
  buyerPhone: "",
  residenceCountry: "GB",
} as const;

const schema = () =>
  CardAndBuyerStepSchema({
    locale: "pl",
    offeredAddonKeys: ["chocolates", "vase", "card"],
  });

/** `n` graphemes, mixing every awkward kind, with the code-unit count far above `n`. */
function graphemes(n: number): string {
  const units = [POLISH, POLISH_DECOMPOSED, CYRILLIC, FAMILY, "a"];
  return Array.from({ length: n }, (_, i) => units[i % units.length]).join("");
}

describe("the card message and 'sign as' are limited in graphemes on the server (AC-10)", () => {
  it("states the limits of §13 Q9", () => {
    expect(CHECKOUT_LIMITS.cardMessage).toBe(200);
    expect(CHECKOUT_LIMITS.signAs).toBe(40);
  });

  it("accepts a card message of exactly 200 graphemes", () => {
    const text = graphemes(200);
    expect(text.length).toBeGreaterThan(400);
    const result = schema().safeParse({ ...BUYER, cardMessage: text });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(result.data?.cardMessage).toBe(text.normalize("NFC"));
  });

  it("refuses 201 graphemes with the too-long key and the limit", () => {
    const result = schema().safeParse({
      ...BUYER,
      cardMessage: graphemes(201),
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["cardMessage"],
        message: CHECKOUT_ERROR_KEYS.tooLong,
        params: { max: 200 },
      }),
    ]);
  });

  it("accepts 40 graphemes of 'sign as' and refuses 41", () => {
    expect(
      schema().safeParse({ ...BUYER, signAs: graphemes(40) }).success,
    ).toBe(true);
    const result = schema().safeParse({ ...BUYER, signAs: graphemes(41) });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["signAs"],
      message: CHECKOUT_ERROR_KEYS.tooLong,
      params: { max: 40 },
    });
  });

  it("stores both in NFC", () => {
    const parsed = schema().parse({
      ...BUYER,
      cardMessage: `Kocham Ci${POLISH_DECOMPOSED}`,
      signAs: `Mam${POLISH_DECOMPOSED}`,
    });
    expect(parsed.cardMessage).toBe("Kocham Cię");
    expect(parsed.signAs).toBe("Mamę");
  });

  it("treats a blank or whitespace card message as no card", () => {
    expect(schema().parse({ ...BUYER }).cardMessage).toBe("");
    expect(schema().parse({ ...BUYER, cardMessage: "  \n " }).cardMessage).toBe(
      "",
    );
  });
});

describe("step 2's field set (AC-11, AC-12 at the schema)", () => {
  it("parses the buyer's details and turns a blank phone into none", () => {
    expect(schema().parse({ ...BUYER, addonKeys: ["vase"] })).toEqual({
      cardMessage: "",
      signAs: "",
      addonKeys: ["vase"],
      email: "sample.buyer@example.com",
      buyerName: "Sam Sample",
      buyerPhone: null,
      residenceCountry: "GB",
    });
  });

  it("selects no add-on unless the buyer posts one", () => {
    expect(schema().parse(BUYER).addonKeys).toEqual([]);
  });

  it("refuses an add-on not on offer for the destination, and a repeated one", () => {
    for (const addonKeys of [["wine"], ["vase", "vase"]]) {
      expect(
        schema().safeParse({ ...BUYER, addonKeys }).error?.issues[0]?.message,
        JSON.stringify(addonKeys),
      ).toBe(CHECKOUT_ERROR_KEYS.addonUnavailable);
    }
  });

  it("has no field for a marketing opt-in, a WhatsApp opt-in, a password, a pre-selected add-on or a currency", () => {
    for (const extra of [
      { marketingConsent: "on" },
      { whatsappOptIn: "on" },
      { password: "x" },
      { defaultAddons: ["vase"] },
      { currency: "EUR" },
    ]) {
      expect(
        schema().safeParse({ ...BUYER, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it("requires a valid email and a name", () => {
    expect(
      schema().safeParse({ ...BUYER, email: "not-an-email" }).error?.issues[0]
        ?.message,
    ).toBe(CHECKOUT_ERROR_KEYS.emailInvalid);
    expect(
      schema().safeParse({ ...BUYER, email: "" }).error?.issues[0]?.message,
    ).toBe(CHECKOUT_ERROR_KEYS.required);
    expect(
      schema().safeParse({ ...BUYER, buyerName: " " }).error?.issues[0]
        ?.message,
    ).toBe(CHECKOUT_ERROR_KEYS.required);
  });

  it("accepts any country of residence with a numbering plan and refuses anything else", () => {
    for (const country of ["GB", "PL", "US", "BR", "JP", "NZ"]) {
      expect(
        schema().safeParse({ ...BUYER, residenceCountry: country }).success,
        country,
      ).toBe(true);
    }
    for (const country of ["gb", "XX", "", "GBR"]) {
      expect(
        schema().safeParse({ ...BUYER, residenceCountry: country }).error
          ?.issues[0]?.message,
        country,
      ).toBe(CHECKOUT_ERROR_KEYS.countryInvalid);
    }
  });

  it("parses an optional buyer phone in the residence country's plan and stores E.164", () => {
    expect(
      schema().parse({ ...BUYER, buyerPhone: "020 7925 0918" }).buyerPhone,
    ).toBe("+442079250918");
    const bad = schema().safeParse({ ...BUYER, buyerPhone: "12" });
    expect(bad.error?.issues[0]).toMatchObject({
      path: ["buyerPhone"],
      message: CHECKOUT_ERROR_KEYS.phoneInvalid,
    });
  });
});

describe("the two machine posts (§5.2)", () => {
  const start = {
    locale: "en-gb",
    countryIso: "PL",
    sku: "FO-BQ-001",
    tierKey: "m",
    expectedTotalMinor: "4590",
    expectedCurrency: "GBP",
  };

  it("CheckoutStartSchema reads the total a form posts as integer minor units", () => {
    const parsed = CheckoutStartSchema.safeParse(start);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.expectedTotalMinor).toBe(4590);
  });

  it("CheckoutStartSchema refuses a decimal amount, an unknown destination or currency, and extra fields", () => {
    for (const change of [
      { expectedTotalMinor: "45.90" },
      { expectedTotalMinor: -1 },
      { countryIso: "pl" },
      { countryIso: "XX" },
      { expectedCurrency: "XYZ" },
      { locale: "fr" },
      { email: "a@example.com" },
      { date: "14.02.2027" },
    ]) {
      expect(
        CheckoutStartSchema.safeParse({ ...start, ...change }).success,
        JSON.stringify(change),
      ).toBe(false);
    }
  });

  it("ReviewStepSchema takes the confirmed total, currency and quote digest, and nothing else", () => {
    const review = {
      confirmedTotalMinor: 4590,
      confirmedCurrency: "GBP",
      quoteDigest: "a".repeat(64),
    };
    expect(ReviewStepSchema.parse(review)).toEqual(review);
    for (const change of [
      { quoteDigest: "A".repeat(64) },
      { confirmedTotalMinor: 45.9 },
      { confirmedCurrency: "gbp" },
      { amount: 1 },
    ]) {
      expect(
        ReviewStepSchema.safeParse({ ...review, ...change }).success,
        JSON.stringify(change),
      ).toBe(false);
    }
  });
});
