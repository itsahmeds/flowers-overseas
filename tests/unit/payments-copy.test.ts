/**
 * Spec 013's buyer copy (TASK-255):
 *  - AC-5, mapping half (T-05): `declineMessageKey` maps every code of the recorded fixture list
 *    to its key, present in all four locales; an unknown code to `payments.error.generic`; the
 *    provider's message is never an input.
 *  - AC-35 (T-35): every §7 `payments.*` key in `en`, drafted unreviewed in `de` and `pl`, read by
 *    `en-gb` through its fallback; the retired keys exist nowhere; the Stripe locale table.
 *  - AC-41, catalogue half (T-41): `relayMatches` finds nothing in any `payments.*` value of the
 *    four catalogues, and planting the held-card sentence into `payments.confirmation.paid` is
 *    found.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import declineFixture from "../contract/fixtures/stripe/2026-09-30.endive/decline-codes.json" with { type: "json" };
import { relayMatches } from "../../src/config/honesty.ts";
import { loadMessages } from "../../src/modules/i18n/messages.ts";
import {
  PAYMENT_ERROR_KEYS,
  declineMessageKey,
} from "../../src/modules/payments/index.ts";
import {
  STRIPE_LOCALE_TABLE,
  stripeLocaleFor,
} from "../../src/modules/payments/stripe/locale.ts";

type Catalogue = Record<string, unknown>;
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];

function readJson(file: string): Catalogue {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", file), "utf8"),
  ) as Catalogue;
}

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** The `payments` namespace each locale renders: `en-gb` through its `en` fallback. */
function paymentsOf(locale: Locale): Catalogue {
  return {
    payments: (loadMessages(locale, ["payments"]) as Catalogue)["payments"],
  };
}

/** The §7 key list, spec 013 §7 "New message keys". */
const SPEC_KEYS = [
  ...PAYMENT_ERROR_KEYS,
  "payments.step.testLabel",
  "payments.step.noScript",
  "payments.step.submitting",
  "payments.confirmation.paid",
  "payments.confirmation.arrival",
  "payments.confirmation.notCompleted",
  "payments.confirmation.cancelled",
  "payments.confirmation.cancelledByYouRefunding",
  "payments.confirmation.cancelledByYouRefunded",
  "payments.confirmation.notDeliveredRefunding",
  "payments.confirmation.notDeliveredRefunded",
];

/** Spec 013 Appendix A, verbatim. */
const APPENDIX_A: Readonly<Record<string, string>> = {
  "payments.error.cardDeclined":
    "Your bank declined this card. Try another card or payment method.",
  "payments.error.insufficientFunds":
    "Your bank says there is not enough money on this card. Try another card or method.",
  "payments.error.authenticationFailed":
    "We could not confirm the payment with your bank. Please try again.",
  "payments.error.expiredCard": "This card has expired. Try another card.",
  "payments.error.incorrectCvc":
    "The security code does not match. Check the 3 digits on the back of the card.",
  "payments.error.processingError":
    "Something went wrong while processing the payment. Nothing was charged. Please try again.",
  "payments.error.tryAnotherMethod":
    "This payment did not go through. Try another payment method.",
  "payments.error.generic":
    "The payment did not go through. Nothing was charged. Please try again or use another method.",
  "payments.error.unavailable":
    "Payments are not available right now. Nothing was charged. Please try again in a few minutes.",
  "payments.step.testLabel": "Test mode. Use a test card. No real money moves.",
  "payments.step.noScript":
    "Paying needs JavaScript. Turn it on, or call or message us and we will help you order.",
  "payments.step.submitting": "Processing your payment…",
  "payments.confirmation.paid": "Thank you. We have your order.",
  "payments.confirmation.arrival": "Your flowers arrive in {city} on {date}.",
  "payments.confirmation.notCompleted":
    "Your payment was not completed. Nothing was charged. You can try again.",
  "payments.confirmation.cancelled":
    "This order was cancelled and nothing was charged.",
  "payments.confirmation.cancelledByYouRefunding":
    "You cancelled this order. We are refunding {amount} to your original payment method.",
  "payments.confirmation.cancelledByYouRefunded":
    "You cancelled this order. We have refunded {amount}.",
  "payments.confirmation.notDeliveredRefunding":
    "We could not deliver this order. We are refunding {amount} to your original payment method.",
  "payments.confirmation.notDeliveredRefunded":
    "We could not deliver this order. We have refunded {amount}.",
};

/** `locale › key › pattern` for every relay match in the `payments` namespace of `catalogue`. */
function relayFindings(locale: Locale, catalogue: Catalogue): string[] {
  return leaves(catalogue)
    .filter(([key]) => key.startsWith("payments."))
    .flatMap(([key, value]) =>
      relayMatches(value, locale).map(
        (match) => `${locale} › ${key} › ${match.id}`,
      ),
    );
}

describe("declineMessageKey (spec 013 AC-5 mapping half, T-05)", () => {
  /** The one key each recorded code must give. */
  const EXPECTED: Readonly<Record<string, string>> = {
    generic_decline: "payments.error.cardDeclined",
    insufficient_funds: "payments.error.insufficientFunds",
    lost_card: "payments.error.cardDeclined",
    stolen_card: "payments.error.cardDeclined",
    expired_card: "payments.error.expiredCard",
    incorrect_cvc: "payments.error.incorrectCvc",
    processing_error: "payments.error.processingError",
    incorrect_number: "payments.error.generic",
    card_velocity_exceeded: "payments.error.cardDeclined",
    card_declined: "payments.error.cardDeclined",
    payment_intent_authentication_failure:
      "payments.error.authenticationFailed",
  };

  const recorded = declineFixture.declines.map(
    (row) => row.decline_code ?? row.code,
  );

  it("the recorded list holds Stripe's documented test-card codes", () => {
    expect(new Set(recorded)).toEqual(new Set(Object.keys(EXPECTED)));
  });

  it.each(recorded)("%s maps to its key", (code) => {
    expect(declineMessageKey(code)).toBe(EXPECTED[code]);
  });

  it.each(declineFixture.declines.map((row) => row.code))(
    "the error code %s alone maps to its key too",
    (code) => {
      expect(declineMessageKey(code)).toBe(EXPECTED[code]);
    },
  );

  it.each(LOCALES)("every recorded code's key has a value in %s", (locale) => {
    const catalogue = Object.fromEntries(leaves(paymentsOf(locale)));
    for (const code of recorded) {
      const key = declineMessageKey(code);
      expect(typeof catalogue[key], `${locale} › ${key}`).toBe("string");
      expect(
        String(catalogue[key]).length,
        `${locale} › ${key}`,
      ).toBeGreaterThan(0);
    }
  });

  it.each([
    ["an unknown code", "some_future_code"],
    ["an empty code", ""],
    ["a prototype name", "constructor"],
    ["another prototype name", "__proto__"],
    ["null", null],
    ["undefined", undefined],
  ])("%s maps to payments.error.generic", (_label, code) => {
    expect(declineMessageKey(code)).toBe("payments.error.generic");
  });

  it("takes a code only: Stripe's message has no way in", () => {
    expect(declineMessageKey.length).toBe(1);
    expect(declineMessageKey("Your card has insufficient funds.")).toBe(
      "payments.error.generic",
    );
  });
});

describe("the payments catalogue (spec 013 AC-35, T-35)", () => {
  it("en holds every §7 key with Appendix A's text, and nothing else", () => {
    const en = Object.fromEntries(
      leaves({ payments: readJson("en.json")["payments"] }),
    );
    expect(Object.keys(en).sort()).toEqual([...SPEC_KEYS].sort());
    expect(en).toEqual(APPENDIX_A);
  });

  it.each(["de", "pl"] as const)(
    "%s holds a draft of every key, unreviewed and machine-made",
    (locale) => {
      const values = Object.fromEntries(
        leaves({ payments: readJson(`${locale}.json`)["payments"] }),
      );
      expect(Object.keys(values).sort()).toEqual([...SPEC_KEYS].sort());
      const meta = readJson(`${locale}.meta.json`) as Record<
        string,
        { source: string; reviewed: boolean }
      >;
      for (const key of SPEC_KEYS) {
        expect(meta[key], `${locale} › ${key}`).toMatchObject({
          source: "machine",
          reviewed: false,
        });
      }
    },
  );

  it("en ships every key unreviewed: copy approval is the founder's (spec 003 A17 clause 5)", () => {
    const meta = readJson("en.meta.json") as Record<
      string,
      { reviewed: boolean }
    >;
    for (const key of SPEC_KEYS) expect(meta[key]?.reviewed, key).toBe(false);
  });

  it("en-gb renders the en text through its fallback", () => {
    expect(Object.fromEntries(leaves(paymentsOf("en-gb")))).toEqual(APPENDIX_A);
  });

  it("no catalogue holds a retired key (payments.confirmation.held, .paidNow)", () => {
    for (const file of ["en", "en-gb", "de", "pl"]) {
      for (const suffix of ["", ".meta"]) {
        const text = readFileSync(
          resolve(process.cwd(), "messages", `${file}${suffix}.json`),
          "utf8",
        );
        const confirmation = (
          readJson(`${file}.json`)["payments"] as Catalogue | undefined
        )?.["confirmation"] as Catalogue | undefined;
        expect(confirmation?.["held"], file).toBeUndefined();
        expect(confirmation?.["paidNow"], file).toBeUndefined();
        expect(text, `${file}${suffix}`).not.toContain(
          ["payments", "confirmation", "held"].join("."),
        );
        expect(text, `${file}${suffix}`).not.toContain(
          ["payments", "confirmation", "paidNow"].join("."),
        );
      }
    }
  });

  it("the Stripe locale table maps the four locales as §7 lists", () => {
    expect(STRIPE_LOCALE_TABLE).toEqual({
      "en-gb": "en-GB",
      en: "en",
      de: "de",
      pl: "pl",
    });
    expect(stripeLocaleFor("en-gb")).toBe("en-GB");
    expect(stripeLocaleFor("pl")).toBe("pl");
    expect(stripeLocaleFor("en-XA")).toBe("auto");
  });
});

describe("relay language in the payments copy (spec 013 AC-41 catalogue half, T-41)", () => {
  it.each(LOCALES)(
    "%s: zero relayMatches over every payments.* value",
    (locale) => {
      const catalogue = paymentsOf(locale);
      expect(leaves(catalogue).length).toBe(SPEC_KEYS.length);
      expect(relayFindings(locale, catalogue)).toEqual([]);
    },
  );

  it("the in-context rule lets a bank's decline pass", () => {
    expect(
      relayMatches(APPENDIX_A["payments.error.cardDeclined"] ?? "", "en"),
    ).toEqual([]);
  });

  it.each(LOCALES)(
    "%s: planting the held-card sentence into payments.confirmation.paid is found",
    (locale) => {
      const catalogue = structuredClone(paymentsOf(locale));
      const confirmation = (catalogue["payments"] as Catalogue)[
        "confirmation"
      ] as Catalogue;
      confirmation["paid"] =
        "Your card is held, not charged, until a florist accepts it.";
      expect(relayFindings(locale, catalogue).length).toBeGreaterThan(0);
      expect(
        relayFindings(locale, catalogue).every((finding) =>
          finding.startsWith(`${locale} › payments.confirmation.paid › `),
        ),
      ).toBe(true);
    },
  );
});
