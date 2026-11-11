/**
 * The account details form's boundary (spec 018 §14 A-founder-2026-10-22 C.7.2; AC-53 the
 * refusal half, T-53; TASK-352): `parseDetailsForm` turns the posted fields into `DetailsInput`
 * (the phone in E.164 through spec 003's parser) or refuses field by field, and a refusal carries
 * nothing to save. The save itself is `tests/integration/buyer-account.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { parseDetailsForm } from "../../src/app/[locale]/(account)/account/details/details-form.ts";
import { DetailsInputSchema } from "../../src/modules/customers/buyer-account.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const VALID = {
  buyerName: "  Anna Example ",
  buyerPhone: "07400 123456",
  residenceCountry: "GB",
  preferredLocale: "en-gb",
  preferredCurrency: "gbp",
};

describe("parseDetailsForm (AC-53)", () => {
  it("parses a valid form: the phone in E.164 from the country's plan, the name trimmed", () => {
    const parsed = parseDetailsForm(form(VALID));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input).toEqual({
      name: "Anna Example",
      phoneE164: "+447400123456",
      countryIso2: "GB",
      preferredLocale: "en-gb",
      preferredCurrency: "GBP",
    });
    expect(DetailsInputSchema.parse(parsed.input)).toEqual(parsed.input);
  });

  it("an empty phone is no phone (it is optional)", () => {
    const parsed = parseDetailsForm(form({ ...VALID, buyerPhone: " " }));
    expect(parsed.ok && parsed.input.phoneE164).toBeNull();
  });

  it("refuses an invalid phone with phoneInvalid and nothing to save", () => {
    const parsed = parseDetailsForm(
      form({ ...VALID, buyerPhone: "07700 900" }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual({ buyerPhone: "phoneInvalid" });
    expect("input" in parsed).toBe(false);
    expect(parsed.values.buyerPhone).toBe("07700 900");
  });

  it("refuses an empty name, a name over 200 characters and a country that is not one", () => {
    expect(parseDetailsForm(form({ ...VALID, buyerName: "  " }))).toMatchObject(
      {
        ok: false,
        errors: { buyerName: "required" },
      },
    );
    expect(
      parseDetailsForm(form({ ...VALID, buyerName: "a".repeat(201) })),
    ).toMatchObject({ ok: false, errors: { buyerName: "tooLong" } });
    expect(
      parseDetailsForm(form({ ...VALID, residenceCountry: "XX" })),
    ).toMatchObject({
      ok: false,
      errors: { residenceCountry: "countryInvalid" },
    });
  });

  it("refuses a language or currency outside the lists; an empty one is no preference", () => {
    expect(
      parseDetailsForm(form({ ...VALID, preferredLocale: "fr" })),
    ).toMatchObject({
      ok: false,
      errors: { preferredLocale: "required" },
    });
    expect(
      parseDetailsForm(form({ ...VALID, preferredCurrency: "XYZ" })),
    ).toMatchObject({
      ok: false,
      errors: { preferredCurrency: "required" },
    });
    const none = parseDetailsForm(
      form({ ...VALID, preferredLocale: "", preferredCurrency: "" }),
    );
    expect(
      none.ok && [none.input.preferredLocale, none.input.preferredCurrency],
    ).toEqual([null, null]);
  });

  it("a missing form refuses every required field and never throws", () => {
    const parsed = parseDetailsForm(null);
    expect(parsed).toMatchObject({
      ok: false,
      errors: { buyerName: "required", residenceCountry: "countryInvalid" },
    });
  });
});
