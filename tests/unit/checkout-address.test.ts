/**
 * The recipient form model and step 1's address half (spec 010 §7, §5.3 "Form quality", AC-8 /
 * T-08 unit half; TASK-200).
 *
 * `addressFormModel()` for PL, DE, GB and a generic-only destination: field order, required
 * fields and label keys exactly as `src/config/address-formats.ts` authors them; `autocomplete`
 * and `inputmode`; the generic-only destination `closed`. Then the postcode corpus of the shared
 * `addresses` fixture through `RecipientStepSchema`: a buyer's spacing is normalised before the
 * pattern is matched, and a postcode that still fails carries the fix-it key and the format's
 * example.
 */
import { describe, expect, it } from "vitest";

import { addresses as allAddresses } from "../fixtures/index.ts";
import {
  CHECKOUT_ERROR_KEYS,
  RecipientStepSchema,
  addressFormModel,
} from "../../src/modules/checkout/index.ts";

/**
 * T-08's corpus: the shared fixture's PL, DE and GB rows. AT is an authored format too, but the
 * test case names three destinations, and SI's rows exercise the generic format, which has no form.
 */
const addresses = allAddresses.filter((row) =>
  ["PL", "DE", "GB"].includes(row.country),
);

/** A valid step 1 for a destination, built from the shared fixture's first valid row there. */
function validStep(country: string): Record<string, string> {
  const fixture = addresses.find(
    (row) => row.country === country && row.invalid !== true,
  );
  if (fixture?.fields === undefined)
    throw new Error(`no fixture for ${country}`);
  return {
    ...fixture.fields,
    deliveryDate: "2027-02-14",
    placeKind: "home",
    deliveryNote: "",
  };
}

describe("addressFormModel() follows the destination's format (AC-8, T-08)", () => {
  it("PL: one street line carrying the number and apartment, postcode before city", () => {
    const model = addressFormModel("PL");
    expect(model.status).toBe("open");
    expect(model.fields.map((field) => field.field)).toEqual([
      "fullName",
      "street",
      "postcode",
      "city",
      "phone",
    ]);
    expect(
      model.fields.filter((field) => field.required).map((f) => f.field),
    ).toEqual(["fullName", "street", "postcode", "city", "phone"]);
    expect(model.fields.map((field) => field.labelKey)).toEqual([
      "checkout.address.fullName",
      "checkout.address.street",
      "checkout.address.postcode",
      "checkout.address.city",
      "checkout.address.phone",
    ]);
    expect(model.placeholderKey).toBe("checkout.address.placeholder.pl");
  });

  it("DE: the house number after the street, an optional c/o line", () => {
    const model = addressFormModel("DE");
    expect(model.fields.map((field) => field.field)).toEqual([
      "fullName",
      "street",
      "houseNumber",
      "careOf",
      "postcode",
      "city",
      "phone",
    ]);
    expect(
      model.fields.filter((field) => !field.required).map((f) => f.field),
    ).toEqual(["careOf"]);
  });

  it("GB: the postcode after the town, line 2 and county optional", () => {
    const model = addressFormModel("GB");
    expect(model.fields.map((field) => field.field)).toEqual([
      "fullName",
      "addressLine1",
      "addressLine2",
      "city",
      "region",
      "postcode",
      "phone",
    ]);
    expect(
      model.fields.filter((field) => !field.required).map((f) => f.field),
    ).toEqual(["addressLine2", "region"]);
  });

  it("carries the autocomplete token and inputmode of §5.3", () => {
    const pl = Object.fromEntries(
      addressFormModel("PL").fields.map((f) => [
        f.field,
        [f.autocomplete, f.inputMode],
      ]),
    );
    expect(pl).toEqual({
      fullName: ["name", "text"],
      street: ["address-line1", "text"],
      postcode: ["postal-code", "numeric"],
      city: ["address-level2", "text"],
      phone: ["tel", "tel"],
    });
    const gb = Object.fromEntries(
      addressFormModel("GB").fields.map((f) => [f.field, f.inputMode]),
    );
    // A UK postcode has letters, so the numeric keypad would be wrong.
    expect(gb["postcode"]).toBe("text");
    const de = addressFormModel("DE").fields;
    expect(de.find((f) => f.field === "houseNumber")?.autocomplete).toBeNull();
    expect(de.find((f) => f.field === "postcode")?.inputMode).toBe("numeric");
  });

  it("is closed for a destination with only the generic format, and has no schema", () => {
    expect(addressFormModel("SI").status).toBe("closed");
    expect(() => RecipientStepSchema("SI", "en")).toThrow(/AC-8/u);
  });

  it("throws for a malformed country code rather than falling back", () => {
    expect(() => addressFormModel("pl")).toThrow(/alpha-2/u);
    expect(() => addressFormModel("POL")).toThrow(/alpha-2/u);
  });
});

describe("step 1 normalises then matches the postcode (AC-8, T-08)", () => {
  it.each(addresses.filter((row) => row.invalid !== true && row.rawPostalCode))(
    "$label: `$rawPostalCode` is stored as `$postalCode`",
    (row) => {
      const result = RecipientStepSchema(row.country, "en").safeParse({
        ...validStep(row.country),
        postcode: row.rawPostalCode,
      });
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      expect(result.data?.address["postcode"]).toBe(row.postalCode);
    },
  );

  it.each(addresses.filter((row) => row.invalid === true))(
    "$label: refused with the fix-it key and the format's example",
    (row) => {
      const result = RecipientStepSchema(row.country, "en").safeParse({
        ...validStep(row.country),
        postcode: row.rawPostalCode ?? row.postalCode,
      });
      expect(result.success).toBe(false);
      const issue = result.error?.issues.find((i) => i.path[0] === "postcode");
      expect(issue?.message).toBe(CHECKOUT_ERROR_KEYS.postcodeFormat);
      expect((issue as { params?: unknown } | undefined)?.params).toEqual({
        example: addressFormModel(row.country).example.postcode,
      });
    },
  );

  it("covers PL, DE and GB in both directions", () => {
    for (const country of ["PL", "DE", "GB"]) {
      expect(
        addresses.some((row) => row.country === country && row.invalid),
        country,
      ).toBe(true);
      expect(
        addresses.some((row) => row.country === country && !row.invalid),
        country,
      ).toBe(true);
    }
  });

  it("calls an empty required postcode `required`, not a format error", () => {
    const result = RecipientStepSchema("PL", "pl").safeParse({
      ...validStep("PL"),
      postcode: "   ",
    });
    expect(result.error?.issues[0]?.message).toBe(CHECKOUT_ERROR_KEYS.required);
  });
});

describe("step 1's other fields (AC-8)", () => {
  it("requires every field the format marks required", () => {
    const step = validStep("DE");
    for (const field of ["fullName", "street", "houseNumber", "city"]) {
      const result = RecipientStepSchema("DE", "de").safeParse({
        ...step,
        [field]: "",
      });
      expect(result.success, field).toBe(false);
      expect(result.error?.issues[0]?.path, field).toEqual([field]);
      expect(result.error?.issues[0]?.message, field).toBe(
        CHECKOUT_ERROR_KEYS.required,
      );
    }
    // c/o is optional for DE: blank passes and is not stored.
    const blank = RecipientStepSchema("DE", "de").parse({
      ...step,
      careOf: "",
    });
    expect(blank.address).not.toHaveProperty("careOf");
  });

  it("refuses a field the format does not have, and any recipient email", () => {
    const step = validStep("PL");
    for (const extra of [{ houseNumber: "5" }, { email: "a@example.com" }]) {
      expect(
        RecipientStepSchema("PL", "pl").safeParse({ ...step, ...extra })
          .success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it("accepts spec 002's place kinds and nothing else", () => {
    const step = validStep("PL");
    for (const kind of [
      "home",
      "work",
      "hospital",
      "funeral_home",
      "hotel",
      "cemetery",
      "church",
    ]) {
      expect(
        RecipientStepSchema("PL", "pl").safeParse({ ...step, placeKind: kind })
          .success,
        kind,
      ).toBe(true);
    }
    const result = RecipientStepSchema("PL", "pl").safeParse({
      ...step,
      placeKind: "office",
    });
    expect(result.error?.issues[0]?.message).toBe(
      CHECKOUT_ERROR_KEYS.placeKindInvalid,
    );
  });

  it("refuses a delivery date that is not an ISO date", () => {
    const result = RecipientStepSchema("PL", "pl").safeParse({
      ...validStep("PL"),
      deliveryDate: "14/02/2027",
    });
    expect(result.error?.issues[0]?.message).toBe(
      CHECKOUT_ERROR_KEYS.dateInvalid,
    );
  });

  it("stores the recipient's name in NFC with its diacritics", () => {
    const decomposed = "Zo\u0301fia Gre\u0328bska";
    const result = RecipientStepSchema("PL", "pl").parse({
      ...validStep("PL"),
      fullName: decomposed,
    });
    expect(result.fullName).toBe(decomposed.normalize("NFC"));
    expect(result.fullName).toBe("Zófia Grębska");
  });
});
