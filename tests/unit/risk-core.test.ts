/**
 * Spec 021's pure core (TASK-493): T-01 (AC-1), T-08 (AC-8), T-09 (AC-9), T-10 (AC-10), T-12
 * (AC-12), T-13 unit half (AC-13), T-17 (AC-17), T-30 unit half (AC-30), T-31 unit half (AC-31)
 * and the card-testing thresholds of AC-6.
 */
import { createHmac } from "node:crypto";
import { domainToUnicode } from "node:url";

import { describe, expect, expectTypeOf, it } from "vitest";

import { relayMatches } from "../../src/config/honesty.ts";
import {
  FIRST_ORDER_BAND,
  REVIEW_BAND,
  RISK_CURRENCIES,
  RISK_SIGNAL_IDS,
  RISK_SIGNALS,
  type RiskCurrency,
  STRICT_BAND,
} from "../../src/config/risk.ts";
import { RELAY_ALLOWLIST } from "../../src/config/risk/relay-allowlist.ts";
import { ENV_KEYS, validateEnv } from "../../src/lib/env.schema.ts";
import { TEST_RISK_HASH_KEY, riskHashKey } from "../../src/lib/env.risk.ts";
import {
  STRIPE_CHARGE_CURRENCIES,
  fromStripeCurrency,
} from "../../src/modules/payments/stripe/amount.ts";
import {
  ACCUSATION_PATTERNS,
  type RiskInputV1,
  accusationMatches,
  bandFor,
  cardMessageMatches,
  cardTestingSuspected,
  identityHash,
  isDisposableEmail,
  isHighScore,
  normaliseAddress,
  normaliseEmail,
  reviewDeadline,
  scoreOrder,
} from "../../src/modules/risk/index.ts";

import en from "../../messages/en.json" with { type: "json" };
import de from "../../messages/de.json" with { type: "json" };
import pl from "../../messages/pl.json" with { type: "json" };
import enGb from "../../messages/en-gb.json" with { type: "json" };

/* ------------------------------------------------------------------------------------------- */
/* T-01 (AC-1)                                                                                  */
/* ------------------------------------------------------------------------------------------- */

describe("T-01 (AC-1) · isDisposableEmail", () => {
  const disposable = [
    "mailinator.com",
    "guerrillamail.com",
    "10minutemail.com",
    "yopmail.com",
    "0-mail.com",
  ];

  it("is true for every fixture domain of the vendored list and for a subdomain of one", () => {
    for (const domain of disposable) {
      expect(isDisposableEmail(`anna@${domain}`), domain).toBe(true);
    }
    expect(isDisposableEmail("anna@inbox.mailinator.com")).toBe(true);
    expect(isDisposableEmail("Anna@MAILINATOR.COM ")).toBe(true);
  });

  it("is false for every relay domain and for common providers", () => {
    for (const domain of RELAY_ALLOWLIST) {
      expect(isDisposableEmail(`x7k2@${domain}`), domain).toBe(false);
    }
    for (const domain of [
      "gmail.com",
      "outlook.com",
      "wp.pl",
      "onet.pl",
      "gmx.de",
    ]) {
      expect(isDisposableEmail(`anna@${domain}`), domain).toBe(false);
    }
  });

  it("matches an IDN domain after punycode conversion", () => {
    const unicode = domainToUnicode("xn--9kq967o.com");
    expect(unicode).not.toBe("xn--9kq967o.com");
    expect(isDisposableEmail(`anna@${unicode}`)).toBe(true);
  });

  it("turns a relay red when it leaves the allowlist (the allowlist wins over the list)", () => {
    const lists = {
      disposable: new Set(["duck.com", "mailinator.com"]),
      relays: RELAY_ALLOWLIST,
    };
    expect(isDisposableEmail("a@duck.com", lists)).toBe(false);
    expect(
      isDisposableEmail("a@duck.com", {
        ...lists,
        relays: RELAY_ALLOWLIST.filter((domain) => domain !== "duck.com"),
      }),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------- */
/* Normalisation and hashing (AC-14's normalisation half, AC-31)                                */
/* ------------------------------------------------------------------------------------------- */

describe("normalisers and identityHash (AC-31)", () => {
  const key = Buffer.from(TEST_RISK_HASH_KEY, "base64");

  it("normalises an email: tags, gmail dots, googlemail, IDN, case", () => {
    expect(normaliseEmail(" A.B+x@Gmail.com ")).toBe("ab@gmail.com");
    expect(normaliseEmail("a.b@googlemail.com")).toBe("ab@gmail.com");
    expect(normaliseEmail("a.b+promo@wp.pl")).toBe("a.b@wp.pl");
    expect(normaliseEmail("anna@bücher.de")).toBe("anna@xn--bcher-kva.de");
    expect(normaliseEmail("no-at-sign")).toBeNull();
  });

  it("normalises an address so two spellings hash once", () => {
    const a = normaliseAddress({
      countryIso2: "pl",
      postcode: "00-001",
      line1: "ul. Łąkowa 5",
    });
    const b = normaliseAddress({
      countryIso2: "PL",
      postcode: "00 001",
      line1: "UL  LAKOWA, 5",
    });
    expect(a).toBe("PL|00001|ul lakowa 5");
    expect(b).toBe(a);
    expect(
      normaliseAddress({
        countryIso2: "DE",
        postcode: "10115",
        line1: "Straße 1",
      }),
    ).toBe("DE|10115|strasse 1");
  });

  it("is HMAC-SHA-256 under the key over kind:value, as 64 hex characters", () => {
    const expected = createHmac("sha256", key)
      .update("email:ab@gmail.com")
      .digest("hex");
    expect(identityHash("email", "ab@gmail.com", key)).toBe(expected);
    expect(identityHash("email", "ab@gmail.com", key)).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(identityHash("card", "ab@gmail.com", key)).not.toBe(expected);
    expect(() => identityHash("email", "x", Buffer.alloc(31))).toThrow(
      RangeError,
    );
  });

  it("RISK_HASH_KEY: a schema key, validated as 32 bytes, optional at boot, test key in test", () => {
    expect(ENV_KEYS).toContain("RISK_HASH_KEY");
    const base = { APP_ENV: "staging", NODE_ENV: "production" };
    const issuesFor = (value: string) =>
      validateEnv({ ...base, RISK_HASH_KEY: value }).issues.filter(
        (issue) => issue.key === "RISK_HASH_KEY",
      );
    expect(issuesFor(Buffer.alloc(31, 1).toString("base64"))).toHaveLength(1);
    expect(issuesFor(Buffer.alloc(33, 1).toString("base64"))).toHaveLength(1);
    expect(issuesFor("not base64 !").length).toBeGreaterThan(0);
    expect(issuesFor(Buffer.alloc(32, 1).toString("base64"))).toHaveLength(0);
    expect(issuesFor("")).toHaveLength(0);

    expect(riskHashKey({ APP_ENV: "test" })).toEqual({
      configured: true,
      key: Buffer.from(TEST_RISK_HASH_KEY, "base64"),
    });
    expect(riskHashKey(base)).toEqual({
      configured: false,
      missing: "RISK_HASH_KEY",
    });
    const set = Buffer.alloc(32, 7).toString("base64");
    expect(riskHashKey({ ...base, RISK_HASH_KEY: set })).toEqual({
      configured: true,
      key: Buffer.alloc(32, 7),
    });
  });
});

/* ------------------------------------------------------------------------------------------- */
/* scoreOrder (T-08, T-09, T-10, T-12)                                                          */
/* ------------------------------------------------------------------------------------------- */

/** An order that fires nothing: shifted, EUR 50, not first, nothing else. */
function base(overrides: Partial<RiskInputV1> = {}): RiskInputV1 {
  return {
    version: 1,
    mode: "test",
    totalMinor: 5_000,
    currency: "EUR",
    destinationCountry: "PL",
    buyerCountryDeclared: "GB",
    sameDay: false,
    firstOrder: false,
    peakDay: false,
    cardMessageMatch: false,
    disposableEmail: false,
    blocklistMatch: false,
    declinedAttempts: 0,
    radar: {
      riskLevel: "normal",
      outcomeType: "authorized",
      liabilityShift: true,
      cardCountry: "GB",
      efwReceived: false,
    },
    velocity: {
      paidOrdersByEmail24h: 0,
      recipientAddressesByEmail7d: 0,
      cardsByEmail7d: 0,
      emailsByCard7d: 0,
      buyersByRecipientAddress7d: 0,
    },
    strict: false,
    ...overrides,
  };
}

const radar = (over: Partial<NonNullable<RiskInputV1["radar"]>>) => ({
  radar: { ...(base().radar ?? ({} as never)), ...over },
});
const velocity = (over: Partial<RiskInputV1["velocity"]>) => ({
  velocity: { ...base().velocity, ...over },
});

describe("T-08 (AC-8) · each signal alone", () => {
  const cases: readonly {
    id: string;
    input: Partial<RiskInputV1>;
    score: number;
    decision: "pass" | "hold" | "cancel";
  }[] = [
    {
      id: "S1",
      input: radar({ riskLevel: "elevated" }),
      score: 30,
      decision: "pass",
    },
    {
      id: "S1h",
      input: radar({ riskLevel: "highest" }),
      score: 60,
      decision: "hold",
    },
    {
      id: "S2",
      input: radar({ outcomeType: "manual_review" }),
      score: 0,
      decision: "hold",
    },
    {
      id: "S3",
      input: radar({ liabilityShift: false }),
      score: 15,
      decision: "pass",
    },
    {
      id: "S4",
      input: { firstOrder: true, totalMinor: 15_000 },
      score: 20,
      decision: "pass",
    },
    { id: "S5", input: { totalMinor: 30_000 }, score: 0, decision: "hold" },
    {
      id: "S6",
      input: { firstOrder: true, sameDay: true },
      score: 15,
      decision: "pass",
    },
    {
      id: "S7",
      input: velocity({ paidOrdersByEmail24h: 3 }),
      score: 25,
      decision: "pass",
    },
    {
      id: "S8",
      input: velocity({ recipientAddressesByEmail7d: 4 }),
      score: 25,
      decision: "pass",
    },
    {
      id: "S9",
      input: velocity({ cardsByEmail7d: 3 }),
      score: 30,
      decision: "pass",
    },
    {
      id: "S10",
      input: velocity({ emailsByCard7d: 3 }),
      score: 30,
      decision: "pass",
    },
    {
      id: "S11",
      input: velocity({ buyersByRecipientAddress7d: 3 }),
      score: 30,
      decision: "pass",
    },
    { id: "S12", input: { declinedAttempts: 3 }, score: 20, decision: "pass" },
    {
      id: "S14",
      input: { disposableEmail: true },
      score: 40,
      decision: "hold",
    },
    {
      id: "S15",
      input: { cardMessageMatch: true },
      score: 0,
      decision: "hold",
    },
    { id: "S16", input: { radar: null }, score: 0, decision: "hold" },
    { id: "D1", input: { blocklistMatch: true }, score: 0, decision: "cancel" },
    {
      id: "D2",
      input: radar({ efwReceived: true }),
      score: 0,
      decision: "cancel",
    },
  ];

  it("the base order fires nothing and passes", () => {
    expect(scoreOrder(base())).toEqual({
      score: 0,
      decision: "pass",
      high: false,
      signals: [],
    });
  });

  it.each(cases)(
    "$id alone gives its points and its band",
    ({ id, input, score, decision }) => {
      const result = scoreOrder(base(input));
      expect(result.signals).toEqual([{ id, points: score }]);
      expect(result.score).toBe(score);
      expect(result.decision).toBe(decision);
      const effect = RISK_SIGNALS[id as keyof typeof RISK_SIGNALS];
      expect(effect.kind === "points" ? effect.points : 0).toBe(score);
    },
  );

  it("covers every signal id except the modifier S13 (tested in T-09)", () => {
    expect([...cases.map((c) => c.id), "S13"].sort()).toEqual(
      [...RISK_SIGNAL_IDS].sort(),
    );
  });

  it("caps the sum at 100", () => {
    const result = scoreOrder(
      base({
        ...radar({ riskLevel: "highest", liabilityShift: false }),
        disposableEmail: true,
        ...velocity({ cardsByEmail7d: 5 }),
      }),
    );
    expect(result.signals.reduce((sum, s) => sum + s.points, 0)).toBe(145);
    expect(result.score).toBe(100);
  });

  it("bands: 39 passes, 40 holds; strict 19 passes, 20 holds; 69 is not high, 70 is", () => {
    expect(bandFor(39, false)).toBe("pass");
    expect(bandFor(40, false)).toBe("hold");
    expect(bandFor(19, true)).toBe("pass");
    expect(bandFor(20, true)).toBe("hold");
    expect(isHighScore(69)).toBe(false);
    expect(isHighScore(70)).toBe(true);
    // Through scoreOrder: S1 (30) + S3 (15) = 45 holds; S3 (15) + S12 (20) = 35 passes.
    expect(
      scoreOrder(base(radar({ riskLevel: "elevated", liabilityShift: false })))
        .decision,
    ).toBe("hold");
    const thirtyFive = scoreOrder(
      base({ ...radar({ liabilityShift: false }), declinedAttempts: 3 }),
    );
    expect([thirtyFive.score, thirtyFive.decision]).toEqual([35, "pass"]);
    expect(
      scoreOrder(base({ declinedAttempts: 3, strict: true })).decision,
    ).toBe("hold");
    const seventy = scoreOrder(
      base({
        ...radar({ riskLevel: "elevated" }),
        ...velocity({ cardsByEmail7d: 3, emailsByCard7d: 0 }),
        declinedAttempts: 3,
      }),
    );
    expect([seventy.score, seventy.high]).toEqual([80, true]);
  });

  it("strict holds every first order at or above the strict band, not below", () => {
    expect(
      scoreOrder(base({ strict: true, firstOrder: true, totalMinor: 9_999 }))
        .decision,
    ).toBe("pass");
    expect(
      scoreOrder(base({ strict: true, firstOrder: true, totalMinor: 10_000 }))
        .decision,
    ).toBe("hold");
    expect(
      scoreOrder(base({ strict: false, firstOrder: true, totalMinor: 10_000 }))
        .decision,
    ).toBe("pass");
  });

  it("on a peak day S7, S8 and S11 need 2 more", () => {
    expect(
      scoreOrder(
        base({ peakDay: true, ...velocity({ paidOrdersByEmail24h: 4 }) }),
      ).signals,
    ).toEqual([]);
    expect(
      scoreOrder(
        base({ peakDay: true, ...velocity({ paidOrdersByEmail24h: 5 }) }),
      ).signals,
    ).toEqual([{ id: "S7", points: 25 }]);
    expect(
      scoreOrder(
        base({
          peakDay: true,
          ...velocity({ recipientAddressesByEmail7d: 5 }),
        }),
      ).signals,
    ).toEqual([]);
    expect(
      scoreOrder(
        base({ peakDay: true, ...velocity({ buyersByRecipientAddress7d: 4 }) }),
      ).signals,
    ).toEqual([]);
    expect(
      scoreOrder(base({ peakDay: true, ...velocity({ cardsByEmail7d: 3 }) }))
        .signals,
    ).toEqual([{ id: "S9", points: 30 }]);
  });

  it("each velocity signal does not fire one below its count", () => {
    expect(
      scoreOrder(base(velocity({ paidOrdersByEmail24h: 2 }))).signals,
    ).toEqual([]);
    expect(
      scoreOrder(base(velocity({ recipientAddressesByEmail7d: 3 }))).signals,
    ).toEqual([]);
    expect(scoreOrder(base(velocity({ cardsByEmail7d: 2 }))).signals).toEqual(
      [],
    );
    expect(scoreOrder(base(velocity({ emailsByCard7d: 2 }))).signals).toEqual(
      [],
    );
    expect(
      scoreOrder(base(velocity({ buyersByRecipientAddress7d: 2 }))).signals,
    ).toEqual([]);
    expect(scoreOrder(base({ declinedAttempts: 2 })).signals).toEqual([]);
  });
});

describe("T-09 (AC-9) · countries are never a signal on their own", () => {
  it("card country or declared country different from the destination alone: 0 and pass", () => {
    expect(scoreOrder(base(radar({ cardCountry: "US" })))).toMatchObject({
      score: 0,
      decision: "pass",
    });
    expect(
      scoreOrder(
        base({ buyerCountryDeclared: "US", ...radar({ cardCountry: "US" }) }),
      ),
    ).toMatchObject({
      score: 0,
      decision: "pass",
      signals: [],
    });
    expect(
      scoreOrder(
        base({
          destinationCountry: "DE",
          buyerCountryDeclared: "FR",
          ...radar({ cardCountry: "FR" }),
        }),
      ).score,
    ).toBe(0);
  });

  it("S13 alone gives 0; with S3 it gives 25", () => {
    // A non-EEA card outside both countries, shifted: S13's condition holds, nothing else fires.
    expect(scoreOrder(base(radar({ cardCountry: "US" }))).signals).toEqual([]);
    expect(
      scoreOrder(base(radar({ cardCountry: "US", liabilityShift: false }))),
    ).toMatchObject({
      score: 25,
      signals: [
        { id: "S3", points: 15 },
        { id: "S13", points: 10 },
      ],
    });
  });

  it("S13 never applies to an EEA-issued card with liability shift, whatever else fires", () => {
    const eeaShifted = scoreOrder(
      base({
        ...radar({ cardCountry: "DE", riskLevel: "elevated" }),
        declinedAttempts: 3,
        disposableEmail: true,
      }),
    );
    expect(eeaShifted.signals.map((s) => s.id)).not.toContain("S13");
    const eeaNotShifted = scoreOrder(
      base(radar({ cardCountry: "DE", liabilityShift: false })),
    );
    expect(eeaNotShifted.signals.map((s) => s.id)).toEqual(["S3", "S13"]);
  });
});

describe("T-10 (AC-10) · the bands per currency", () => {
  it("are integer minor units for exactly toStripeAmount's currencies (type and value)", () => {
    expectTypeOf<
      ReturnType<typeof fromStripeCurrency>
    >().toEqualTypeOf<RiskCurrency>();
    expectTypeOf(FIRST_ORDER_BAND).toEqualTypeOf<
      Readonly<Record<RiskCurrency, number>>
    >();
    for (const band of [FIRST_ORDER_BAND, REVIEW_BAND, STRICT_BAND]) {
      expect(Object.keys(band).sort()).toEqual(
        [...STRIPE_CHARGE_CURRENCIES].sort(),
      );
      for (const value of Object.values(band))
        expect(Number.isSafeInteger(value)).toBe(true);
    }
    expect([...RISK_CURRENCIES].sort()).toEqual(
      [...STRIPE_CHARGE_CURRENCIES].sort(),
    );
  });

  it.each(RISK_CURRENCIES)(
    "%s: one minor unit below a figure does not fire, the figure does",
    (currency) => {
      const first = FIRST_ORDER_BAND[currency];
      const review = REVIEW_BAND[currency];
      const strict = STRICT_BAND[currency];
      const ids = (input: Partial<RiskInputV1>) =>
        scoreOrder(base({ currency, ...input })).signals.map((s) => s.id);
      expect(ids({ firstOrder: true, totalMinor: first - 1 })).toEqual([]);
      expect(ids({ firstOrder: true, totalMinor: first })).toEqual(["S4"]);
      expect(ids({ totalMinor: review - 1 })).toEqual([]);
      expect(ids({ totalMinor: review })).toEqual(["S5"]);
      expect(
        scoreOrder(
          base({
            currency,
            strict: true,
            firstOrder: true,
            totalMinor: strict - 1,
          }),
        ).decision,
      ).toBe("pass");
      expect(
        scoreOrder(
          base({
            currency,
            strict: true,
            firstOrder: true,
            totalMinor: strict,
          }),
        ).decision,
      ).toBe("hold");
    },
  );

  it("holds the figures of §5.2", () => {
    expect(FIRST_ORDER_BAND).toEqual({ EUR: 15_000, GBP: 13_000, PLN: 65_000 });
    expect(REVIEW_BAND).toEqual({ EUR: 30_000, GBP: 26_000, PLN: 130_000 });
    expect(STRICT_BAND).toEqual({ EUR: 10_000, GBP: 8_500, PLN: 43_000 });
  });
});

describe("T-12 (AC-12) · Radar's facts", () => {
  it("manual_review holds; elevated +30; highest +60; normal 0", () => {
    expect(
      scoreOrder(base(radar({ outcomeType: "manual_review" }))).decision,
    ).toBe("hold");
    expect(scoreOrder(base(radar({ riskLevel: "elevated" }))).score).toBe(30);
    expect(scoreOrder(base(radar({ riskLevel: "highest" }))).score).toBe(60);
    expect(scoreOrder(base(radar({ riskLevel: "normal" }))).score).toBe(0);
  });
});

/* ------------------------------------------------------------------------------------------- */
/* T-13 (AC-13)                                                                                 */
/* ------------------------------------------------------------------------------------------- */

describe("T-13 (AC-13) · cardMessageMatches", () => {
  const positive = [
    "Send to PL61 1090 1014 0000 0712 1981 2874 please",
    "GB82WEST12345698765432",
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "please buy a gift card and send me the code",
    "przelew na konto",
    "Gutschein-Code schicken",
  ];
  const negative = [
    "Happy birthday Mum, love you",
    "Kocham Cię, do zobaczenia w sobotę",
    "Alles Liebe zum Geburtstag",
    "Call me when you get these!",
    "See you on 12.05.2026 at Kwiatowa 15, flat 3",
    "PL61 1090 1014 0000 0712 1981 2875",
  ];

  it.each(positive)("matches %s", (text) => {
    expect(cardMessageMatches(text)).toBe(true);
  });

  it.each(negative)("does not match %s", (text) => {
    expect(cardMessageMatches(text)).toBe(false);
  });

  it("reads the card message and sign-as together and answers a boolean only", () => {
    expect(cardMessageMatches("Happy birthday", "kod BLIK 123456")).toBe(true);
    expect(cardMessageMatches(null, undefined, "")).toBe(false);
    expect(typeof cardMessageMatches("x")).toBe("boolean");
  });
});

/* ------------------------------------------------------------------------------------------- */
/* T-17 (AC-17)                                                                                 */
/* ------------------------------------------------------------------------------------------- */

describe("T-17 (AC-17) · reviewDeadline", () => {
  const warsaw = { ianaZone: "Europe/Warsaw", sameDayCutoffLocal: "14:00" };
  const london = { ianaZone: "Europe/London", sameDayCutoffLocal: "14:00" };
  const z = (iso: string) => new Date(iso);

  it("held at 22:00 Warsaw for next-day delivery: 10:00 the next day (heldAt + 12 h)", () => {
    // 2026-11-10 22:00 CET = 21:00Z; + 12 h = 09:00Z (10:00 local); routing 16:00 − 3 h = 13:00.
    expect(
      reviewDeadline(
        { deliveryDate: "2026-11-11", destination: warsaw },
        z("2026-11-10T21:00:00Z"),
      ),
    ).toEqual(z("2026-11-11T09:00:00Z"));
  });

  it("same-day order held at 11:00 with a 14:00 cutoff: 13:00", () => {
    expect(
      reviewDeadline(
        { deliveryDate: "2026-11-10", destination: warsaw },
        z("2026-11-10T10:00:00Z"),
      ),
    ).toEqual(z("2026-11-10T12:00:00Z"));
  });

  it("five days ahead: heldAt + 12 h", () => {
    expect(
      reviewDeadline(
        { deliveryDate: "2026-11-15", destination: warsaw },
        z("2026-11-10T10:00:00Z"),
      ),
    ).toEqual(z("2026-11-10T22:00:00Z"));
  });

  it("held at 12:45 for the same-day order: decide_now; at 12:30 exactly 30 minutes remain", () => {
    expect(
      reviewDeadline(
        { deliveryDate: "2026-11-10", destination: warsaw },
        z("2026-11-10T11:45:00Z"),
      ),
    ).toBe("decide_now");
    expect(
      reviewDeadline(
        { deliveryDate: "2026-11-10", destination: warsaw },
        z("2026-11-10T11:30:00Z"),
      ),
    ).toEqual(z("2026-11-10T12:00:00Z"));
    expect(
      reviewDeadline(
        { deliveryDate: "2026-11-10", destination: warsaw },
        z("2026-11-10T11:30:01Z"),
      ),
    ).toBe("decide_now");
  });

  it("across 25 Oct 2026 and 28 Mar 2027 in Warsaw and London (absolute hours, never wall-clock)", () => {
    // Warsaw, autumn: held 22:00 CEST (20:00Z) on the 24th; + 12 h = 08:00Z = 09:00 CET.
    expect(
      reviewDeadline(
        { deliveryDate: "2026-10-25", destination: warsaw },
        z("2026-10-24T20:00:00Z"),
      ),
    ).toEqual(z("2026-10-25T08:00:00Z"));
    // Warsaw, same day after the change: held 11:00 CET (10:00Z); routing 16:00 CET = 15:00Z − 3 h.
    expect(
      reviewDeadline(
        { deliveryDate: "2026-10-25", destination: warsaw },
        z("2026-10-25T10:00:00Z"),
      ),
    ).toEqual(z("2026-10-25T12:00:00Z"));
    // Warsaw, spring: held 22:00 CET (21:00Z) on 27 Mar; + 12 h = 09:00Z = 11:00 CEST.
    expect(
      reviewDeadline(
        { deliveryDate: "2027-03-28", destination: warsaw },
        z("2027-03-27T21:00:00Z"),
      ),
    ).toEqual(z("2027-03-28T09:00:00Z"));
    // Warsaw, spring same day: routing 16:00 CEST = 14:00Z − 3 h = 11:00Z.
    expect(
      reviewDeadline(
        { deliveryDate: "2027-03-28", destination: warsaw },
        z("2027-03-28T08:00:00Z"),
      ),
    ).toEqual(z("2027-03-28T11:00:00Z"));
    // London, autumn: held 22:00 BST (21:00Z); + 12 h = 09:00Z; routing 16:00 GMT − 3 h = 13:00Z.
    expect(
      reviewDeadline(
        { deliveryDate: "2026-10-25", destination: london },
        z("2026-10-24T21:00:00Z"),
      ),
    ).toEqual(z("2026-10-25T09:00:00Z"));
    // London, spring: held 22:00 GMT (22:00Z); + 12 h = 10:00Z; routing 16:00 BST = 15:00Z − 3 h.
    expect(
      reviewDeadline(
        { deliveryDate: "2027-03-28", destination: london },
        z("2027-03-27T22:00:00Z"),
      ),
    ).toEqual(z("2027-03-28T10:00:00Z"));
    expect(
      reviewDeadline(
        { deliveryDate: "2027-03-28", destination: london },
        z("2027-03-28T09:00:00Z"),
      ),
    ).toEqual(z("2027-03-28T12:00:00Z"));
  });
});

/* ------------------------------------------------------------------------------------------- */
/* T-30 unit half (AC-30)                                                                       */
/* ------------------------------------------------------------------------------------------- */

describe("T-30 (AC-30) · the two buyer keys accuse nobody and name no relay", () => {
  type Catalogue = { checkout: { risk?: Record<string, string> } };
  const catalogues: readonly [string, Catalogue][] = [
    ["en", en as Catalogue],
    [
      "en-gb",
      {
        checkout: {
          risk: {
            ...(en as Catalogue).checkout.risk,
            ...((enGb as unknown as Catalogue).checkout?.risk ?? {}),
          },
        },
      },
    ],
    ["de", de as Catalogue],
    ["pl", pl as Catalogue],
  ];

  it.each(catalogues)(
    "%s: emailLasting and attemptsExhausted are clean",
    (locale, catalogue) => {
      const risk = catalogue.checkout.risk ?? {};
      for (const key of ["emailLasting", "attemptsExhausted", "startAgain"]) {
        const text = risk[key];
        expect(typeof text, key).toBe("string");
        expect(accusationMatches(text ?? "", locale), key).toEqual([]);
        expect(relayMatches(text ?? "", locale), key).toEqual([]);
        expect(text ?? "", key).not.toMatch(/[–—]/u);
      }
    },
  );

  it('adding "Your order is under security review" turns the case red', () => {
    const text = `${(en as Catalogue).checkout.risk?.["attemptsExhausted"] ?? ""} Your order is under security review`;
    expect(accusationMatches(text, "en")).toEqual([
      "en.security_check",
      "en.under_review",
    ]);
  });

  it("each locale's list catches its own words", () => {
    expect(accusationMatches("Verdacht auf Betrug", "de")).toEqual([
      "de.betrug",
      "de.verdacht",
    ]);
    expect(
      accusationMatches("Zamówienie zablokowane z powodu ryzyka", "pl"),
    ).toEqual(["pl.zablokowane", "pl.ryzyko"]);
    expect(accusationMatches("Thank you. We have your order.", "en")).toEqual(
      [],
    );
    expect(
      Object.values(ACCUSATION_PATTERNS).every((list) => list.length > 0),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------- */
/* AC-6 thresholds                                                                              */
/* ------------------------------------------------------------------------------------------- */

describe("AC-6 · the card-testing thresholds", () => {
  it("10 declines of 18 fire; 9 declines, or 10 of 25, do not; 10 of 20 fires", () => {
    expect(cardTestingSuspected({ declined: 10, succeeded: 8 })).toBe(true);
    expect(cardTestingSuspected({ declined: 9, succeeded: 0 })).toBe(false);
    expect(cardTestingSuspected({ declined: 10, succeeded: 15 })).toBe(false);
    expect(cardTestingSuspected({ declined: 10, succeeded: 10 })).toBe(true);
    expect(cardTestingSuspected({ declined: 10, succeeded: 11 })).toBe(false);
  });
});
