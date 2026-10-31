/**
 * The refused-post echo (spec 010 §5.3 "Everything works with JavaScript disabled", AC-7, AC-14,
 * AC-27, AC-33; TASK-204): the one-hop cookie that carries a refused post's values and messages
 * back to its screen, so the JavaScript-off form keeps what the buyer typed.
 *
 *  - round trip: what goes in comes out, step, line, values, messages and the refusal;
 *  - an echo too large for a cookie keeps its messages and drops the values;
 *  - anything that is not an echo this module wrote (tampered, foreign, oversized) reads as none;
 *  - the cookie is `HttpOnly; Secure; SameSite=Lax`, scoped to the locale's checkout, 5 minutes.
 */
import { describe, expect, it } from "vitest";

import {
  CHECKOUT_ECHO_COOKIE_NAME,
  CHECKOUT_ECHO_MAX_AGE_SECONDS,
  checkoutEchoCookieAttributes,
  decodeCheckoutEcho,
  encodeCheckoutEcho,
} from "../../src/modules/checkout/index.ts";

const refused = {
  step: "recipient",
  line: 2,
  values: {
    fullName: "",
    street: "ul. Marszałkowska 10/5",
    postcode: "00-00",
    addonKeys: ["vase", "chocolates"],
  },
  errors: {
    fullName: [{ key: "checkout.error.required" }],
    postcode: [
      { key: "checkout.error.postcodeFormat", params: { example: "00-001" } },
    ],
  },
  attempt: 1_761_321_600_000,
} as const;

describe("encodeCheckoutEcho / decodeCheckoutEcho", () => {
  it("round-trips a refused post", () => {
    const value = encodeCheckoutEcho(refused);
    expect(value).not.toBeNull();
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeCheckoutEcho(value)).toEqual({
      step: "recipient",
      line: 2,
      values: {
        fullName: "",
        street: "ul. Marszałkowska 10/5",
        postcode: "00-00",
        addonKeys: ["vase", "chocolates"],
      },
      errors: {
        fullName: [{ key: "checkout.error.required" }],
        postcode: [
          {
            key: "checkout.error.postcodeFormat",
            params: { example: "00-001" },
          },
        ],
      },
      attempt: 1_761_321_600_000,
    });
  });

  it("carries step 3's refusal", () => {
    const value = encodeCheckoutEcho({
      step: "review",
      line: 1,
      values: {},
      errors: {},
      attempt: 3,
      refused: "cap",
    });
    expect(decodeCheckoutEcho(value)?.refused).toBe("cap");
  });

  it("keeps only string and number params", () => {
    const value = encodeCheckoutEcho({
      ...refused,
      errors: {
        cardMessage: [
          {
            key: "checkout.error.tooLong",
            params: { max: 200, at: new Date(0), label: "Card" },
          },
        ],
      },
    });
    expect(decodeCheckoutEcho(value)?.errors["cardMessage"]).toEqual([
      { key: "checkout.error.tooLong", params: { max: 200, label: "Card" } },
    ]);
  });

  it("drops the values, never the messages, when the echo would not fit a cookie", () => {
    const long = "ż".repeat(990);
    const value = encodeCheckoutEcho({
      ...refused,
      values: { a: long, b: long, c: long, d: long },
    });
    const echo = decodeCheckoutEcho(value);
    expect(echo?.values).toEqual({});
    expect(Object.keys(echo?.errors ?? {})).toEqual(["fullName", "postcode"]);
    expect(value?.length ?? Infinity).toBeLessThanOrEqual(3_600);
  });

  it.each([
    ["no cookie", undefined],
    ["empty", ""],
    ["not base64url", "abc$def"],
    ["not JSON", Buffer.from("{nope", "utf8").toString("base64url")],
    [
      "an unknown step",
      Buffer.from(JSON.stringify({ ...refused, step: "pay" }), "utf8").toString(
        "base64url",
      ),
    ],
    [
      "an extra field",
      Buffer.from(JSON.stringify({ ...refused, admin: true }), "utf8").toString(
        "base64url",
      ),
    ],
    [
      "a message key that is not a key",
      Buffer.from(
        JSON.stringify({
          ...refused,
          errors: { fullName: [{ key: "<script>" }] },
        }),
        "utf8",
      ).toString("base64url"),
    ],
    ["oversized", "A".repeat(3_601)],
  ])("reads %s as no echo", (_label, value) => {
    expect(decodeCheckoutEcho(value)).toBeNull();
  });
});

describe("the echo cookie's attributes", () => {
  it("is HttpOnly, Secure, SameSite=Lax, scoped to the locale's checkout, five minutes", () => {
    expect(CHECKOUT_ECHO_COOKIE_NAME).toBe("fo_checkout_echo");
    expect(CHECKOUT_ECHO_MAX_AGE_SECONDS).toBe(300);
    expect(checkoutEchoCookieAttributes("pl")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/pl/checkout",
      maxAge: 300,
    });
  });

  it("refuses a locale that is not ours", () => {
    expect(() => checkoutEchoCookieAttributes("xx")).toThrow();
  });
});
