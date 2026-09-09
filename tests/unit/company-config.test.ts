/**
 * `src/config/company.ts` (spec 004 §2, §5.1, §5.3 "Footer", AC-9; `plan/07` §6; TASK-047).
 *
 * The canvas prints `Operated by [COMPANY LEGAL NAME], [REGISTERED ADDRESS], [REGISTRATION NO].`
 * and none of those three facts exists: the OÜ is registered on `plan/09`'s 1 Nov target, and
 * inventing a registry number is a `plan/07` §6 offence. The refinement fixture below is the
 * mechanism spec 004 AC-9 relies on (T-11's unit half): **`registered: true` without a VAT id —
 * or without any one of the five registry fields — must fail the parse**, and the reverse
 * (registry data present while `registered` is false) must fail too, so the flag and the facts
 * cannot drift apart in either direction.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMPANY,
  CompanySchema,
  isCompanyRegistered,
} from "../../src/config/company.ts";

const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8"),
) as {
  company: {
    description: string;
    operatedBy: string;
    support: Record<string, string>;
  };
};

const canvas = readFileSync(
  resolve(__dirname, "../../docs/design/homepage-v1/homepage-desktop.dc.html"),
  "utf8",
);

/** A fully registered identity — the shape the founder fills in after 1 Nov 2026. */
const registered = {
  ...COMPANY,
  registered: true,
  legalName: "Flowers Overseas OÜ",
  registryName: "Estonian Business Register",
  registrationNumber: "16000000",
  vatId: "EE100000000",
  address: {
    lines: ["Example tee 1"],
    postalCode: "10111",
    city: "Tallinn",
    countryIso2: "EE",
  },
};

describe("src/config/company.ts", () => {
  it("is unregistered in Phase 0 and holds no registry, VAT or address data (AC-9)", () => {
    expect(isCompanyRegistered()).toBe(false);
    expect(COMPANY.registered).toBe(false);
    expect(COMPANY.legalName).toBeUndefined();
    expect(COMPANY.registryName).toBeUndefined();
    expect(COMPANY.registrationNumber).toBeUndefined();
    expect(COMPANY.vatId).toBeUndefined();
    expect(COMPANY.address).toBeUndefined();
  });

  it("carries the trading name and the one contact channel the design shows", () => {
    expect(COMPANY.tradingName).toBe("Flowers Overseas");
    expect(canvas).toContain(">Flowers Overseas<");
    expect(COMPANY.contact.phoneE164).toBe("+12135925150");
    expect(COMPANY.contact.phoneDisplay).toBe("+1 (213) 592-5150");
    expect(COMPANY.contact.whatsapp).toBe(true);
    expect(canvas).toContain(COMPANY.contact.phoneDisplay);
  });

  it("keeps every word a message key, resolving to the canvas's copy", () => {
    expect(COMPANY.descriptionKey).toBe("company.description");
    expect(COMPANY.operatedByKey).toBe("company.operatedBy");
    expect(COMPANY.contact.labelKey).toBe("company.support.label");
    expect(COMPANY.contact.hoursKey).toBe("company.support.hours");
    expect(messages.company.description).toBe(
      "We send flowers across Europe. You order from us; our florist in the recipient's town makes the bouquet and hands it over in person.",
    );
    expect(canvas).toContain(messages.company.description);
    expect(canvas).toContain(messages.company.support.hours);
    // The identity sentence is the registered-state clause and takes all three facts.
    expect(messages.company.operatedBy).toContain("{legalName}");
    expect(messages.company.operatedBy).toContain("{address}");
    expect(messages.company.operatedBy).toContain("{registrationNumber}");
  });

  it("never ships the canvas's bracket placeholders as copy", () => {
    expect(canvas).toContain("[COMPANY LEGAL NAME]");
    const catalogue = readFileSync(
      resolve(__dirname, "../../messages/en.json"),
      "utf8",
    );
    for (const placeholder of [
      "[COMPANY LEGAL NAME]",
      "[REGISTERED ADDRESS]",
      "[REGISTRATION NO]",
    ]) {
      expect(catalogue, placeholder).not.toContain(placeholder);
    }
  });

  it("accepts a fully registered identity", () => {
    const result = CompanySchema.safeParse(registered);
    expect(result.success).toBe(true);
  });

  it("refuses `registered: true` without a VAT id, and without each other fact (AC-9)", () => {
    for (const field of [
      "vatId",
      "legalName",
      "registryName",
      "registrationNumber",
      "address",
    ] as const) {
      const withoutField = Object.fromEntries(
        Object.entries(registered).filter(([key]) => key !== field),
      );
      const result = CompanySchema.safeParse(withoutField);
      expect(result.success, field).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.map((issue) => issue.path.join(".")),
        ).toContain(field);
        expect(result.error.issues[0]?.message).toMatch(/registered: true/);
      }
    }
  });

  it("refuses registry data while `registered` is false", () => {
    const result = CompanySchema.safeParse({
      ...COMPANY,
      registrationNumber: "16000000",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(
        /while `registered` is false/,
      );
    }
  });

  it("refuses a malformed phone, a stray field and an empty address line", () => {
    expect(
      CompanySchema.safeParse({
        ...COMPANY,
        contact: { ...COMPANY.contact, phoneE164: "0048 22 000 00 00" },
      }).success,
    ).toBe(false);
    expect(
      CompanySchema.safeParse({ ...COMPANY, contactEmail: "hello@example.com" })
        .success,
    ).toBe(false);
    expect(
      CompanySchema.safeParse({
        ...registered,
        address: { ...registered.address, lines: [] },
      }).success,
    ).toBe(false);
  });
});
