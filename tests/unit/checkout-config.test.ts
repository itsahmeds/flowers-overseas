/**
 * The checkout's configuration, its sample details, its `en` copy and the quote-signing key
 * (spec 010 §2, §5.2 `src/config/checkout.ts` and `checkout-samples.ts`, §7, §8 "Security",
 * §13 Q9, Q12, Appendix A; spec 005 §13 Q5; TASK-200).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADDRESS_FORMAT_KEYS,
  ADDRESS_FORMATS,
} from "../../src/config/address-formats.ts";
import {
  BASKET_LIFETIME_DAYS,
  BASKET_MAX_LINES,
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
import {
  DEVELOPMENT_QUOTE_SIGNING_SECRET,
  EnvValidationError,
  quoteSigningSecret,
  validateRuntimeEnv,
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
      expect(PLACE_KIND_LABEL_KEYS[kind], kind).toMatch(
        /^checkout\.placeKind\./u,
      );
    }
  });
});

describe("the basket's numbers (§14 A-founder-2026-10-22 D3, D7; AC-55, T-55)", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "db/migrations/0020_checkout_draft_lines.sql"),
    "utf8",
  );

  it("caps a basket at five lines, and the migration's position check has the same bound", () => {
    expect(BASKET_MAX_LINES).toBe(5);
    const bound =
      /CONSTRAINT checkout_draft_line_position_check CHECK \(position BETWEEN 1 AND (\d+)\)/u.exec(
        migration,
      );
    expect(bound).not.toBeNull();
    expect(Number(bound?.[1])).toBe(BASKET_MAX_LINES);
  });

  it("LinePositionSchema takes 1 to BASKET_MAX_LINES and nothing else", async () => {
    const { LinePositionSchema } = await import("@/modules/checkout");
    expect(
      ["1", String(BASKET_MAX_LINES)].map((v) => LinePositionSchema.parse(v)),
    ).toEqual([1, BASKET_MAX_LINES]);
    for (const value of ["0", String(BASKET_MAX_LINES + 1), "x", "1.5", ""]) {
      expect(LinePositionSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it("keeps a basket 30 days after its last change", () => {
    expect(BASKET_LIFETIME_DAYS).toBe(30);
    expect(migration).toContain(
      "expires_at = d.last_activity_at + interval '30 days'",
    );
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

  it("is labelled through a message key", () => {
    expect(SAMPLE_LABEL_KEY).toBe("checkout.demo.sampleLabel");
  });
});

describe("the message keys the checkout names (Appendix A pending the founder)", () => {
  /**
   * TASK-201 ships the `en` strings. Spec 003 §14 A17 (TASK-224) keeps checkout and confirmation
   * copy out of the unreviewed share (`src/modules/i18n/review-scope.ts`), except the
   * address-format labels a shared module reads, which count. Not counted is not exempt: every
   * string waits for the founder's batch approval; the five address labels are the ones the
   * founder approved on 2026-10-12.
   */
  const KEY =
    /^(?:checkout|confirmation)\.[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/u;

  it("names every key in the checkout namespace, in catalogue key shape", () => {
    const keys = [
      ...Object.values(CHECKOUT_ERROR_KEYS),
      PHONE_NON_LOCAL_KEY,
      SAMPLE_LABEL_KEY,
      ...Object.values(PLACE_KIND_LABEL_KEYS),
      ...Object.values(ADDRESS_FORMATS).flatMap((format) => [
        ...Object.values(format.labelKeys),
        format.placeholderKey,
      ]),
    ];
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) expect(key, key).toMatch(KEY);
  });

  it("ships the checkout and confirmation strings unreviewed, but the five approved address labels", () => {
    // 66, plus the basket page's 19 `checkout.basket.*` and `checkout.date.gone` (TASK-349), plus
    // TASK-204's 43 for the page, its states and the confirmation (`checkout.date.gone` shared).
    expect(checkoutKeys).toHaveLength(128);
    const metaKeys = Object.keys(enMeta).filter((key) => KEY.test(key));
    expect(metaKeys.toSorted()).toEqual(checkoutKeys.toSorted());
    const reviewed = metaKeys.filter((key) => enMeta[key]?.reviewed === true);
    // TASK-226: two checkout keys of the founder's relay-copy batches are recorded by his own
    // `record-approval-226.py` run, and by nothing else.
    const recorded226 = [
      "checkout.price.currencyLine",
      "checkout.privacy.demoNotice",
    ].filter((key) =>
      /^founder, \d{4}-\d{2}-\d{2}: ran record-approval-226\.py /u.test(
        enMeta[key]?.reviewedBy ?? "",
      ),
    );
    // Copy batch 4: the four confirmation recap labels are recorded by the founder's own
    // `record-approval-batch4.py` run, and by nothing else.
    const recordedBatch4 = [
      "confirmation.recap.card",
      "confirmation.recap.date",
      "confirmation.recap.nothingCharged",
      "confirmation.recap.recipient",
    ].filter((key) =>
      /^founder, \d{4}-\d{2}-\d{2}: ran record-approval-batch4\.py /u.test(
        enMeta[key]?.reviewedBy ?? "",
      ),
    );
    // Copy batch 5: these 55 checkout keys are recorded by the founder's own
    // `record-approval-batch5.py` run, and by nothing else.
    const recordedBatch5 = [
      "checkout.action.toCard",
      "checkout.action.toReview",
      "checkout.buyer.country",
      "checkout.buyer.email",
      "checkout.buyer.fullName",
      "checkout.buyer.phone",
      "checkout.card.blank",
      "checkout.card.counter",
      "checkout.card.label",
      "checkout.card.preview",
      "checkout.card.previewLabel",
      "checkout.card.signAs",
      "checkout.card.signAsHint",
      "checkout.demo.bannerBody",
      "checkout.demo.bannerTitle",
      "checkout.demo.place",
      "checkout.demo.placing",
      "checkout.demo.useSample",
      "checkout.error.addonUnavailable",
      "checkout.error.countryInvalid",
      "checkout.error.dateInvalid",
      "checkout.error.emailInvalid",
      "checkout.error.invalidCharacters",
      "checkout.error.phoneInvalid",
      "checkout.error.placeKindInvalid",
      "checkout.error.postcodeFormat",
      "checkout.error.required",
      "checkout.error.summaryItem",
      "checkout.error.summaryTitle",
      "checkout.error.tooLong",
      "checkout.field.optional",
      "checkout.placeKind.cemetery",
      "checkout.placeKind.church",
      "checkout.placeKind.funeralHome",
      "checkout.placeKind.home",
      "checkout.placeKind.hospital",
      "checkout.placeKind.hotel",
      "checkout.placeKind.legend",
      "checkout.placeKind.work",
      "checkout.price.changed",
      "checkout.price.confirm",
      "checkout.progress.card",
      "checkout.progress.compact",
      "checkout.progress.label",
      "checkout.progress.recipient",
      "checkout.progress.review",
      "checkout.recipient.phoneNonLocal",
      "checkout.recipient.phoneReason",
      "checkout.summary.delivery",
      "checkout.summary.included",
      "checkout.summary.mini",
      "checkout.summary.title",
      "checkout.summary.total",
      "checkout.summary.vat",
      "checkout.summary.vatOf",
    ].filter((key) =>
      /^founder, \d{4}-\d{2}-\d{2}: ran record-approval-batch5\.py /u.test(
        enMeta[key]?.reviewedBy ?? "",
      ),
    );
    // PR 400 (TASK-204..206): its 42 checkout and confirmation keys are recorded by
    // `record-approval-204.py`, run by the orchestrator under the founder's delegation
    // (spec 003 A-founder-2026-10-31a), and by nothing else.
    const recorded204 = [
      "checkout.addons.add",
      "checkout.addons.addLabel",
      "checkout.addons.legend",
      "checkout.addons.remove",
      "checkout.addons.removeLabel",
      "checkout.basket.alsoInBasket",
      "checkout.buyer.legend",
      "checkout.closed.back",
      "checkout.closed.opensSoon",
      "checkout.closed.title",
      "checkout.date.legend",
      "checkout.date.offNote",
      "checkout.date.useNext",
      "checkout.demo.cap",
      "checkout.demo.dateHeading",
      "checkout.error.unable",
      "checkout.expired.link",
      "checkout.expired.title",
      "checkout.field.namePlaceholder",
      "checkout.recipient.deliveryNote",
      "checkout.recipient.deliveryNoteHint",
      "checkout.review.addons",
      "checkout.review.amount",
      "checkout.review.bouquet",
      "checkout.review.card",
      "checkout.review.change",
      "checkout.review.date",
      "checkout.review.noCard",
      "checkout.review.none",
      "checkout.review.recipient",
      "checkout.step.card",
      "checkout.step.deliveryOf",
      "checkout.step.recipient",
      "checkout.step.review",
      "checkout.summary.guaranteeLink",
      "confirmation.demo.body",
      "confirmation.demo.next",
      "confirmation.demo.reference",
      "confirmation.demo.referenceSentence",
      "confirmation.demo.title",
      "confirmation.page.gone",
      "confirmation.page.promise",
    ].filter((key) =>
      /^founder \(delegated\), \d{4}-\d{2}-\d{2}: recorded by the orchestrator with record-approval-204\.py /u.test(
        enMeta[key]?.reviewedBy ?? "",
      ),
    );
    expect(reviewed.toSorted()).toEqual(
      [
        "checkout.address.city",
        "checkout.address.fullName",
        "checkout.address.phone",
        "checkout.address.postcode",
        "checkout.address.street",
        ...recorded226,
        ...recordedBatch4,
        ...recordedBatch5,
        ...recorded204,
      ].toSorted(),
    );
    for (const key of reviewed) {
      expect(enMeta[key]?.reviewedBy, key).toMatch(/^founder\b/u);
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

  it.each([
    ["a production Node process with no APP_ENV", { NODE_ENV: "production" }],
    [
      "Railway production with APP_ENV lost",
      { NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" },
    ],
    [
      "a production Node process claiming development",
      { NODE_ENV: "production", APP_ENV: "development" },
    ],
    ["an unparseable APP_ENV", { APP_ENV: "prod" }],
  ])("fails closed for %s (/break 201 hole 5)", (_label, source) => {
    expect(() => quoteSigningSecret(source)).toThrow(EnvValidationError);
    expect(() =>
      quoteSigningSecret({
        ...source,
        QUOTE_SIGNING_SECRET: DEVELOPMENT_QUOTE_SIGNING_SECRET,
      }),
    ).toThrow(EnvValidationError);
    expect(quoteSigningSecret({ ...source, QUOTE_SIGNING_SECRET: REAL })).toBe(
      REAL,
    );
  });

  it("refuses the committed development key at server start in production-like processes", () => {
    const base = {
      ...Object.fromEntries(
        readFileSync(resolve(repoRoot, ".env.example"), "utf8")
          .split("\n")
          .filter((line) => /^[A-Z_]+=/u.test(line))
          .map((line) => [
            line.slice(0, line.indexOf("=")),
            line.slice(line.indexOf("=") + 1),
          ]),
      ),
      QUOTE_SIGNING_SECRET: DEVELOPMENT_QUOTE_SIGNING_SECRET,
    };
    const keysOf = (source: Record<string, string>) =>
      validateRuntimeEnv(source).issues.map((issue) => issue.key);
    expect(keysOf({ ...base, NODE_ENV: "production" })).toContain(
      "QUOTE_SIGNING_SECRET",
    );
    expect(keysOf({ ...base, NODE_ENV: "development" })).not.toContain(
      "QUOTE_SIGNING_SECRET",
    );
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
