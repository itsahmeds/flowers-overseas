/**
 * Phones at the checkout's boundary (spec 010 §7, AC-9 / T-09; `plan/03` §8; TASK-200).
 *
 * The PL, DE and GB corpus: the shared `phones` fixture (spec 001 reserved it, spec 003 filled it
 * "so that spec 010 has its rejection cases the day it starts"), plus the rejections a numbering
 * plan adds that the fixture's E.164-shape rows cannot express (a number of the right shape that
 * no plan assigns). Every valid number passes in its national and its international form and is
 * stored in E.164; every invalid one fails with a message key; a valid non-local number passes
 * with the non-local warning.
 */
import { describe, expect, it } from "vitest";

import { phones } from "../fixtures/index.ts";
import {
  CHECKOUT_ERROR_KEYS,
  PHONE_NON_LOCAL_KEY,
  RecipientStepSchema,
  parseBuyerPhone,
  parseRecipientPhone,
} from "../../src/modules/checkout/index.ts";

const CORPUS_COUNTRIES = ["PL", "DE", "GB"] as const;
const valid = phones.filter(
  (phone) =>
    phone.invalid !== true &&
    (CORPUS_COUNTRIES as readonly string[]).includes(phone.country),
);
const invalid = phones.filter((phone) => phone.invalid === true);

/** Numbers of a plausible shape that the destination's plan refuses (too short, unassigned). */
const PLAN_REJECTIONS = [
  { country: "PL", raw: "000 000 000", label: "PL, no such block" },
  { country: "PL", raw: "512 345 67", label: "PL, one digit short" },
  { country: "DE", raw: "030 1", label: "DE, Berlin too short" },
  { country: "DE", raw: "+49 0151 1234", label: "DE, mobile too short" },
  { country: "GB", raw: "07911 12345", label: "GB, mobile one digit short" },
  { country: "GB", raw: "020 7925 091", label: "GB, London too short" },
] as const;

describe("the recipient phone is parsed against the destination's plan (AC-9, T-09)", () => {
  it("has a landline and a mobile per corpus country", () => {
    for (const country of CORPUS_COUNTRIES) {
      expect(
        valid.filter((phone) => phone.country === country).length,
        country,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(valid)(
    "$label: the national form `$national` is stored as $e164",
    (phone) => {
      const result = parseRecipientPhone(phone.national, phone.country);
      expect(result).toMatchObject({
        ok: true,
        e164: phone.e164,
        nonLocal: false,
      });
    },
  );

  it.each(valid)("$label: the international form is local too", (phone) => {
    const result = parseRecipientPhone(phone.e164, phone.country);
    expect(result).toMatchObject({
      ok: true,
      e164: phone.e164,
      nonLocal: false,
    });
  });

  it.each(PLAN_REJECTIONS)("$label is refused", ({ country, raw }) => {
    expect(parseRecipientPhone(raw, country)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses the fixture's too-short and lettered rows for their destination", () => {
    expect(parseRecipientPhone("+4812", "PL")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(parseRecipientPhone("+44FLOWERS1", "GB")).toEqual({
      ok: false,
      reason: "notANumber",
    });
    expect(parseRecipientPhone("0FLOWERS1", "GB")).toEqual({
      ok: false,
      reason: "notANumber",
    });
  });

  it("reads a nationally written number as the destination's: the fixture's no-country-code row is valid for PL", () => {
    // `221234567` is invalid as a *stored* value (it is not E.164, which is why the fixture marks
    // it), and valid as what a buyer types for a Polish recipient, which is the point of AC-9.
    const row = invalid.find((phone) => phone.reason === "no-country-code");
    expect(row).toBeDefined();
    expect(parseRecipientPhone(row?.e164 ?? "", "PL")).toMatchObject({
      ok: true,
      e164: "+48221234567",
    });
  });

  it("refuses every invalid fixture row as a buyer phone with no country to read it in", () => {
    for (const phone of invalid) {
      expect(parseBuyerPhone(phone.e164, undefined).ok, phone.label).toBe(
        false,
      );
    }
  });

  it("accepts a valid number of another country with the non-local warning", () => {
    for (const destination of CORPUS_COUNTRIES) {
      for (const phone of valid.filter((p) => p.country !== destination)) {
        const result = parseRecipientPhone(phone.e164, destination);
        expect(result, `${phone.label} for ${destination}`).toMatchObject({
          ok: true,
          e164: phone.e164,
          nonLocal: true,
        });
      }
    }
    // `0048…` is the international prefix written out, and reads the same.
    expect(parseRecipientPhone("0048 512 345 678", "DE")).toMatchObject({
      ok: true,
      e164: "+48512345678",
      nonLocal: true,
    });
  });

  it("treats a +44 number the metadata files under Guernsey as local for GB", () => {
    // `07911 …` is GG in libphonenumber's metadata, but a London florist dials it as a UK number.
    expect(parseRecipientPhone("07911 123456", "GB")).toMatchObject({
      ok: true,
      nonLocal: false,
    });
  });

  it("refuses an empty phone as `empty`", () => {
    expect(parseRecipientPhone("  ", "PL")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("throws for a destination code that is not one, rather than guessing", () => {
    expect(() => parseRecipientPhone("512 345 678", "pl")).toThrow(/alpha-2/u);
    expect(() => parseRecipientPhone("512 345 678", "XX")).toThrow(/alpha-2/u);
  });
});

describe("step 1 stores the phone in E.164 and surfaces the warning (AC-9)", () => {
  const step = {
    fullName: "Anna Nowak",
    street: "ul. Marszałkowska 10/5",
    postcode: "00-001",
    city: "Warszawa",
    deliveryDate: "2027-02-14",
    placeKind: "home",
    deliveryNote: "",
  };

  it("stores a local number in E.164 with no warning", () => {
    const parsed = RecipientStepSchema("PL", "pl").parse({
      ...step,
      phone: "512 345 678",
    });
    expect(parsed.phone).toEqual({
      e164: "+48512345678",
      national: "512 345 678",
      nonLocal: false,
    });
  });

  it("keeps a non-local number with the warning flag the form turns into its key", () => {
    const parsed = RecipientStepSchema("PL", "pl").parse({
      ...step,
      phone: "+44 20 7925 0918",
    });
    expect(parsed.phone).toMatchObject({
      e164: "+442079250918",
      nonLocal: true,
    });
    expect(PHONE_NON_LOCAL_KEY).toBe("checkout.recipient.phoneNonLocal");
  });

  it("fails an invalid or missing phone with a message key", () => {
    const bad = RecipientStepSchema("PL", "pl").safeParse({
      ...step,
      phone: "000 000 000",
    });
    expect(bad.error?.issues).toEqual([
      expect.objectContaining({
        path: ["phone"],
        message: CHECKOUT_ERROR_KEYS.phoneInvalid,
      }),
    ]);
    const missing = RecipientStepSchema("PL", "pl").safeParse(step);
    expect(missing.error?.issues).toEqual([
      expect.objectContaining({
        path: ["phone"],
        message: CHECKOUT_ERROR_KEYS.required,
      }),
    ]);
  });
});

describe("the buyer's optional phone may be from any country", () => {
  it("reads a national number in the plan of the country of residence", () => {
    expect(parseBuyerPhone("020 7925 0918", "GB")).toMatchObject({
      ok: true,
      e164: "+442079250918",
      nonLocal: false,
    });
  });

  it("accepts an international number whatever the residence", () => {
    expect(parseBuyerPhone("+48 512 345 678", "GB")).toMatchObject({
      ok: true,
      e164: "+48512345678",
      nonLocal: false,
    });
  });
});
