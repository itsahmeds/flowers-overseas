/**
 * Spec 012 T-17 (AC-15) and the pure half of T-18 and T-20 (AC-16, AC-17; TASK-221): the partner
 * validators, the §2.5 status graph, the activation preflight, and the application graph.
 *
 * Every refusal is asserted as the one code on the one field, never as "some error": a test that
 * passes with its subject removed proves nothing (`CLAUDE.md` DoD §4).
 */
import { describe, expect, it } from "vitest";

import {
  ACTIVATION_CONDITIONS,
  PARTNER_STATUS_EDGES,
  activationPreflight,
  isApplicationEdge,
  isPartnerStatusEdge,
  parseBlackout,
  parseCoverage,
  parseMapping,
  parsePartnerCode,
  parsePartnerProfile,
  parseTerms,
  partnerPhoneE164,
  payoutMinorUnits,
  unmetConditions,
} from "../../src/modules/partners/admin/schemas.ts";
import { codeStem } from "../../src/modules/partners/admin/applications.ts";

const REFERENCE = {
  currencies: new Set(["PLN", "EUR", "GBP"]),
  countries: new Set(["PL", "DE", "GB"]),
};

const PROFILE = {
  legalName: "Kwiaciarnia pod Lipą",
  cityLabel: "Kraków",
  countryIso2: "PL",
  notificationChannel: "email",
  contactEmail: "Piotr.Nowak@Example.com ",
  contactPhone: "512 345 678",
  payoutCurrency: "PLN",
  capacityPerDay: "8",
};

const NOW = new Date("2026-11-02T12:00:00Z");
const PRODUCT = "6f1c2a8e-3b7d-4c5e-9a1f-2b3c4d5e6f70";

describe("T-17 · partner validators (AC-15)", () => {
  it("accepts a whole profile and stores the phone as E.164 for the partner's country", () => {
    expect(parsePartnerProfile(PROFILE, REFERENCE)).toEqual({
      ok: true,
      value: {
        legalName: "Kwiaciarnia pod Lipą",
        cityLabel: "Kraków",
        countryIso2: "PL",
        notificationChannel: "email",
        contactEmail: "piotr.nowak@example.com",
        contactPhone: "+48512345678",
        payoutCurrency: "PLN",
        capacityPerDay: 8,
      },
    });
  });

  it.each([
    "piotr",
    "piotr@",
    "@example.com",
    "piotr@@example.com",
    "a b@example.com",
  ])("refuses the malformed email %j", (email) => {
    expect(
      parsePartnerProfile({ ...PROFILE, contactEmail: email }, REFERENCE),
    ).toEqual({ ok: false, errors: { contactEmail: "email" } });
  });

  it.each([
    ["too short for PL", "512 345"],
    ["a German number for a Polish florist", "+49 30 901820"],
    ["letters", "0FLOWERS1"],
    ["a UK number for a Polish florist", "+44 7911 123456"],
    ["no digits", "+48"],
  ])("refuses a phone that is not E.164 for PL: %s", (_why, phone) => {
    expect(
      parsePartnerProfile({ ...PROFILE, contactPhone: phone }, REFERENCE),
    ).toEqual({ ok: false, errors: { contactPhone: "phone" } });
  });

  it("refuses a valid German number for PL but accepts it for DE", () => {
    expect(partnerPhoneE164("+49 30 901820", "PL")).toBeUndefined();
    expect(partnerPhoneE164("030 901820", "DE")).toBe("+4930901820");
  });

  it("needs a phone when the channel is WhatsApp", () => {
    expect(
      parsePartnerProfile(
        { ...PROFILE, notificationChannel: "whatsapp", contactPhone: "" },
        REFERENCE,
      ),
    ).toEqual({ ok: false, errors: { contactPhone: "phoneForChannel" } });
  });

  it.each(["XXX", "pln1", "", "USD"])(
    "refuses the payout currency %j, which is not in `currency`",
    (code) => {
      expect(
        parsePartnerProfile({ ...PROFILE, payoutCurrency: code }, REFERENCE),
      ).toEqual({ ok: false, errors: { payoutCurrency: "currency" } });
    },
  );

  it("refuses a country with no `country` row", () => {
    expect(
      parsePartnerProfile({ ...PROFILE, countryIso2: "FR" }, REFERENCE),
    ).toEqual({
      ok: false,
      // The phone cannot be judged without the country, so it is refused too.
      errors: { countryIso2: "country", contactPhone: "phone" },
    });
  });

  it.each(["0", "-1", "1.5", "501", "", "eight"])(
    "refuses the capacity %j",
    (capacity) => {
      expect(
        parsePartnerProfile(
          { ...PROFILE, capacityPerDay: capacity },
          REFERENCE,
        ),
      ).toEqual({ ok: false, errors: { capacityPerDay: "capacity" } });
    },
  );

  it.each([
    ["0", undefined],
    ["-1", undefined],
    ["12.5", undefined],
    ["1e3", undefined],
    ["0149", undefined],
    [" 14900 ", 14900],
    ["1", 1],
    ["9007199254740991", 9_007_199_254_740_991],
    ["9007199254740992", undefined],
  ])("payout %j is %j minor units", (typed, expected) => {
    expect(payoutMinorUnits(typed)).toBe(expected);
  });

  it.each(["0", "-1", "12.5"])(
    "refuses a mapping whose payout is %j",
    (payout) => {
      expect(
        parseMapping(
          {
            product: `${PRODUCT}:stems_21`,
            canFulfil: "yes",
            payoutMinor: payout,
            currency: "PLN",
          },
          REFERENCE.currencies,
        ),
      ).toEqual({ ok: false, errors: { payoutMinor: "payout" } });
    },
  );

  it("refuses a mapping in a currency not in `currency`", () => {
    expect(
      parseMapping(
        {
          product: `${PRODUCT}:`,
          canFulfil: "yes",
          payoutMinor: "14900",
          currency: "ZZZ",
        },
        REFERENCE.currencies,
      ),
    ).toEqual({ ok: false, errors: { currency: "currency" } });
  });

  it("accepts a mapping: the base row is a null tier, the payout whole minor units", () => {
    expect(
      parseMapping(
        {
          product: `${PRODUCT}:`,
          canFulfil: "yes",
          payoutMinor: "14900",
          currency: "pln",
        },
        REFERENCE.currencies,
      ),
    ).toEqual({
      ok: true,
      value: {
        op: "save",
        productId: PRODUCT,
        tierKey: null,
        canFulfil: true,
        payoutMinor: 14900,
        currency: "PLN",
      },
    });
  });
});

describe("terms, zones, days off and codes", () => {
  it("records terms signed today and refuses a date after tomorrow anywhere", () => {
    expect(parseTerms({ signedOn: "2026-11-02", version: "v1" }, NOW)).toEqual({
      ok: true,
      value: { signedOn: "2026-11-02", version: "v1" },
    });
    expect(parseTerms({ signedOn: "2026-11-04", version: "v1" }, NOW)).toEqual({
      ok: false,
      errors: { signedOn: "dateFuture" },
    });
    expect(parseTerms({ signedOn: "2026-02-30", version: "v1" }, NOW)).toEqual({
      ok: false,
      errors: { signedOn: "date" },
    });
    expect(parseTerms({ signedOn: "2026-10-01", version: "v 1" }, NOW)).toEqual(
      {
        ok: false,
        errors: { version: "version" },
      },
    );
  });

  it("adds a zone by city or postcode zone, and refuses anything else", () => {
    const id = "0b5f8d3c-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
    expect(parseCoverage({ target: `zone:${id}`, capacityPerDay: "" })).toEqual(
      {
        ok: true,
        value: {
          op: "add",
          target: { kind: "zone", id },
          capacityPerDay: null,
        },
      },
    );
    expect(parseCoverage({ target: `street:${id}` })).toEqual({
      ok: false,
      errors: { target: "target" },
    });
    expect(
      parseCoverage({ target: `city:${id}`, capacityPerDay: "0" }),
    ).toEqual({
      ok: false,
      errors: { capacityPerDay: "capacity" },
    });
  });

  it("adds a day off from today, refuses a past day, and removes any day", () => {
    expect(parseBlackout({ date: "2026-11-02" }, NOW)).toEqual({
      ok: true,
      value: { op: "add", date: "2026-11-02", reason: null },
    });
    expect(parseBlackout({ date: "2026-10-30" }, NOW)).toEqual({
      ok: false,
      errors: { date: "datePast" },
    });
    expect(parseBlackout({ op: "remove", date: "2026-10-30" }, NOW)).toEqual({
      ok: true,
      value: { op: "remove", date: "2026-10-30" },
    });
  });

  it("makes a code from a Polish business name, and refuses a malformed one", () => {
    expect(codeStem("PL", "Kwiaciarnia pod Lipą")).toBe(
      "pl-kwiaciarnia-pod-lipa",
    );
    expect(codeStem("PL", "Łąka & Żurawie")).toBe("pl-laka-zurawie");
    expect(codeStem("DE", "Blumen Straße")).toBe("de-blumen-strasse");
    expect(codeStem("PL", "!!!")).toBe("pl-florist");
    expect(parsePartnerCode("PL-Waw-01")).toBe("pl-waw-01");
    expect(parsePartnerCode("pl--waw")).toBeUndefined();
    expect(parsePartnerCode("pl_waw")).toBeUndefined();
  });
});

describe("T-18 (pure) · the §2.5 status graph (AC-16)", () => {
  const STATUSES = ["demo", "onboarding", "active", "paused", "offboarded"];
  const ALLOWED = new Set([
    "onboarding>active",
    "onboarding>offboarded",
    "active>paused",
    "active>offboarded",
    "paused>active",
    "paused>offboarded",
    "demo>offboarded",
  ]);

  it("has exactly the seven edges of §2.5 and refuses the other eighteen", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(isPartnerStatusEdge(from, to), `${from} → ${to}`).toBe(
          ALLOWED.has(`${from}>${to}`),
        );
      }
    }
    expect(PARTNER_STATUS_EDGES.demo).toEqual(["offboarded"]);
  });

  it("refuses an unknown status on either side", () => {
    expect(isPartnerStatusEdge("onboarding", "live")).toBe(false);
    expect(isPartnerStatusEdge("draft", "active")).toBe(false);
  });

  const MET = {
    termsSignedAt: "2026-10-02",
    termsVersion: "v1",
    coverageRows: 1,
    fulfillableMappings: 1,
    notificationChannel: "email",
    contactEmail: "piotr@example.com",
    contactPhone: null,
  };

  it("passes the preflight when all four conditions hold", () => {
    expect(unmetConditions(activationPreflight(MET))).toEqual([]);
  });

  it.each([
    ["terms", { termsSignedAt: null, termsVersion: null }],
    ["coverage", { coverageRows: 0 }],
    ["mapping", { fulfillableMappings: 0 }],
    ["contact", { notificationChannel: "whatsapp", contactPhone: null }],
    ["contact", { contactEmail: "not-an-email" }],
  ] as const)("names %s as the one unmet condition", (condition, change) => {
    expect(unmetConditions(activationPreflight({ ...MET, ...change }))).toEqual(
      [condition],
    );
  });

  it("lists the conditions in the card's order", () => {
    expect(ACTIVATION_CONDITIONS).toEqual([
      "terms",
      "coverage",
      "mapping",
      "contact",
    ]);
  });
});

describe("T-20 (pure) · the application graph (AC-17)", () => {
  it("moves only new → contacted → converted | rejected", () => {
    const statuses = ["new", "contacted", "converted", "rejected"];
    const allowed = new Set([
      "new>contacted",
      "contacted>converted",
      "contacted>rejected",
    ]);
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isApplicationEdge(from, to), `${from} → ${to}`).toBe(
          allowed.has(`${from}>${to}`),
        );
      }
    }
    expect(isApplicationEdge("toString", "contacted")).toBe(false);
  });
});
