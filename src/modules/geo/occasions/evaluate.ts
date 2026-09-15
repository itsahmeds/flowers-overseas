/**
 * `occasionDate(rule, year)` — the pure occasion-date evaluator for the six `plan/03` §9 rule
 * types (spec 007 §2 "Occasion dates", AC-21, T-22; TASK-089).
 *
 * `plan/12` §4 names `modules/geo/occasions` as one of the four modules where a bug costs money
 * or rankings: a wrong Mother's Day is a corridor page that tells a buyer to order for the wrong
 * week, an occasion campaign that opens after the occasion, and a calendar Google indexes as
 * false. Hence the 100 %-branch threshold on this directory in `vitest.coverage.json`, and hence
 * the four properties below.
 *
 *  - **Nothing but arithmetic.** No database, no clock, no `Intl`, no locale, no timezone. The
 *    function takes a rule and a year and returns a calendar date, so it gives the same answer in
 *    a build on Vercel, in a test in Warsaw and in spec 009's date picker.
 *  - **Calendar dates are `YYYY-MM-DD` strings, never `Date` objects** (`tests/fixtures/README.md`
 *    "Deterministic", `src/modules/catalog/types.ts`'s `IsoDate`). An occasion is a day in the
 *    recipient's country, not an instant; a `Date` would carry a time, and a `Date` built from
 *    local-time parts would move the day for half the world. Every intermediate here is built
 *    with `Date.UTC` and read back with `getUTC*`, which is the only arithmetic that cannot.
 *  - **A rule that has no date returns `null`, never a guess** (AC-21: "a `rule_type: none`
 *    occasion is never given a date"; spec 007 §2: it is listed in the "also observed here" line
 *    instead). The two `none` rows in `seed/data/occasion-country.json` — PL `name_day`, which is
 *    per name, and RO `easter`, which follows the Orthodox calendar — are exactly the rows a
 *    guessed date would ruin.
 *  - **The seventh rule type is a compile error, not a silent wrong answer.** `plan/13` B15 adds
 *    an Orthodox-Easter-offset rule as a spec 009 amendment to `OccasionRuleSchema`. The `switch`
 *    below is exhaustive over that union and its `default` narrows `rule` to `never`, so the day
 *    the seventh member lands, `pnpm typecheck` fails here until it is handled. That is the seam
 *    spec 009 inherits; implementing the rule is **not** this spec's (spec 007 §13 Q7).
 *
 * The rule *shape* is not redefined here: `OccasionRule` is spec 006's `OccasionRuleSchema`
 * (`seed/schema/catalogue.ts`), imported as a type so no zod reaches the render path. `./schema.ts`
 * re-exports the parser for callers that need one at a boundary.
 */
import type { OccasionRule } from "../../../../seed/schema/catalogue.ts";

/**
 * A calendar day, `YYYY-MM-DD` — the `date` columns of spec 002 §5.1, not a timestamp. Declared
 * here rather than imported from `src/modules/catalog/types.ts` because `plan/01` §5 forbids a
 * module from reaching into another module's internals, and a date vocabulary is not a reason for
 * `geo` to depend on `catalog`. Same string shape, same rule, asserted in the unit test.
 */
export type IsoDate = string;

/** The six `plan/03` §9 rule kinds, as the discriminant of spec 006's `OccasionRuleSchema`. */
export type OccasionRuleKind = OccasionRule["kind"];

const MS_PER_DAY = 86_400_000;

/**
 * The Gregorian calendar begins in October 1582, so a Gregorian Easter before 1583 is undefined;
 * the Meeus algorithm's century terms drift past 4099. Outside the range the evaluator throws
 * rather than returning a date nobody can check. The guard also keeps `Date.UTC` honest: it maps
 * years 0–99 onto 1900–1999, so `occasionDate(rule, 26)` would silently mean 1926.
 */
export const MIN_YEAR = 1583;
export const MAX_YEAR = 4099;

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(
      `occasion year must be an integer in ${MIN_YEAR}…${MAX_YEAR}, received ${String(year)}`,
    );
  }
}

/** `YYYY-MM-DD` for a UTC millisecond instant. */
function isoDateOf(utcMs: number): IsoDate {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** ISO-8601 weekday of a UTC instant: Monday = 1 … Sunday = 7, as `WeekdaySchema` numbers them. */
function isoWeekday(utcMs: number): number {
  const day = new Date(utcMs).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Gregorian Easter Sunday, by the anonymous (Meeus/Jones/Butcher) algorithm.
 *
 * Exported because four of the six rule types depend on it — `easter_offset` directly,
 * `lent_sunday` by counting back from it — and because a consumer that needs the movable feasts
 * must get them from the same arithmetic the calendar was built from. Verified against an
 * independently tabled 2026–2030 source in `tests/unit/geo-occasions.test.ts` (5 Apr 2026,
 * 28 Mar 2027, 16 Apr 2028, 1 Apr 2029, 21 Apr 2030), not against itself.
 */
export function easterSunday(year: number): IsoDate {
  assertYear(year);
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDateOf(Date.UTC(year, month - 1, day));
}

/** Easter Sunday as a UTC instant, for the two rules that do arithmetic around it. */
function easterMs(year: number): number {
  return Date.parse(`${easterSunday(year)}T00:00:00.000Z`);
}

/**
 * `fixed(MM-DD)`. Returns `null` when the day does not exist in that year — only 29 February in a
 * common year, which is why the check is a date round-trip rather than a leap-year rule.
 */
function fixedDate(year: number, month: number, day: number): IsoDate | null {
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return isoDateOf(ms);
}

/**
 * `nth_weekday(month, weekday, n)` — e.g. DE Muttertag, the 2nd Sunday of May. Returns `null` when
 * the month has fewer than `n` of that weekday (a 5th Sunday exists in some months and not
 * others), because "the 5th Sunday of a 4-Sunday month" is not a date.
 */
function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
): IsoDate | null {
  const firstMs = Date.UTC(year, month - 1, 1);
  const offset = (weekday - isoWeekday(firstMs) + 7) % 7;
  const ms = firstMs + (offset + (n - 1) * 7) * MS_PER_DAY;
  if (new Date(ms).getUTCMonth() !== month - 1) return null;
  return isoDateOf(ms);
}

/** `last_weekday(month, weekday)` — e.g. FR Fête des Mères, the last Sunday of May. Always exists. */
function lastWeekday(year: number, month: number, weekday: number): IsoDate {
  // Day 0 of the following month is the last day of this one, in every month and every year.
  const lastMs = Date.UTC(year, month, 0);
  const back = (isoWeekday(lastMs) - weekday + 7) % 7;
  return isoDateOf(lastMs - back * MS_PER_DAY);
}

/**
 * `lent_sunday(n)` — the nth Sunday of Lent, counting the six that fall between Ash Wednesday and
 * Easter. The sixth is Palm Sunday, Easter − 7 days, so the nth is Easter − 7 × (7 − n) days. UK
 * Mothering Sunday is the fourth: Easter − 21 days, i.e. three weeks before Easter Sunday.
 */
function lentSunday(year: number, n: number): IsoDate {
  return isoDateOf(easterMs(year) - 7 * (7 - n) * MS_PER_DAY);
}

/**
 * The typed seam of `plan/13` B15 (spec 007 §13 Q7). `default:` narrows `rule` to `never`; adding
 * a seventh member to `OccasionRuleSchema` makes this call a compile error until the new kind has
 * a branch above. The runtime throw is for data that never went through the schema.
 */
export function assertUnsupportedRule(rule: never): never {
  throw new TypeError(
    `unsupported occasion rule: ${JSON.stringify(rule)} (plan/13 B15: a new rule type needs a branch in occasionDate)`,
  );
}

/**
 * The date an occasion falls on in a given year, or `null` when the rule expresses no date.
 *
 * @throws RangeError when `year` is not an integer in `MIN_YEAR`…`MAX_YEAR`.
 */
export function occasionDate(rule: OccasionRule, year: number): IsoDate | null {
  assertYear(year);
  switch (rule.kind) {
    case "fixed":
      return fixedDate(year, rule.month, rule.day);
    case "nth_weekday":
      return nthWeekday(year, rule.month, rule.weekday, rule.n);
    case "last_weekday":
      return lastWeekday(year, rule.month, rule.weekday);
    case "easter_offset":
      return isoDateOf(easterMs(year) + rule.days * MS_PER_DAY);
    case "lent_sunday":
      return lentSunday(year, rule.n);
    case "none":
      return null;
    default:
      return assertUnsupportedRule(rule);
  }
}
