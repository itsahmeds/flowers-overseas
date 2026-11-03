/**
 * Spec 026a T-09, unit half (AC-9), and the address rule of AC-7 (TASK-355): the starting language
 * of a new florist membership, and the contact email as the one sign-in address.
 */
import { describe, expect, it } from "vitest";

import {
  FloristSignInEmailSchema,
  asFloristLanguage,
  floristLanguageFor,
} from "../../src/modules/partners/access/language.ts";

describe("T-09 · floristLanguageFor (AC-9)", () => {
  it.each([
    // The application's language wins, whatever the country.
    ["pl", "FR", "pl"],
    ["de", "PL", "de"],
    ["en", "PL", "en"],
    ["en", "DE", "en"],
    // No application: the country decides.
    [null, "PL", "pl"],
    [null, "DE", "de"],
    [null, "AT", "de"],
    [null, "FR", "en"],
    [null, "GB", "en"],
    [null, "pl", "pl"],
  ] as const)(
    "application %j in %s starts in %s",
    (applicationLanguage, countryIso2, expected) => {
      expect(floristLanguageFor({ applicationLanguage, countryIso2 })).toBe(
        expected,
      );
    },
  );

  it("refuses a language outside the three and a malformed country", () => {
    expect(() =>
      floristLanguageFor({
        applicationLanguage: "fr" as never,
        countryIso2: "FR",
      }),
    ).toThrow();
    expect(() =>
      floristLanguageFor({ applicationLanguage: null, countryIso2: "POL" }),
    ).toThrow();
  });

  it("reads an application's language as one of the three, or null", () => {
    expect(asFloristLanguage("de")).toBe("de");
    expect(asFloristLanguage("fr")).toBeNull();
    expect(asFloristLanguage(undefined)).toBeNull();
  });
});

describe("FloristSignInEmailSchema (AC-7)", () => {
  it("trims and lower-cases a mixed-case address with spaces", () => {
    expect(FloristSignInEmailSchema.parse("  Piotr.Nowak@Example.COM \t")).toBe(
      "piotr.nowak@example.com",
    );
  });

  it("refuses what is not an address, and an address over 254 characters", () => {
    expect(FloristSignInEmailSchema.safeParse("piotr@").success).toBe(false);
    expect(FloristSignInEmailSchema.safeParse("").success).toBe(false);
    const domain = (last: number) =>
      [45, 45, 45, last].map((n) => "b".repeat(n)).join(".");
    const at254 = `${"a".repeat(64)}@${domain(46)}.test`;
    const at255 = `${"a".repeat(64)}@${domain(47)}.test`;
    expect([at254.length, at255.length]).toEqual([254, 255]);
    expect(FloristSignInEmailSchema.safeParse(at254).success).toBe(true);
    expect(FloristSignInEmailSchema.safeParse(at255).success).toBe(false);
  });
});
