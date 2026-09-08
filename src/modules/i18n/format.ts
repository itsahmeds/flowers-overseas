/**
 * Locale-correct formatting (spec 003 §2 "Formatters", §5.2, §5.3, §8 "Price display", AC-15…
 * AC-17; `plan/03` §7; TASK-036).
 *
 * This file and `collate.ts` are the **only** places in `src/` allowed to construct an `Intl.*`
 * formatter or call a `toLocale*` method; `fo/no-adhoc-intl` (TASK-037) is what makes that true
 * rather than stated. Everything a page renders as a number, a price, a percentage, a date, a
 * time, a list or a date range comes from one of the functions below, so "exactly one way to
 * render a price" (§4) is a fact about the import graph.
 *
 * Three rules shape the implementation.
 *
 *  1. **No float ever holds money.** `formatMoney` takes integer minor units (`number` or
 *     `bigint`) plus the currency's `minorUnitExponent` and builds a **decimal string** by digit
 *     shifting, which it hands to `Intl.NumberFormat` (ES2023 string input). There is no
 *     division, no `Number()`, no `toFixed` and no `Math.pow` on the money path — asserted both
 *     by formatting 9007199254740993 minor units exactly and by a source scan in
 *     `tests/unit/i18n-format.test.ts`. The same digit-shifting builds the percentage from
 *     integer basis points.
 *  2. **The caller passes our `LocaleCode`, never a BCP 47 tag.** The tag is resolved through
 *     `getLocaleRegistry()`, so a database-backed locale set (spec 002/012) moves formatting with
 *     it and no caller changes (AC-5). An unknown code throws: locale codes reach this module
 *     from the routing gate (`isLaunchLocale`), never raw from a URL.
 *  3. **Zone-bound values require a zone.** `formatTimeInZone` *and* `formatDate` take a required
 *     IANA zone, because in a relay "local" is ambiguous (§5.2, `plan/03` §10): a delivery date
 *     is a calendar date in the *recipient's* zone, and rendering it in the server's zone is how
 *     a bouquet arrives a day late. There is deliberately no zone-less overload.
 *
 * Two documented choices, so the reviewer does not have to reverse-engineer them:
 *
 *  - `formatNumber` groups thousands **always**, which is `plan/03` §7's expected `1 234,50` for
 *    `pl` rather than CLDR's `minimumGroupingDigits: 2` answer (`1234,5`). `formatMoney` keeps
 *    CLDR's default grouping, so a rendered price is exactly what ICU says a price looks like in
 *    that locale (`pl` prices below 10 000 zł are ungrouped) and the `currencies` fixture stays
 *    plain `Intl.NumberFormat` output as `tests/fixtures/index.ts` promises. Prices are the only
 *    money; quantities and measurements are the only plain numbers, so the two never sit side by
 *    side in one string.
 *  - `formatTimeInZone` renders the zone label with `Intl`'s own generic zone name
 *    (`timeZoneName: "longGeneric"` → "Central European Time"). `Intl` exposes no exemplar-city
 *    label, so §2's illustrative "14:00 Warsaw time" needs a city noun that only corridor data
 *    plus catalogue copy can supply (spec 008/004); this module refuses to hand-concatenate one.
 */
import { z } from "zod";

import {
  CURRENCY_CODES,
  type CurrencyCode,
  currencyConfig,
} from "../../config/currencies.ts";

import { type LocaleCode, getLocaleRegistry } from "./registry.ts";

/* -------------------------------------------------------------------------- */
/* Boundary schemas                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Integer minor units. `bigint` is accepted alongside `number` because AC-15 requires
 * 9007199254740993 (2^53 + 1) minor units to format *exactly*, and that value is not
 * representable as a JS `number` — `9007199254740993 === 9007199254740992` is `true`. A `number`
 * is therefore restricted to a safe integer (zod 4's `.int()` already rejects anything above
 * `Number.MAX_SAFE_INTEGER`) and anything larger must arrive as a `bigint`, which is also what
 * Postgres `bigint` columns hand back through Drizzle. This widens spec §5.3's stated
 * `z.number().int()` to `number | bigint`; it rejects everything §5.3 rejects (a float, a
 * numeric string, `NaN`) and additionally refuses a `number` that has already lost precision.
 */
const MinorUnitsSchema = z.union([z.bigint(), z.number().int()]);

/**
 * ISO-4217 code, restricted to the configured currency set (`src/config/currencies.ts`). The
 * assertion re-attaches the literal union `CurrencyCode` to `CURRENCY_CODES`, which
 * `src/config/currencies.ts` widens to `readonly string[]` for its seed projection; both are
 * derived from the same tuple, and `tests/unit/i18n-format.test.ts` asserts the two agree.
 */
const CurrencyCodeSchema = z.enum(CURRENCY_CODES as readonly CurrencyCode[]);

/**
 * Money is an integer amount of minor units plus a currency — never a decimal, never a bare
 * number (`plan/12` §2, `fo/no-float-money`). Parsed on every `formatMoney` call, so a float
 * that slipped past `tsc` at an API boundary fails loudly at the last moment before display.
 */
export const MoneySchema = z
  .object({
    amountMinor: MinorUnitsSchema,
    currency: CurrencyCodeSchema,
  })
  .strict();

export interface Money {
  readonly amountMinor: number | bigint;
  readonly currency: CurrencyCode;
}

/** A valid IANA zone identifier, as accepted by ICU on this platform. */
const TimeZoneSchema = z.string().refine(isIanaTimeZone, {
  message: "must be an IANA time-zone identifier, e.g. `Europe/Warsaw`",
});

/** A `Date` that is not an Invalid Date (zod rejects `NaN` time values). */
const InstantSchema = z.date();

function isIanaTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Cached Intl instances                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Constructing an `Intl.*` formatter is the expensive part (locale data lookup), formatting is
 * cheap, and a product grid formats the same price shape a hundred times per render — so every
 * instance is memoised per (tag, options) key. The caches are module-level and unbounded by
 * design: the key space is the locale set times a handful of literal option objects.
 */
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

function cacheKey(tag: string, options: object): string {
  return `${tag}|${JSON.stringify(options)}`;
}

function numberFormat(
  tag: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = cacheKey(tag, options);
  const cached = numberFormats.get(key);
  if (cached !== undefined) return cached;
  const created = new Intl.NumberFormat(tag, options);
  numberFormats.set(key, created);
  return created;
}

function dateTimeFormat(
  tag: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = cacheKey(tag, options);
  const cached = dateTimeFormats.get(key);
  if (cached !== undefined) return cached;
  const created = new Intl.DateTimeFormat(tag, options);
  dateTimeFormats.set(key, created);
  return created;
}

function listFormat(
  tag: string,
  options: Intl.ListFormatOptions,
): Intl.ListFormat {
  const key = cacheKey(tag, options);
  const cached = listFormats.get(key);
  if (cached !== undefined) return cached;
  const created = new Intl.ListFormat(tag, options);
  listFormats.set(key, created);
  return created;
}

function relativeTimeFormat(
  tag: string,
  options: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  const key = cacheKey(tag, options);
  const cached = relativeTimeFormats.get(key);
  if (cached !== undefined) return cached;
  const created = new Intl.RelativeTimeFormat(tag, options);
  relativeTimeFormats.set(key, created);
  return created;
}

/**
 * Our locale code → the BCP 47 tag ICU is given. Read through the registry (rule 2 above), so
 * `en-gb` becomes `en-GB` in exactly one place and a hydrated registry can change a tag without
 * touching a formatter.
 */
function tagFor(locale: LocaleCode): string {
  const config = getLocaleRegistry().get(locale);
  if (config === undefined) {
    throw new Error(`unknown locale code: ${locale}`);
  }
  return config.bcp47;
}

/* -------------------------------------------------------------------------- */
/* The integer → decimal-string path                                           */
/* -------------------------------------------------------------------------- */

/**
 * Shift `minorUnits` right by `exponent` digits, as text. This is the whole of the minor→major
 * conversion in the codebase (§5.3 "behavioural contracts"): string slicing on the decimal
 * digits of an integer, so the result is exact for every integer `bigint` can hold and for every
 * exponent, including 0 (HUF renders no fraction part at all).
 */
function decimalString(
  minorUnits: number | bigint,
  exponent: number,
): Intl.StringNumericLiteral {
  const units = BigInt(minorUnits);
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString();
  const sign = negative ? "-" : "";
  if (exponent === 0) {
    return `${sign}${digits}` as Intl.StringNumericLiteral;
  }
  const padded = digits.padStart(exponent + 1, "0");
  const split = padded.length - exponent;
  const whole = padded.slice(0, split);
  const fraction = padded.slice(split);
  // The cast is the one place a built string meets `Intl`'s `${number}` template type; the
  // string is a decimal literal by construction (sign, digits, `.`, digits).
  return `${sign}${whole}.${fraction}` as Intl.StringNumericLiteral;
}

/* -------------------------------------------------------------------------- */
/* Public formatters                                                           */
/* -------------------------------------------------------------------------- */

export interface FormatMoneyOptions {
  /**
   * Render the ISO code instead of the symbol (`45,00 EUR`), for the `title`/`aria-label` that
   * `plan/03` §7 asks for "for clarity across currencies". `Intl` places the code per locale, so
   * no caller concatenates one.
   */
  readonly withIsoCode?: boolean;
  /** `always` for an explicit `+`, e.g. a refund line or an FX delta. Default: `auto`. */
  readonly signDisplay?: "auto" | "always" | "exceptZero" | "never";
}

/**
 * The only price renderer in the application. Integer minor units in, localised currency string
 * out; the price a buyer sees is the integer we charge, rendered (`CLAUDE.md`, §8).
 */
export function formatMoney(
  money: Money,
  locale: LocaleCode,
  opts: FormatMoneyOptions = {},
): string {
  const { amountMinor, currency } = MoneySchema.parse(money);
  const { minorUnitExponent } = currencyConfig(currency);
  return numberFormat(tagFor(locale), {
    style: "currency",
    currency,
    currencyDisplay: opts.withIsoCode === true ? "code" : "symbol",
    signDisplay: opts.signDisplay ?? "auto",
  }).format(decimalString(amountMinor, minorUnitExponent));
}

export interface FormatNumberOptions {
  /** Exact number of fraction digits (minimum and maximum both). Default: CLDR's choice. */
  readonly fractionDigits?: number;
  /** `auto` restores CLDR's `minimumGroupingDigits`; the default groups always (see header). */
  readonly grouping?: "always" | "auto";
}

/** Plain numbers: quantities, counts, distances, stem counts. Never money (`formatMoney`). */
export function formatNumber(
  value: number | bigint,
  locale: LocaleCode,
  opts: FormatNumberOptions = {},
): string {
  const fractionDigits = z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .parse(opts.fractionDigits);
  return numberFormat(tagFor(locale), {
    useGrouping: opts.grouping ?? "always",
    ...(fractionDigits === undefined
      ? {}
      : {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }),
  }).format(value);
}

/**
 * VAT and every other rate is carried as integer basis points (`plan/07` §2 wording, §8), so
 * 2000 → `20%` in `en-gb`, `20 %` in `de`. The bp integer is digit-shifted by four to the
 * decimal string `Intl` multiplies back by 100; up to two fraction digits survive (1950 →
 * `19,5 %`), which is every rate a basis-point integer can express that a buyer must read.
 */
export function formatPercentFromBasisPoints(
  basisPoints: number,
  locale: LocaleCode,
): string {
  const bp = z.number().int().parse(basisPoints);
  return numberFormat(tagFor(locale), {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(decimalString(bp, 4));
}

/**
 * `short` is the numeric form (`14/02/2027` / `14.02.2027`) for tables and metadata;
 * `deliveryDate` is `plan/03` §7's unambiguous weekday + month-name form (`Sat 13 Feb`,
 * `Sa., 13. Feb.`, `sob., 13 lut`) and is the one a buyer picks and a florist reads.
 */
export type DateStyle = "short" | "deliveryDate";

const DATE_STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
  deliveryDate: { weekday: "short", day: "numeric", month: "short" },
};

/**
 * Render a calendar date in a given IANA zone. The zone is required (rule 3): the same instant
 * is two different calendar dates either side of midnight, and the date that matters is the one
 * in the recipient's country.
 */
export function formatDate(
  date: Date,
  locale: LocaleCode,
  style: DateStyle,
  timeZone: string,
): string {
  const instant = InstantSchema.parse(date);
  const zone = TimeZoneSchema.parse(timeZone);
  return dateTimeFormat(tagFor(locale), {
    ...DATE_STYLE_OPTIONS[style],
    timeZone: zone,
  }).format(instant);
}

/** Which zone label `formatTimeInZone` appends; `longGeneric` is the default (see header). */
export type ZoneNameStyle = "long" | "short" | "longGeneric" | "shortGeneric";

export interface FormatTimeInZoneOptions {
  readonly zoneName?: ZoneNameStyle;
}

/**
 * A wall-clock time in an explicit zone, with the zone named — the cutoff wording of `plan/03`
 * §7/§10 ("shown in the recipient's local time with explicit zone"). There is no zone-less
 * overload, and the zone is validated, so a cutoff cannot be rendered in the server's zone by
 * omission (AC-17).
 */
export function formatTimeInZone(
  instant: Date,
  locale: LocaleCode,
  timeZone: string,
  opts: FormatTimeInZoneOptions = {},
): string {
  const at = InstantSchema.parse(instant);
  const zone = TimeZoneSchema.parse(timeZone);
  return dateTimeFormat(tagFor(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: opts.zoneName ?? "longGeneric",
  }).format(at);
}

/**
 * Thresholds for picking the unit `Intl.RelativeTimeFormat` is given, coarsest last. The month
 * and year lengths are the display approximations 30 and 365 days, not calendar lengths: this
 * function chooses a *word* for a rounded age ("2 hours ago", "last year"), and an average-length
 * year would render exactly twelve months ago as "11 months ago". Calendar-exact arithmetic —
 * occasion dates, cutoffs, DST — is spec 009 and does not go through here (§2 "No date is
 * computed here").
 */
const RELATIVE_UNITS: readonly {
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}[] = [
  { unit: "second", ms: 1000 },
  { unit: "minute", ms: 60_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "day", ms: 86_400_000 },
  { unit: "week", ms: 604_800_000 },
  { unit: "month", ms: 2_592_000_000 },
  { unit: "year", ms: 31_536_000_000 },
];

/**
 * `from` expressed relative to `to`: "2 hours ago" for an event two hours before the reference
 * instant, "in 3 days" for one after it. Used by the tracking page (`plan/03` §7) and by
 * anything that says how stale a status is. No date is *computed* here — occasion arithmetic,
 * cutoffs and DST are spec 009.
 */
export function formatRelativeTime(
  from: Date,
  to: Date,
  locale: LocaleCode,
): string {
  const start = InstantSchema.parse(from);
  const reference = InstantSchema.parse(to);
  const deltaMs = start.getTime() - reference.getTime();
  const magnitude = Math.abs(deltaMs);
  let chosen = RELATIVE_UNITS[0];
  for (const candidate of RELATIVE_UNITS) {
    if (magnitude >= candidate.ms) chosen = candidate;
  }
  if (chosen === undefined) throw new Error("no relative-time unit configured");
  const value = Math.trunc(deltaMs / chosen.ms);
  return relativeTimeFormat(tagFor(locale), { numeric: "auto" }).format(
    value,
    chosen.unit,
  );
}

/** `conjunction` = "a, b and c"; `disjunction` = "a, b or c" (`plan/03` §7 "Lists"). */
export type ListType = "conjunction" | "disjunction";

export function formatList(
  items: readonly string[],
  locale: LocaleCode,
  type: ListType = "conjunction",
): string {
  const values = z.array(z.string()).parse(items);
  return listFormat(tagFor(locale), { style: "long", type }).format(values);
}

/**
 * A date range in one locale-correct string (`14–18.02.2027` in `pl`, `14.–18.02.27` in `de`) —
 * delivery windows and occasion promo windows. `plan/03` §7 and spec §2 scope `formatRange` to
 * dates; a money range ("from 45,00 €") is copy with one embedded price, so it stays an ICU
 * message key over `formatMoney` rather than a second money renderer here.
 */
export function formatRange(
  start: Date,
  end: Date,
  locale: LocaleCode,
  style: DateStyle,
  timeZone: string,
): string {
  const from = InstantSchema.parse(start);
  const until = InstantSchema.parse(end);
  const zone = TimeZoneSchema.parse(timeZone);
  return dateTimeFormat(tagFor(locale), {
    ...DATE_STYLE_OPTIONS[style],
    timeZone: zone,
  }).formatRange(from, until);
}
