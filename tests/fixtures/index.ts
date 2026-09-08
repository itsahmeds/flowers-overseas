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
  readonly lines: readonly string[];
  readonly postalCode: string;
  readonly city: string;
  /** True when the address is expected to fail validation. */
  readonly invalid?: boolean;
}

/** A phone number in E.164 plus its national display form (spec 003/005). */
export interface PhoneFixture {
  readonly label: string;
  readonly country: string;
  /** E.164, e.g. `+48123456789`. */
  readonly e164: string;
  readonly national: string;
  readonly invalid?: boolean;
}

/** Filled by spec 002 (occasion calendar) and spec 003 (lead times per corridor). */
export const occasionDates: readonly OccasionDateFixture[] = [];

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
 * `locale` is the canonical BCP 47 tag; `src/config/locales.ts` maps our locale codes (`en-gb`)
 * onto it. Spec 002's AC-34 extends this array (more currencies, payment amounts) — it must not
 * redefine the shape (spec 003 §12).
 */
export const currencies: readonly CurrencyFixture[] = [
  {
    code: "EUR",
    amount_minor: 4500,
    locale: "en",
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
    locale: "en",
    formatted: "£45.00",
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
    locale: "en",
    formatted: "PLN 45.00",
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

/** Filled by spec 003 (address forms) and spec 005 (order validation). */
export const addresses: readonly AddressFixture[] = [];

/** Filled by spec 003 (phone input) and spec 005 (order validation). */
export const phones: readonly PhoneFixture[] = [];
