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

/** Filled by spec 003 (`Intl` formatting) and spec 005 (payments). */
export const currencies: readonly CurrencyFixture[] = [];

/** Filled by spec 003 (address forms) and spec 005 (order validation). */
export const addresses: readonly AddressFixture[] = [];

/** Filled by spec 003 (phone input) and spec 005 (order validation). */
export const phones: readonly PhoneFixture[] = [];
