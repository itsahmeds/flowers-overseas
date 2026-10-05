/**
 * The checkout's configuration, its sample details, its `en` copy and the quote-signing key
 * (spec 010 §2, §5.2 `src/config/checkout.ts` and `checkout-samples.ts`, §7, §8 "Security",
 * §13 Q9, Q12, Appendix A; ruling R9 of the decisions log 2026-10-05; spec 005 §13 Q5; TASK-200).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADDRESS_FORMAT_KEYS,
  ADDRESS_FORMATS,
} from "../../src/config/address-formats.ts";
import {
  CHECKOUT_LIMITS,
  CHECKOUT_STEPS,
  DEMO_DAILY_ORDER_CAP,
  DRAFT_LIFETIME_HOURS,
  PLACE_KINDS,
  PLACE_KIND_LABEL_KEYS,
  QUOTE_LOCK_MINUTES,
} from "../../src/config/checkout.ts";
import {
  CHECKOUT_SAMPLES,
  SAMPLE_LABEL_KEY,
  checkoutSample,
} from "../../src/config/checkout-samples.ts";
import { BANNED_VOICE_WORDS } from "../../src/config/voice.ts";
import {
  DEVELOPMENT_QUOTE_SIGNING_SECRET,
  EnvValidationError,
  quoteSigningSecret,
} from "../../src/lib/env.schema.ts";
import { QUOTE_TTL_MINUTES } from "../../src/modules/catalog/schemas.ts";
import { quote, verifyQuote } from "../../src/modules/catalog/index.ts";
import {
  CHECKOUT_ERROR_KEYS,
  CardAndBuyerStepSchema,
  PHONE_NON_LOCAL_KEY,
  RecipientStepSchema,
} from "../../src/modules/checkout/index.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as Record<
    string,
    unknown
  >;

/** `{ a: { b: "x" } }` → `{ "a.b": "x" }`. */
function flatten(
  value: unknown,
  prefix = "",
  into: Record<string, string> = {},
): Record<string, string> {
  if (typeof value === "string") {
    into[prefix] = value;
    return into;
  }
  for (const [key, nested] of Object.entries(value as object)) {
    flatten(nested, prefix === "" ? key : `${prefix}.${key}`, into);
  }
  return into;
}

const en = flatten(readJson("messages/en.json"));
const enGb = flatten(readJson("messages/en-gb.json"));
const enMeta = readJson("messages/en.meta.json") as Record<
  string,
  { reviewed: boolean; reviewedBy?: string; source: string }
>;
const checkoutKeys = Object.keys(en).filter((key) =>
  /^(?:checkout|confirmation)\./u.test(key),
);

describe("src/config/checkout.ts states spec 010's numbers once", () => {
  it("has the three steps, in order", () => {
    expect([...CHECKOUT_STEPS]).toEqual(["recipient", "card", "review"]);
  });

  it("limits the card to 200, 'sign as' to 40 and the note and names to 120 graphemes (§13 Q9)", () => {
    expect(CHECKOUT_LIMITS).toEqual({
      cardMessage: 200,
      signAs: 40,
      deliveryNote: 120,
      fullName: 120,
      addressLine: 120,
    });
  });

  it("caps the demo at 200 a UTC day and keeps a draft for 24 hours", () => {
    expect(DEMO_DAILY_ORDER_CAP).toBe(200);
    expect(DRAFT_LIFETIME_HOURS).toBe(24);
  });

  it("locks a quote for 30 minutes, the same lock spec 005 signs", () => {
    expect(QUOTE_LOCK_MINUTES).toBe(30);
    expect(QUOTE_LOCK_MINUTES).toBe(QUOTE_TTL_MINUTES);
  });

  it("lists spec 002's place kinds, each with a label in the catalogue", () => {
    expect([...PLACE_KINDS]).toEqual([
      "home",
      "work",
      "hospital",
      "funeral_home",
      "hotel",
      "cemetery",
      "church",
    ]);
    for (const kind of PLACE_KINDS) {
      expect(en[PLACE_KIND_LABEL_KEYS[kind]], kind).toBeTypeOf("string");
    }
  });
});

describe("the demo's sample details (§13 Q12, AC-33's data)", () => {
  const authored = ADDRESS_FORMAT_KEYS.filter((key) => key !== "generic");

  it("has exactly one sample per destination with an authored format", () => {
    expect(Object.keys(CHECKOUT_SAMPLES).sort()).toEqual([...authored].sort());
    expect(checkoutSample("SI")).toBeUndefined();
    expect(checkoutSample("PL")).toBe(CHECKOUT_SAMPLES.PL);
  });

  it.each(Object.entries(CHECKOUT_SAMPLES))(
    "%s: the sample passes both steps of its destination, as a local phone",
    (country, sample) => {
      const recipient = RecipientStepSchema(country, "en").safeParse({
        ...sample.recipient.fields,
        placeKind: sample.recipient.placeKind,
        deliveryNote: sample.recipient.deliveryNote,
        deliveryDate: "2027-02-14",
      });
      expect(recipient.success, JSON.stringify(recipient.error?.issues)).toBe(
        true,
      );
      expect(recipient.data?.phone.nonLocal).toBe(false);
      const buyer = CardAndBuyerStepSchema({
        locale: "en",
        offeredAddonKeys: [],
      }).safeParse(sample.buyer);
      expect(buyer.success, JSON.stringify(buyer.error?.issues)).toBe(true);
    },
  );

  it("is plainly fictional: example.com email, the format's own example street and postcode", () => {
    for (const [country, sample] of Object.entries(CHECKOUT_SAMPLES)) {
      expect(sample.buyer.email, country).toMatch(/@example\.com$/u);
      const format = ADDRESS_FORMATS[country as keyof typeof ADDRESS_FORMATS];
      const fields = sample.recipient.fields as Record<string, string>;
      expect(fields["postcode"], country).toBe(
        format.examplePlaceholder.postcode,
      );
      expect(fields["street"] ?? fields["addressLine1"], country).toBe(
        format.examplePlaceholder.street,
      );
    }
  });

  it("is labelled 'Sample' through a message key", () => {
    expect(en[SAMPLE_LABEL_KEY]).toBe("Sample");
  });
});

describe("the en checkout copy (Appendix A; ruling R9)", () => {
  it("ships Appendix A's keys", () => {
    for (const key of [
      "checkout.demo.bannerTitle",
      "checkout.demo.bannerBody",
      "checkout.privacy.demoNotice",
      "checkout.demo.useSample",
      "checkout.step.recipient",
      "checkout.step.card",
      "checkout.step.review",
      "checkout.demo.dateHeading",
      "checkout.recipient.phoneReason",
      "checkout.card.preview",
      "checkout.card.counter",
      "checkout.card.blank",
      "checkout.price.changed",
      "checkout.price.confirm",
      "checkout.price.currencyLine",
      "checkout.date.gone",
      "checkout.demo.place",
      "checkout.demo.cap",
      "checkout.closed.title",
      "checkout.expired.title",
      "confirmation.demo.title",
      "confirmation.demo.body",
      "confirmation.demo.next",
      "confirmation.promise",
      "confirmation.gone",
    ]) {
      expect(en[key], key).toBeTypeOf("string");
    }
  });

  it("replaces the em dash of the place-order label with a full stop (R9)", () => {
    expect(en["checkout.demo.place"]).toBe(
      "Place demo order. Nothing is charged.",
    );
  });

  it("carries no em dash and no banned word in any checkout or confirmation string, in en or en-gb", () => {
    expect(checkoutKeys.length).toBeGreaterThan(60);
    const strings = [
      ...checkoutKeys.map((key) => [key, en[key]] as const),
      ...Object.entries(enGb).filter(([key]) => key.startsWith("checkout.")),
    ];
    for (const [key, value] of strings) {
      expect(value, key).not.toContain("—");
      for (const word of BANNED_VOICE_WORDS) {
        expect(value?.toLowerCase(), `${key}: ${word}`).not.toContain(word);
      }
    }
  });

  it("says 'printed', never 'handwritten'", () => {
    expect(en["checkout.card.preview"]).toBe("Printed on our card · included");
    for (const key of checkoutKeys) {
      expect(en[key]?.toLowerCase(), key).not.toContain("handwritten");
    }
  });

  it("marks every checkout key unreviewed until the founder approves the batch", () => {
    for (const key of checkoutKeys) {
      expect(enMeta[key]?.reviewed, key).toBe(false);
      expect(enMeta[key]?.reviewedBy, key).toBeUndefined();
    }
  });

  it("overrides only 'postcode' and 'mobile' in en-gb", () => {
    expect(
      Object.fromEntries(
        Object.entries(enGb).filter(([key]) => key.startsWith("checkout.")),
      ),
    ).toEqual({
      "checkout.address.postcode": "Postcode",
      "checkout.buyer.phone": "Your mobile number",
    });
  });

  it("has a string for every error key and the non-local warning the schemas emit", () => {
    for (const key of [
      ...Object.values(CHECKOUT_ERROR_KEYS),
      PHONE_NON_LOCAL_KEY,
    ]) {
      expect(en[key], key).toBeTypeOf("string");
    }
  });

  it("has a label for every field and placeholder every address format names", () => {
    for (const format of Object.values(ADDRESS_FORMATS)) {
      for (const key of [
        ...Object.values(format.labelKeys),
        format.placeholderKey,
      ]) {
        expect(en[key ?? ""], key).toBeTypeOf("string");
      }
    }
  });
});

describe("QUOTE_SIGNING_SECRET signs the quote (spec 005 §13 Q5, spec 010 §8)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const REAL = "0123456789abcdef0123456789abcdef0123456789abcdef";

  it("uses the configured key in every environment", () => {
    for (const env of [
      "development",
      "test",
      "preview",
      "staging",
      "production",
    ]) {
      expect(
        quoteSigningSecret({ APP_ENV: env, QUOTE_SIGNING_SECRET: REAL }),
        env,
      ).toBe(REAL);
    }
  });

  it("falls back to the named development key only in development and test", () => {
    expect(quoteSigningSecret({ APP_ENV: "development" })).toBe(
      DEVELOPMENT_QUOTE_SIGNING_SECRET,
    );
    expect(
      quoteSigningSecret({ NODE_ENV: "test", QUOTE_SIGNING_SECRET: "" }),
    ).toBe(DEVELOPMENT_QUOTE_SIGNING_SECRET);
  });

  it.each(["preview", "staging", "production"])(
    "throws in %s without a key, or with the development key, naming the key only",
    (env) => {
      for (const source of [
        { APP_ENV: env },
        {
          APP_ENV: env,
          QUOTE_SIGNING_SECRET: DEVELOPMENT_QUOTE_SIGNING_SECRET,
        },
      ]) {
        let error: unknown;
        try {
          quoteSigningSecret(source);
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(EnvValidationError);
        expect((error as EnvValidationError).keys).toEqual([
          "QUOTE_SIGNING_SECRET",
        ]);
        expect((error as Error).message).not.toContain(
          DEVELOPMENT_QUOTE_SIGNING_SECRET,
        );
      }
    },
  );

  it("refuses a key shorter than 32 characters without printing it", () => {
    const short = "too-short-secret-value";
    expect(() =>
      quoteSigningSecret({ APP_ENV: "staging", QUOTE_SIGNING_SECRET: short }),
    ).toThrow(EnvValidationError);
    try {
      quoteSigningSecret({ APP_ENV: "staging", QUOTE_SIGNING_SECRET: short });
    } catch (error) {
      expect((error as Error).message).not.toContain(short);
    }
  });

  it("is the key quote() and verifyQuote() use: a quote signed under one key is tampered under another", async () => {
    const projection = {
      displayPrice: { amountMinor: 4590, currency: "GBP" },
      displayLocale: "en-gb",
      destinationCountry: "PL",
      destinationCurrencyPrice: { amountMinor: 21900, currency: "PLN" },
      vatRateBp: 800,
      vatRateText: "8%",
      vatLabelKey: "catalog.price.inclusive",
      deliveryIncluded: true,
      surcharges: [],
      fxReasonKey: "catalog.availability.fxUnavailable",
      priceVersion: "cp:FO-BQ-001:PL:m:2026-01-01",
      priceValidUntil: null,
      availability: {
        available: true,
        reasonKey: null,
        schemaAvailability: "InStock",
      },
    } as unknown as Parameters<typeof quote>[0][number]["projection"];
    const now = new Date("2026-09-20T10:00:00Z");
    vi.stubEnv("QUOTE_SIGNING_SECRET", REAL);
    vi.stubEnv("APP_ENV", "production");
    const signed = quote(
      [{ productId: "FO-BQ-001", tierKey: "m", projection }],
      now,
    );
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("QUOTE_SIGNING_SECRET", "");
    await expect(verifyQuote(signed, now)).resolves.toBe("tampered");
    vi.stubEnv("QUOTE_SIGNING_SECRET", REAL);
    await expect(verifyQuote(signed, now)).resolves.not.toBe("tampered");
  });
});
