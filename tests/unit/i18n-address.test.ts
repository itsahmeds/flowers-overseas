/**
 * T-19 (spec 003 AC-19, TASK-037): `formatAddressBlock` line order per destination country and
 * `normalisePostcode` accept/reject, both driven from the shared `addresses` fixture.
 *
 * The point of the fixture-driven shape: adding a country to
 * `src/config/address-formats.ts` plus a row here is the whole change (`plan/03` §8
 * "data-driven"), and nothing in `address.ts` names a country. A test that hard-coded PL's lines
 * would let a code path per country creep back in.
 */
import { describe, expect, it } from "vitest";

import {
  ADDRESS_FORMATS,
  addressFormat,
} from "../../src/config/address-formats";
import {
  AddressInputSchema,
  formatAddressBlock,
  normalisePostcode,
  postcodeRegex,
} from "../../src/modules/i18n";
import { addresses, phones } from "../fixtures";

const valid = addresses.filter((address) => address.invalid !== true);
const invalid = addresses.filter((address) => address.invalid === true);

const fieldsOf = (label: string): Record<string, string> => {
  const fixture = addresses.find((address) => address.label === label);
  if (fixture?.fields === undefined) {
    throw new Error(`no fixture with fields for ${label}`);
  }
  return { ...fixture.fields };
};

describe("the addresses fixture covers what AC-19 asks for", () => {
  it("has a valid and an invalid row for PL, DE, AT, GB and the generic fallback", () => {
    for (const country of ["PL", "DE", "AT", "GB", "SI"]) {
      expect(
        valid.some((address) => address.country === country),
        country,
      ).toBe(true);
      expect(
        invalid.some((address) => address.country === country),
        country,
      ).toBe(true);
    }
    expect(valid.length).toBeGreaterThanOrEqual(5);
  });

  it("gives every valid address a phone, because plan/03 §8 requires one everywhere", () => {
    for (const address of valid) {
      expect(address.fields?.phone, address.label).toBeTruthy();
      expect(address.lines.at(-1), address.label).toBe(address.fields?.phone);
    }
  });

  it("parses every valid address through AddressInputSchema", () => {
    for (const address of valid) {
      expect(
        AddressInputSchema.safeParse(address.fields).success,
        address.label,
      ).toBe(true);
    }
  });
});

describe("formatAddressBlock (AC-19)", () => {
  it("returns the fixture's lines for every valid address", () => {
    for (const address of valid) {
      expect(
        formatAddressBlock(fieldsOf(address.label), address.country),
        address.label,
      ).toEqual(address.lines);
    }
  });

  it("renders the plan/03 §8 order for each country", () => {
    // PL: the street line carries number and apartment; postcode before the city.
    expect(formatAddressBlock(fieldsOf(valid[0]!.label), "PL")).toEqual([
      "Anna Kowalska",
      "ul. Marszałkowska 10/5",
      "00-001 Warszawa",
      "+48 22 123 45 67",
    ]);
    // DE: house number after the street, optional c/o line, postcode before the city.
    expect(
      formatAddressBlock(
        fieldsOf("DE — house number after the street, c/o line present"),
        "DE",
      ),
    ).toEqual([
      "Lena Schmidt",
      "Kastanienallee 12",
      "c/o Müller",
      "10115 Berlin",
      "+49 30 123456",
    ]);
    // AT: identical order, four-digit postcode.
    expect(
      formatAddressBlock(
        fieldsOf("AT — same order as DE, four-digit postcode"),
        "AT",
      ),
    ).toEqual([
      "Johanna Gruber",
      "Mariahilfer Straße 45",
      "1010 Wien",
      "+43 1 1234567",
    ]);
    // GB: the postcode is its own line, after the town.
    const gb = formatAddressBlock(
      fieldsOf("GB — postcode after the town, line 2 and county present"),
      "GB",
    );
    expect(gb.indexOf("London")).toBeLessThan(gb.indexOf("SW1A 1AA"));
    expect(gb).toEqual([
      "Oliver Clarke",
      "10 Downing Street",
      "Flat 2",
      "London",
      "Greater London",
      "SW1A 1AA",
      "+44 20 7925 0918",
    ]);
  });

  it("skips empty and absent optional fields instead of leaving a blank line", () => {
    const lines = formatAddressBlock(
      {
        ...fieldsOf("GB — postcode after the town, line 2 and county present"),
        addressLine2: "   ",
        region: "",
      },
      "GB",
    );
    expect(lines).not.toContain("");
    expect(lines).toEqual([
      "Oliver Clarke",
      "10 Downing Street",
      "London",
      "SW1A 1AA",
      "+44 20 7925 0918",
    ]);
  });

  it("renders no field the country's format does not order", () => {
    // PL's format has no `careOf` and no separate `apartment`: passing them changes nothing.
    const plain = formatAddressBlock(fieldsOf(valid[0]!.label), "PL");
    const withExtras = formatAddressBlock(
      { ...fieldsOf(valid[0]!.label), careOf: "c/o Kowalski", apartment: "5" },
      "PL",
    );
    expect(withExtras).toEqual(plain);
    expect(ADDRESS_FORMATS.PL.fieldOrder).not.toContain("careOf");
  });

  it("falls back to the generic format for an unauthored country", () => {
    const fields = fieldsOf(
      "SI — a destination with no authored format uses the generic fallback",
    );
    expect(formatAddressBlock(fields, "SI")).toEqual(
      formatAddressBlock(fields, "ZZ"),
    );
    expect(addressFormat("SI")).toBe(ADDRESS_FORMATS.generic);
  });

  it("throws for a country argument that is not an ISO 3166-1 alpha-2 code", () => {
    const fields = fieldsOf(valid[0]!.label);
    for (const country of ["", "pl", "POL", "Poland", "generic", "P1"]) {
      expect(() => formatAddressBlock(fields, country), country).toThrow(
        /alpha-2/,
      );
    }
  });

  it("rejects a field value that is not a string at the boundary", () => {
    expect(() =>
      formatAddressBlock(
        { fullName: 42 } as unknown as Record<string, string>,
        "PL",
      ),
    ).toThrow();
    expect(() =>
      formatAddressBlock({ notAField: "x" } as Record<string, string>, "PL"),
    ).toThrow();
  });
});

describe("normalisePostcode (AC-19)", () => {
  it("normalises every valid fixture postcode to its canonical form", () => {
    for (const address of valid) {
      const raw = address.rawPostalCode ?? address.postalCode;
      const result = normalisePostcode(raw, address.country);
      expect(result.ok, `${address.label}: ${raw}`).toBe(true);
      if (result.ok)
        expect(result.value, address.label).toBe(address.postalCode);
    }
  });

  it("is idempotent: normalising a canonical postcode changes nothing", () => {
    for (const address of valid) {
      const first = normalisePostcode(address.postalCode, address.country);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      const second = normalisePostcode(first.value, address.country);
      expect(second.ok && second.value, address.label).toBe(first.value);
    }
  });

  it("rejects every invalid fixture postcode with the fixture's reason", () => {
    for (const address of invalid) {
      const result = normalisePostcode(address.postalCode, address.country);
      expect(result.ok, address.label).toBe(false);
      if (!result.ok) expect(result.reason, address.label).toBe(address.reason);
    }
  });

  it("reports an empty postcode separately from a malformed one", () => {
    for (const raw of ["", "   ", "\t"]) {
      const result = normalisePostcode(raw, "PL");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("empty");
    }
  });

  it("inserts the Polish hyphen and refuses the wrong digit count", () => {
    expect(normalisePostcode("00001", "PL")).toEqual({
      ok: true,
      value: "00-001",
    });
    expect(normalisePostcode("00 001", "PL")).toEqual({
      ok: true,
      value: "00-001",
    });
    expect(normalisePostcode("0001", "PL").ok).toBe(false);
    expect(normalisePostcode("000011", "PL").ok).toBe(false);
  });

  it("uppercases a UK postcode and puts one space before the inward code", () => {
    for (const raw of ["sw1a1aa", "SW1A 1AA", "  sw1a  1aa  ", "Sw1a1Aa"]) {
      expect(normalisePostcode(raw, "GB"), raw).toEqual({
        ok: true,
        value: "SW1A 1AA",
      });
    }
    expect(normalisePostcode("m11ae", "GB")).toEqual({
      ok: true,
      value: "M1 1AE",
    });
    expect(normalisePostcode("SW1A", "GB").ok).toBe(false);
  });

  it("keeps DE and AT digits only, and each to its own length", () => {
    expect(normalisePostcode("D-10115", "DE")).toEqual({
      ok: true,
      value: "10115",
    });
    expect(normalisePostcode("1010", "DE").ok).toBe(false);
    expect(normalisePostcode("A-1010", "AT")).toEqual({
      ok: true,
      value: "1010",
    });
    expect(normalisePostcode("10115", "AT").ok).toBe(false);
  });

  it("throws for a malformed country argument, like formatAddressBlock", () => {
    for (const country of ["", "pl", "Poland", "generic"]) {
      expect(() => normalisePostcode("00-001", country), country).toThrow(
        /alpha-2/,
      );
    }
  });
});

describe("postcodeRegex (AC-19)", () => {
  it("returns the configured, anchored pattern per country", () => {
    expect(postcodeRegex("PL").source).toBe(ADDRESS_FORMATS.PL.postcodePattern);
    expect(postcodeRegex("GB").source).toBe(ADDRESS_FORMATS.GB.postcodePattern);
    expect(postcodeRegex("SI").source).toBe(
      ADDRESS_FORMATS.generic.postcodePattern,
    );
    for (const country of ["PL", "DE", "AT", "GB", "SI"]) {
      expect(postcodeRegex(country).source.startsWith("^"), country).toBe(true);
      expect(postcodeRegex(country).source.endsWith("$"), country).toBe(true);
      expect(postcodeRegex(country).global, country).toBe(false);
    }
  });

  it("matches the fixture's canonical postcodes and not the invalid ones", () => {
    for (const address of valid) {
      expect(
        postcodeRegex(address.country).test(address.postalCode),
        address.label,
      ).toBe(true);
    }
    for (const address of invalid) {
      expect(
        postcodeRegex(address.country).test(address.postalCode),
        address.label,
      ).toBe(false);
    }
  });

  it("throws for a malformed country argument", () => {
    expect(() => postcodeRegex("pl")).toThrow(/alpha-2/);
  });
});

describe("the phones fixture (data only, spec 010 validates)", () => {
  it("has a valid landline and mobile for PL, DE and GB and three rejections", () => {
    for (const country of ["PL", "DE", "GB"]) {
      expect(
        phones.filter(
          (phone) => phone.country === country && phone.invalid !== true,
        ).length,
        country,
      ).toBeGreaterThanOrEqual(2);
    }
    expect(phones.filter((phone) => phone.invalid === true)).toHaveLength(3);
  });

  it("keeps every valid number in E.164 shape and every invalid one out of it", () => {
    const e164 = /^\+[1-9]\d{6,14}$/;
    for (const phone of phones) {
      expect(e164.test(phone.e164), phone.label).toBe(phone.invalid !== true);
      expect(phone.national.length, phone.label).toBeGreaterThan(0);
    }
  });
});
