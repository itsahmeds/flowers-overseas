/**
 * Shared test-fixture barrel (spec 001 §2 "Testing harness", TASK-008).
 *
 * spec 001 reserves four names so every later spec fills the same ones instead of inventing a
 * local copy: occasion dates (002/003), currencies (003/005), addresses and phones (003/005).
 * They are typed and empty in 001 — the types are the contract, the data arrives with the spec
 * that owns it. `tests/fixtures/README.md` says what lives where.
 *
 * Money is minor units only (`amount_minor` + ISO 4217 code): plan/12 §2 "Money" and
 * `fo/no-float-money`. No `Date` objects: an occasion date is a calendar date in a delivery
 * country's timezone, so it is stored and compared as an ISO `YYYY-MM-DD` string.
 */

/** A named calendar date used by occasion/lead-time tests (spec 002/003). */
export interface OccasionDateFixture {
  /** Occasion slug as used in catalog URLs, e.g. `mothers-day`. */
  readonly occasion: string;
  /** ISO 3166-1 alpha-2 country the date applies to; occasions move between countries. */
  readonly country: string;
  /** ISO 8601 calendar date, `YYYY-MM-DD`, no time and no zone. */
  readonly date: string;
}

/** A currency and one representative amount, in minor units (never a float). */
export interface CurrencyFixture {
  /** ISO 4217 code, e.g. `EUR`. */
  readonly code: string;
  /** Amount in minor units, e.g. `4990` for EUR 49.90. */
  readonly amount_minor: number;
  /** BCP 47 locale the expected formatting below belongs to. */
  readonly locale: string;
  /** Expected `Intl.NumberFormat` output for the pair above. */
  readonly formatted: string;
}

/** A postal address in one country's format (spec 003 field order, spec 005 validation). */
export interface AddressFixture {
  readonly label: string;
  /** ISO 3166-1 alpha-2 country code. */
  readonly country: string;
  /**
   * The block `formatAddressBlock(fields, country)` must return, line by line (spec 003 AC-19).
   * Empty for an `invalid` fixture: a rejected postcode never reaches rendering.
   */
  readonly lines: readonly string[];
  /** The postcode in its canonical form, or the offending value when `invalid`. */
  readonly postalCode: string;
  readonly city: string;
  /** True when the address is expected to fail validation. */
  readonly invalid?: boolean;
  /**
   * Field values keyed by `AddressField` (`src/config/address-formats.ts`), i.e. the input
   * `formatAddressBlock` and spec 010's form receive. Added by spec 003 (TASK-037); spec 002/005
   * extend the array, never the shape (spec 003 §12).
   */
  readonly fields?: Readonly<Record<string, string>>;
  /** A user-typed postcode that `normalisePostcode` must turn into `postalCode`. */
  readonly rawPostalCode?: string;
  /** Why an `invalid` fixture is rejected: `normalisePostcode`'s `reason`. */
  readonly reason?: string;
}

/**
 * A phone number in E.164 plus its national display form (spec 003/005).
 *
 * **Data only.** Spec 003 ships no phone validation: E.164 parsing and the "this does not look
 * like a Polish number" warning are spec 010 (§3 non-goals, `plan/03` §8), and no phone library
 * is a dependency yet. The `invalid` rows are here so that spec 010 has its rejection cases the
 * day it starts, and so the fixture cannot be quietly reshaped later.
 */
export interface PhoneFixture {
  readonly label: string;
  readonly country: string;
  /** E.164, e.g. `+48123456789`. */
  readonly e164: string;
  readonly national: string;
  readonly invalid?: boolean;
  /** Why an `invalid` row is invalid, for spec 010's message mapping. */
  readonly reason?: string;
}

/**
 * The occasion-date corpus (spec 007 AC-21 / T-22, TASK-089), re-exported from `occasions.ts` for
 * the same reason `catalogue.ts` is re-exported here: the barrel is the one import a suite needs,
 * and no spec may invent a second copy of a shared input. `occasions.ts` carries the full table —
 * rule, label, provenance and the `null` years of the two undated rows — while this flat view is
 * the `{occasion, country, date}` shape spec 001 reserved. Spec 003's lead-time rows extend the
 * array; they must not redefine the shape.
 */
export {
  EASTER_SUNDAYS,
  OCCASION_FIXTURE_YEARS,
  type OccasionFixtureYear,
  type OccasionRuleFixture,
  occasionDates,
  occasionRuleFixtures,
} from "./occasions.ts";

/**
 * The money-formatting matrix (spec 003 AC-15 / T-15, TASK-036). Every `formatted` value is the
 * output of `Intl.NumberFormat(locale, { style: "currency", currency })` on the decimal string
 * `formatMoney` builds from `amount_minor` and the currency's `minorUnitExponent` — i.e. exactly
 * what the module renders, with CLDR's own grouping (`pl` leaves `1234,50 zł` ungrouped; that is
 * the Polish convention, not a bug).
 *
 * Coverage, deliberately shaped rather than exhaustive: the full EUR/GBP/PLN × en/en-gb/de/pl
 * currency-locale cross product at 45.00 (symbol *and* symbol position per locale, including the
 * foreign-currency cases where ICU falls back to the ISO code), the amount ladder
 * {0, 50, 4500, 123450, 100000000} for each currency in its own locale (zero, sub-unit, plain,
 * thousands, millions), and HUF as the zero-exponent currency, where the same integer means a
 * different number. Spaces are as ICU emits them (`pl` groups with U+00A0, `de` separates the
 * `€` with U+00A0); tests normalise them, they are not typed by hand.
 *
 * `locale` is the canonical BCP 47 tag the formatter is *given* — a locale's `formattingTag` in
 * `src/config/locales.ts`, which is why the `en` rows read `en-150`: `/en` is pan-European
 * English and formats with European conventions, so ICU renders a foreign currency as
 * `45.00 £` / `45.00 PLN` rather than US English's `£45.00` / `PLN 45.00` (TASK-044,
 * `docs/decisions-log.md` 2026-09-08). The document language of `/en` is still `en`; no row here
 * describes a `<html lang>`. Spec 002's AC-34 extends this array (more currencies, payment
 * amounts) — it must not redefine the shape (spec 003 §12).
 */
export const currencies: readonly CurrencyFixture[] = [
  {
    code: "EUR",
    amount_minor: 4500,
    locale: "en-150",
    formatted: "€45.00",
  },
  {
    code: "EUR",
    amount_minor: 4500,
    locale: "en-GB",
    formatted: "€45.00",
  },
  {
    code: "EUR",
    amount_minor: 0,
    locale: "de",
    formatted: "0,00 €",
  },
  {
    code: "EUR",
    amount_minor: 50,
    locale: "de",
    formatted: "0,50 €",
  },
  {
    code: "EUR",
    amount_minor: 4500,
    locale: "de",
    formatted: "45,00 €",
  },
  {
    code: "EUR",
    amount_minor: 123450,
    locale: "de",
    formatted: "1.234,50 €",
  },
  {
    code: "EUR",
    amount_minor: 100000000,
    locale: "de",
    formatted: "1.000.000,00 €",
  },
  {
    code: "EUR",
    amount_minor: 4500,
    locale: "pl",
    formatted: "45,00 €",
  },
  {
    code: "GBP",
    amount_minor: 4500,
    locale: "en-150",
    formatted: "45.00 £",
  },
  {
    code: "GBP",
    amount_minor: 0,
    locale: "en-GB",
    formatted: "£0.00",
  },
  {
    code: "GBP",
    amount_minor: 50,
    locale: "en-GB",
    formatted: "£0.50",
  },
  {
    code: "GBP",
    amount_minor: 4500,
    locale: "en-GB",
    formatted: "£45.00",
  },
  {
    code: "GBP",
    amount_minor: 123450,
    locale: "en-GB",
    formatted: "£1,234.50",
  },
  {
    code: "GBP",
    amount_minor: 100000000,
    locale: "en-GB",
    formatted: "£1,000,000.00",
  },
  {
    code: "GBP",
    amount_minor: 4500,
    locale: "de",
    formatted: "45,00 £",
  },
  {
    code: "GBP",
    amount_minor: 4500,
    locale: "pl",
    formatted: "45,00 GBP",
  },
  {
    code: "PLN",
    amount_minor: 4500,
    locale: "en-150",
    formatted: "45.00 PLN",
  },
  {
    code: "PLN",
    amount_minor: 4500,
    locale: "en-GB",
    formatted: "PLN 45.00",
  },
  {
    code: "PLN",
    amount_minor: 4500,
    locale: "de",
    formatted: "45,00 PLN",
  },
  {
    code: "PLN",
    amount_minor: 0,
    locale: "pl",
    formatted: "0,00 zł",
  },
  {
    code: "PLN",
    amount_minor: 50,
    locale: "pl",
    formatted: "0,50 zł",
  },
  {
    code: "PLN",
    amount_minor: 4500,
    locale: "pl",
    formatted: "45,00 zł",
  },
  {
    code: "PLN",
    amount_minor: 123450,
    locale: "pl",
    formatted: "1234,50 zł",
  },
  {
    code: "PLN",
    amount_minor: 100000000,
    locale: "pl",
    formatted: "1 000 000,00 zł",
  },
  {
    code: "HUF",
    amount_minor: 123450,
    locale: "pl",
    formatted: "123 450 HUF",
  },
  {
    code: "HUF",
    amount_minor: 123450,
    locale: "de",
    formatted: "123.450 HUF",
  },
  {
    code: "HUF",
    amount_minor: 123450,
    locale: "en-GB",
    formatted: "HUF 123,450",
  },
];

/**
 * The address matrix (spec 003 AC-19 / T-19, TASK-037), one country per `plan/03` §8 row plus a
 * generic-fallback destination and the postcode rejections.
 *
 * `fields` is the input; `lines` is what `formatAddressBlock` must return. The two together are
 * the whole of AC-19: the field *order* per country (PL folds number and apartment into the
 * street line and puts the postcode before the city; DE/AT put the house number after the street
 * and allow a c/o line; GB puts the postcode after the town), the skipping of empty optional
 * fields, and the presence of the recipient phone in every single block (`plan/03` §8: florists
 * call ahead, so the phone is required in every format).
 *
 * `rawPostalCode` is what a buyer types and `postalCode` what `normalisePostcode` must return.
 * The `invalid: true` rows are postcodes no normaliser can rescue; `reason` is the code
 * `normalisePostcode` returns, which spec 010 maps to a message key.
 *
 * Synthetic data only (`tests/fixtures/README.md`): invented names, real street and postcode
 * *shapes*, no personal data.
 */
export const addresses: readonly AddressFixture[] = [
  {
    label: "PL — street line carries number and apartment",
    country: "PL",
    fields: {
      fullName: "Anna Kowalska",
      street: "ul. Marszałkowska 10/5",
      postcode: "00-001",
      city: "Warszawa",
      phone: "+48 22 123 45 67",
    },
    lines: [
      "Anna Kowalska",
      "ul. Marszałkowska 10/5",
      "00-001 Warszawa",
      "+48 22 123 45 67",
    ],
    postalCode: "00-001",
    rawPostalCode: "00001",
    city: "Warszawa",
  },
  {
    label: "PL — al. prefix, postcode typed with the hyphen already",
    country: "PL",
    fields: {
      fullName: "Piotr Nowak",
      street: "al. Jerozolimskie 123/45",
      postcode: "30-002",
      city: "Kraków",
      phone: "+48 512 345 678",
    },
    lines: [
      "Piotr Nowak",
      "al. Jerozolimskie 123/45",
      "30-002 Kraków",
      "+48 512 345 678",
    ],
    postalCode: "30-002",
    rawPostalCode: "30-002",
    city: "Kraków",
  },
  {
    label: "PL — five digits are needed for a postcode",
    country: "PL",
    postalCode: "00-0011",
    city: "Warszawa",
    lines: [],
    invalid: true,
    reason: "format",
  },
  {
    label: "DE — house number after the street, c/o line present",
    country: "DE",
    fields: {
      fullName: "Lena Schmidt",
      street: "Kastanienallee",
      houseNumber: "12",
      careOf: "c/o Müller",
      postcode: "10115",
      city: "Berlin",
      phone: "+49 30 123456",
    },
    lines: [
      "Lena Schmidt",
      "Kastanienallee 12",
      "c/o Müller",
      "10115 Berlin",
      "+49 30 123456",
    ],
    postalCode: "10115",
    rawPostalCode: "10115",
    city: "Berlin",
  },
  {
    label: "DE — no c/o line: the optional field is skipped, not blank",
    country: "DE",
    fields: {
      fullName: "Jonas Weber",
      street: "Bahnhofstraße",
      houseNumber: "7a",
      postcode: "80331",
      city: "München",
      phone: "+49 89 987654",
    },
    lines: [
      "Jonas Weber",
      "Bahnhofstraße 7a",
      "80331 München",
      "+49 89 987654",
    ],
    postalCode: "80331",
    rawPostalCode: "D-80331",
    city: "München",
  },
  {
    label: "DE — four digits is an Austrian postcode, not a German one",
    country: "DE",
    postalCode: "1011",
    city: "Berlin",
    lines: [],
    invalid: true,
    reason: "format",
  },
  {
    label: "AT — same order as DE, four-digit postcode",
    country: "AT",
    fields: {
      fullName: "Johanna Gruber",
      street: "Mariahilfer Straße",
      houseNumber: "45",
      postcode: "1010",
      city: "Wien",
      phone: "+43 1 1234567",
    },
    lines: [
      "Johanna Gruber",
      "Mariahilfer Straße 45",
      "1010 Wien",
      "+43 1 1234567",
    ],
    postalCode: "1010",
    rawPostalCode: "A-1010",
    city: "Wien",
  },
  {
    label: "AT — five digits is a German postcode, not an Austrian one",
    country: "AT",
    postalCode: "10115",
    city: "Wien",
    lines: [],
    invalid: true,
    reason: "format",
  },
  {
    label: "GB — postcode after the town, line 2 and county present",
    country: "GB",
    fields: {
      fullName: "Oliver Clarke",
      addressLine1: "10 Downing Street",
      addressLine2: "Flat 2",
      city: "London",
      region: "Greater London",
      postcode: "SW1A 1AA",
      phone: "+44 20 7925 0918",
    },
    lines: [
      "Oliver Clarke",
      "10 Downing Street",
      "Flat 2",
      "London",
      "Greater London",
      "SW1A 1AA",
      "+44 20 7925 0918",
    ],
    postalCode: "SW1A 1AA",
    rawPostalCode: "sw1a1aa",
    city: "London",
  },
  {
    label: "GB — no line 2 and no county: both skipped",
    country: "GB",
    fields: {
      fullName: "Priya Raman",
      addressLine1: "221B Baker Street",
      city: "London",
      postcode: "NW1 6XE",
      phone: "+44 20 7224 3688",
    },
    lines: [
      "Priya Raman",
      "221B Baker Street",
      "London",
      "NW1 6XE",
      "+44 20 7224 3688",
    ],
    postalCode: "NW1 6XE",
    rawPostalCode: " nw1  6xe ",
    city: "London",
  },
  {
    label: "GB — an inward code is a digit and two letters",
    country: "GB",
    postalCode: "SW1A1A",
    city: "London",
    lines: [],
    invalid: true,
    reason: "format",
  },
  {
    label:
      "SI — a destination with no authored format uses the generic fallback",
    country: "SI",
    fields: {
      fullName: "Maja Novak",
      addressLine1: "Slovenska cesta 1",
      postcode: "1000",
      city: "Ljubljana",
      phone: "+386 1 234 5678",
    },
    lines: [
      "Maja Novak",
      "Slovenska cesta 1",
      "1000 Ljubljana",
      "+386 1 234 5678",
    ],
    postalCode: "1000",
    rawPostalCode: "1000",
    city: "Ljubljana",
  },
  {
    label: "SI — the generic postcode shape still rejects punctuation",
    country: "SI",
    postalCode: "!!",
    city: "Ljubljana",
    lines: [],
    invalid: true,
    reason: "format",
  },
];

/**
 * Recipient phone numbers (spec 003 §7, `plan/03` §8; TASK-037). **Data only** — see
 * `PhoneFixture`: spec 003 validates nothing, spec 010 does.
 *
 * One landline and one mobile for PL, DE and GB (the launch corridors), one AT number, and three
 * rejections spec 010 will need: too short for its numbering plan, no country code at all, and
 * letters where digits belong.
 */
export const phones: readonly PhoneFixture[] = [
  {
    label: "PL landline (Warsaw)",
    country: "PL",
    e164: "+48221234567",
    national: "22 123 45 67",
  },
  {
    label: "PL mobile",
    country: "PL",
    e164: "+48512345678",
    national: "512 345 678",
  },
  {
    label: "DE landline (Berlin)",
    country: "DE",
    e164: "+493012345678",
    national: "030 12345678",
  },
  {
    label: "DE mobile",
    country: "DE",
    e164: "+4915112345678",
    national: "0151 12345678",
  },
  {
    label: "AT landline (Vienna)",
    country: "AT",
    e164: "+4311234567",
    national: "01 1234567",
  },
  {
    label: "GB landline (London)",
    country: "GB",
    e164: "+442079250918",
    national: "020 7925 0918",
  },
  {
    label: "GB mobile",
    country: "GB",
    e164: "+447911123456",
    national: "07911 123456",
  },
  {
    label: "PL — too short for the Polish numbering plan",
    country: "PL",
    e164: "+4812",
    national: "12",
    invalid: true,
    reason: "too-short",
  },
  {
    label: "PL — national form with no country code",
    country: "PL",
    e164: "221234567",
    national: "22 123 45 67",
    invalid: true,
    reason: "no-country-code",
  },
  {
    label: "GB — letters where digits belong",
    country: "GB",
    e164: "+44FLOWERS1",
    national: "0FLOWERS1",
    invalid: true,
    reason: "not-a-number",
  },
];

/* -------------------------------------------------------------------------- */
/* Catalogue and pricing (spec 005 §2 "Tests and fixtures", AC-26; TASK-069).  */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue corpus, re-exported so the barrel is the one import a suite needs (AC-26).
 *
 * It lives in `catalogue.ts` rather than inline because it is large and because its arithmetic is
 * documented longhand in that file's header; the names are re-exported here for the same reason
 * `currencies` and `addresses` are here — spec 001 §2's rule that no spec invents a second copy
 * of a shared input. Consumers: `catalog-pricing-fx.test.ts` today, 008/009/010/013/018 from
 * Phase 1.
 */
export type {
  BasketLineFixture,
  FxConversionFixture,
  MixedVatBasketFixture,
  PriceBandFixture,
  VatSplitFixture,
} from "./catalogue.ts";
export {
  FX_RATE_PPM_EUR_GBP,
  FX_RATE_PPM_EUR_PLN,
  FX_RATE_PPM_PLN_EUR,
  FX_RATE_PPM_PLN_GBP,
  fxConversions,
  mixedVatBaskets,
  priceBands,
} from "./catalogue.ts";
