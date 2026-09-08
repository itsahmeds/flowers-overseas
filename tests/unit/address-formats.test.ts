/**
 * Address-format data (spec 003 §2, §7, `plan/03` §8; TASK-033 half of AC-1's "config parses"
 * clause). The *formatter* — `formatAddressBlock`, `postcodeRegex`, `normalisePostcode` — is
 * TASK-037; this file pins the data those functions will consume: per destination country the
 * field order, the required fields, the label **keys** (so a new country is data plus four
 * message keys), the postcode pattern, the normaliser it needs and the example placeholder.
 */
import { describe, expect, it } from "vitest";

import {
  ADDRESS_FORMATS,
  ADDRESS_FORMAT_KEYS,
  AddressFormatSchema,
  addressFormat,
} from "../../src/config/address-formats.ts";

describe("src/config/address-formats.ts", () => {
  it("ships PL, DE, AT, GB and a generic fallback (plan/03 §8)", () => {
    expect([...ADDRESS_FORMAT_KEYS]).toEqual([
      "PL",
      "DE",
      "AT",
      "GB",
      "generic",
    ]);
  });

  it("parses every format under AddressFormatSchema", () => {
    for (const key of ADDRESS_FORMAT_KEYS) {
      expect(AddressFormatSchema.parse(ADDRESS_FORMATS[key])).toEqual(
        ADDRESS_FORMATS[key],
      );
    }
  });

  it("falls back to the generic format for a country with no data", () => {
    expect(addressFormat("PL")).toBe(ADDRESS_FORMATS.PL);
    expect(addressFormat("FR")).toBe(ADDRESS_FORMATS.generic);
  });

  it("requires the recipient phone in every format (florists call ahead)", () => {
    for (const key of ADDRESS_FORMAT_KEYS) {
      expect(ADDRESS_FORMATS[key].fieldOrder, key).toContain("phone");
      expect(ADDRESS_FORMATS[key].required, key).toContain("phone");
    }
  });

  it("keeps `required` a subset of `fieldOrder` and gives every field a label key", () => {
    for (const key of ADDRESS_FORMAT_KEYS) {
      const format = ADDRESS_FORMATS[key];
      for (const field of format.required) {
        expect(format.fieldOrder, `${key}.${field}`).toContain(field);
      }
      for (const field of format.fieldOrder) {
        expect(format.labelKeys[field], `${key}.${field}`).toMatch(
          /^[a-z][A-Za-z0-9]*(\.[a-zA-Z][A-Za-z0-9]*)+$/,
        );
      }
    }
  });

  it("orders the fields as plan/03 §8 tabulates them", () => {
    expect(ADDRESS_FORMATS.PL.fieldOrder).toEqual([
      "fullName",
      "street",
      "postcode",
      "city",
      "phone",
    ]);
    // DE / AT: house number after the street, optional c/o line before the postcode.
    expect(ADDRESS_FORMATS.DE.fieldOrder).toEqual([
      "fullName",
      "street",
      "houseNumber",
      "careOf",
      "postcode",
      "city",
      "phone",
    ]);
    expect(ADDRESS_FORMATS.AT.fieldOrder).toEqual(
      ADDRESS_FORMATS.DE.fieldOrder,
    );
    expect(ADDRESS_FORMATS.DE.required).not.toContain("careOf");
    // GB: postcode after the town, county optional.
    expect(ADDRESS_FORMATS.GB.fieldOrder).toEqual([
      "fullName",
      "addressLine1",
      "addressLine2",
      "city",
      "region",
      "postcode",
      "phone",
    ]);
    expect(ADDRESS_FORMATS.GB.required).not.toContain("region");
    expect(ADDRESS_FORMATS.GB.required).not.toContain("addressLine2");
  });

  it("records the apartment convention per country", () => {
    // PL puts the apartment in the street line (`ul. Marszałkowska 10/5`).
    expect(ADDRESS_FORMATS.PL.apartmentField).toBe(false);
    expect(ADDRESS_FORMATS.PL.examplePlaceholder.street).toBe(
      "ul. Marszałkowska 10/5",
    );
  });

  it("accepts the example postcode of every country against its own pattern", () => {
    for (const key of ADDRESS_FORMAT_KEYS) {
      const format = ADDRESS_FORMATS[key];
      expect(
        new RegExp(format.postcodePattern).test(
          format.examplePlaceholder.postcode,
        ),
        key,
      ).toBe(true);
    }
  });

  it("accepts and rejects postcodes per country (plan/03 §8)", () => {
    const cases: Record<string, { valid: string[]; invalid: string[] }> = {
      PL: {
        valid: ["00-001", "31-042", "80-180"],
        invalid: ["00001", "0-001", "00-01", "AA-001", "00-0011", " 00-001"],
      },
      DE: {
        valid: ["10115", "80331"],
        invalid: ["1011", "101150", "D-10115", "1011A"],
      },
      AT: {
        valid: ["1010", "5020"],
        invalid: ["10115", "101", "A-1010"],
      },
      GB: {
        valid: ["SW1A 1AA", "M1 1AE", "CR2 6XH", "DN55 1PT", "EC1A 1BB"],
        invalid: ["SW1A1AA", "sw1a 1aa", "1AA SW1A", "SW1A 1A", "ZZZZ 9ZZ"],
      },
    };
    for (const [key, { valid, invalid }] of Object.entries(cases)) {
      const pattern = new RegExp(ADDRESS_FORMATS[key as "PL"].postcodePattern);
      for (const postcode of valid) {
        expect(pattern.test(postcode), `${key} accepts ${postcode}`).toBe(true);
      }
      for (const postcode of invalid) {
        expect(pattern.test(postcode), `${key} rejects ${postcode}`).toBe(
          false,
        );
      }
    }
  });

  it("names a normaliser for every country, so TASK-037 has no choice to make", () => {
    expect(ADDRESS_FORMATS.PL.postcodeNormaliser).toBe("digits-hyphen-2-3");
    expect(ADDRESS_FORMATS.DE.postcodeNormaliser).toBe("digits");
    expect(ADDRESS_FORMATS.AT.postcodeNormaliser).toBe("digits");
    expect(ADDRESS_FORMATS.GB.postcodeNormaliser).toBe("uk-outward-inward");
    expect(ADDRESS_FORMATS.generic.postcodeNormaliser).toBe("upper-trim");
  });

  it("rejects a format whose required field is not in the field order", () => {
    const broken = {
      ...ADDRESS_FORMATS.PL,
      required: [...ADDRESS_FORMATS.PL.required, "region"],
    };
    const result = AddressFormatSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join(".")).join(","),
      ).toContain("required");
    }
  });

  it("rejects a format with a missing label key and an unparsable postcode pattern", () => {
    const missingLabel = {
      ...ADDRESS_FORMATS.DE,
      labelKeys: { ...ADDRESS_FORMATS.DE.labelKeys, city: undefined },
    };
    expect(AddressFormatSchema.safeParse(missingLabel).success).toBe(false);

    const badPattern = { ...ADDRESS_FORMATS.DE, postcodePattern: "^[0-9{5}$" };
    const result = AddressFormatSchema.safeParse(badPattern);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join(".")).join(","),
      ).toContain("postcodePattern");
    }
  });
});
