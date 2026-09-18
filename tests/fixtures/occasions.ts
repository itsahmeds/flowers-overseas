/**
 * The occasion-date fixture: hand-verified calendar dates 2026–2030 for every launch destination
 * (spec 007 AC-21 / T-22, `plan/03` §9, `plan/13` D6; TASK-089).
 *
 * **This table is the assertion, not an output.** Every date below was computed from the rule by
 * an independent implementation (a throwaway Python script using `calendar`/`datetime` and the
 * Meeus algorithm, outside this repository) and checked against the Easter dates the test tables
 * from a trusted source — 5 Apr 2026, 28 Mar 2027, 16 Apr 2028, 1 Apr 2029, 21 Apr 2030. Nothing
 * here was produced by `occasionDate`, which is the only way the fixture can catch it being wrong.
 *
 * Coverage: 65 rows × 5 years = 325 dates. 59 rows are every **observed** row of
 * `seed/data/occasion-country.json` (the seven destinations of `src/config/countries.ts`),
 * including the one observed-but-undated one — PL `name_day`, `plan/13` B15 — whose expected date
 * is `null` in every year, which is AC-21's "a `rule_type: none` occasion is never given a date".
 * Six rows (`inSeed: false`) are reference dates: the `plan/03` §9 / `plan/13` D6 rows for
 * countries we buy *from* rather than deliver to (GB Mothering Sunday, NO Morsdag, SE Mors dag),
 * because the rule types must all be covered and the committed seed has no `lent_sunday` row; and
 * the three Romanian observances that depend on Orthodox Easter (§ below).
 *
 * ---
 *
 * **Romanian Orthodox Easter, `plan/13` B15 / spec 009 AC-12 (TASK-122).** The RO `easter` row was
 * carried as `rule_type: "none"` until spec 009 added the seventh rule type; it now reads
 * `orthodox_easter_offset(0)` and carries the dates below. They were **verified before commit**,
 * the `plan/13` D6 pattern ("a date we have not checked is not a fixture"), against:
 *
 *  1. the **official calendar of the Romanian Patriarchate**, `https://calendar.patriarhia.ro/`
 *     (retrieved 2026-09-18), which publishes the current year only and gives, for 2026,
 *     `20260405` "(†) Intrarea Domnului în Ierusalim … (a Floriilor)", `20260412` "(†) Învierea
 *     Domnului nostru Iisus Hristos (Sfintele Paşti)", `20260521` "(†) Înălţarea Domnului" and
 *     `20260531` "(†) Pogorârea Sfântului Duh (Cincizecimea sau Rusaliile)" — i.e. Pascha − 7,
 *     Pascha, Pascha + 39 and Pascha + 49, which is what the three reference rows below assert;
 *  2. for 2027–2030, where the Patriarchate publishes no calendar yet, two independent tables of
 *     the Julian computus expressed in the Gregorian calendar — Wikipedia "List of dates for
 *     Easter" and "Easter" (§ Table of dates of Easter, Julian Easter column), which agree on
 *     12 Apr 2026, 2 May 2027, 16 Apr 2028, 8 Apr 2029, 28 Apr 2030 — cross-checked against
 *     "Public holidays in Romania" (12 Apr 2026, 2 May 2027, 16 Apr 2028) and against the Meeus
 *     Julian algorithm worked by hand (Julian 30 Mar 2026, 19 Apr 2027, 3 Apr 2028, 26 Mar 2029,
 *     15 Apr 2030, each + 13 days for the 1900–2099 Julian-to-Gregorian offset).
 *
 * 2028 is the year the two Easters coincide (16 April in both calendars), which is why the table
 * keeps both anchors: a fixture that only ever differed would not catch an evaluator that had
 * silently fallen back to the Gregorian computus.
 *
 * ---
 *
 * **Correction to `plan/13` D6 and spec 007 AC-21 (escalated, `docs/tasks/TASK-089.md`).** Both
 * give "Mothering Sunday 2027 = 14 Mar". It is **7 March 2027**. Mothering Sunday is the fourth
 * Sunday of Lent, Easter − 21 days; Easter 2027 is 28 March. D6's own instruction is "verify
 * against official calendars in fixtures", and the other three D6 dates verify exactly
 * (DE Muttertag 2027 = 9 May, NO Morsdag 2027 = 14 Feb, SE Mors dag 2027 = 30 May), as do the
 * 2026, 2028 and 2029 Mothering Sundays quoted in TASK-089 (15 Mar, 26 Mar, 11 Mar = Easter − 21
 * in each case). The 2027 and 2030 entries of that list are the only two that are not Easter − 21,
 * and they are the two that are wrong. The fixture carries the verified dates; the spec sentence
 * and the D6 row need the founder's amendment.
 *
 * ---
 *
 * Rules of the house (`tests/fixtures/README.md`): ISO `YYYY-MM-DD` strings, never `Date`
 * objects, so no row can drift with the runner's timezone.
 */
import type { OccasionRule } from "../../seed/schema/catalogue.ts";

import type { OccasionDateFixture } from "./index.ts";

/** The years the table covers, in order. `plan/03` §9's fixture range. */
export const OCCASION_FIXTURE_YEARS = [2026, 2027, 2028, 2029, 2030] as const;
export type OccasionFixtureYear = (typeof OCCASION_FIXTURE_YEARS)[number];

/** One (destination, occasion) rule and the date it falls on in each fixture year. */
export interface OccasionRuleFixture {
  /** ISO 3166-1 alpha-2 of the destination the rule belongs to. */
  readonly country: string;
  /** `occasion.key` as `seed/data/occasion-country.json` writes it, e.g. `mothers_day`. */
  readonly occasion: string;
  /** The occasion's local name, so a failure names something a human recognises. */
  readonly label: string;
  /** The rule verbatim from the seed row (or, for a reference row, from `plan/03` §9). */
  readonly rule: OccasionRule;
  /** Expected `occasionDate(rule, year)` per year: an ISO date, or `null` for an undated rule. */
  readonly dates: Readonly<Record<OccasionFixtureYear, string | null>>;
  /** Is this a committed `seed/data/occasion-country.json` row, or a D6 reference date? */
  readonly inSeed: boolean;
}

/**
 * Easter Sunday 2026–2030, tabled from a trusted source rather than computed, so the test has an
 * anchor that owes nothing to `easterSunday()`. Every movable date in the table below is derived
 * from these five days.
 */
export const EASTER_SUNDAYS: Readonly<Record<OccasionFixtureYear, string>> = {
  2026: "2026-04-05",
  2027: "2027-03-28",
  2028: "2028-04-16",
  2029: "2029-04-01",
  2030: "2030-04-21",
};

/**
 * Orthodox (Julian-computus) Easter Sunday 2026–2030 in the Gregorian calendar, tabled from the
 * sources named in the header rather than computed here, so the `orthodox_easter_offset` rows owe
 * nothing to `orthodoxEasterSunday()`. Every Romanian movable date below is derived from these
 * five days.
 */
export const ORTHODOX_EASTER_SUNDAYS: Readonly<
  Record<OccasionFixtureYear, string>
> = {
  2026: "2026-04-12",
  2027: "2027-05-02",
  2028: "2028-04-16",
  2029: "2029-04-08",
  2030: "2030-04-28",
};

export const occasionRuleFixtures: readonly OccasionRuleFixture[] = [
  {
    country: "PL",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "womens_day",
    label: "Women's Day",
    rule: { kind: "fixed", month: 3, day: 8 },
    dates: {
      2026: "2026-03-08",
      2027: "2027-03-08",
      2028: "2028-03-08",
      2029: "2029-03-08",
      2030: "2030-03-08",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "fixed", month: 5, day: 26 },
    dates: {
      2026: "2026-05-26",
      2027: "2027-05-26",
      2028: "2028-05-26",
      2029: "2029-05-26",
      2030: "2030-05-26",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "fixed", month: 6, day: 23 },
    dates: {
      2026: "2026-06-23",
      2027: "2027-06-23",
      2028: "2028-06-23",
      2029: "2029-06-23",
      2030: "2030-06-23",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "grandparents_day",
    label: "Grandparents' Day",
    rule: { kind: "fixed", month: 1, day: 21 },
    dates: {
      2026: "2026-01-21",
      2027: "2027-01-21",
      2028: "2028-01-21",
      2029: "2029-01-21",
      2030: "2030-01-21",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "easter",
    label: "Easter Sunday",
    rule: { kind: "easter_offset", days: 0 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "all_saints",
    label: "All Saints' Day",
    rule: { kind: "fixed", month: 11, day: 1 },
    dates: {
      2026: "2026-11-01",
      2027: "2027-11-01",
      2028: "2028-11-01",
      2029: "2029-11-01",
      2030: "2030-11-01",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "name_day",
    label: "Name day",
    rule: { kind: "none" },
    dates: {
      2026: null,
      2027: null,
      2028: null,
      2029: null,
      2030: null,
    },
    inSeed: true,
  },
  {
    country: "PL",
    occasion: "teachers_day",
    label: "Teachers' Day",
    rule: { kind: "fixed", month: 10, day: 14 },
    dates: {
      2026: "2026-10-14",
      2027: "2027-10-14",
      2028: "2028-10-14",
      2029: "2029-10-14",
      2030: "2030-10-14",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 2 },
    dates: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "easter_offset", days: 39 },
    dates: {
      2026: "2026-05-14",
      2027: "2027-05-06",
      2028: "2028-05-25",
      2029: "2029-05-10",
      2030: "2030-05-30",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "easter",
    label: "Easter Sunday",
    rule: { kind: "easter_offset", days: 0 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "all_saints",
    label: "All Saints' Day",
    rule: { kind: "fixed", month: 11, day: 1 },
    dates: {
      2026: "2026-11-01",
      2027: "2027-11-01",
      2028: "2028-11-01",
      2029: "2029-11-01",
      2030: "2030-11-01",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "DE",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "last_weekday", month: 5, weekday: 7 },
    dates: {
      2026: "2026-05-31",
      2027: "2027-05-30",
      2028: "2028-05-28",
      2029: "2029-05-27",
      2030: "2030-05-26",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "nth_weekday", month: 6, weekday: 7, n: 3 },
    dates: {
      2026: "2026-06-21",
      2027: "2027-06-20",
      2028: "2028-06-18",
      2029: "2029-06-17",
      2030: "2030-06-16",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "easter",
    label: "Easter Sunday",
    rule: { kind: "easter_offset", days: 0 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "all_saints",
    label: "All Saints' Day",
    rule: { kind: "fixed", month: 11, day: 1 },
    dates: {
      2026: "2026-11-01",
      2027: "2027-11-01",
      2028: "2028-11-01",
      2029: "2029-11-01",
      2030: "2030-11-01",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "fete_des_grands_meres",
    label: "Fete des Grands-Meres",
    rule: { kind: "nth_weekday", month: 3, weekday: 7, n: 1 },
    dates: {
      2026: "2026-03-01",
      2027: "2027-03-07",
      2028: "2028-03-05",
      2029: "2029-03-04",
      2030: "2030-03-03",
    },
    inSeed: true,
  },
  {
    country: "FR",
    occasion: "muguet",
    label: "Muguet (1 May)",
    rule: { kind: "fixed", month: 5, day: 1 },
    dates: {
      2026: "2026-05-01",
      2027: "2027-05-01",
      2028: "2028-05-01",
      2029: "2029-05-01",
      2030: "2030-05-01",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 1 },
    dates: {
      2026: "2026-05-03",
      2027: "2027-05-02",
      2028: "2028-05-07",
      2029: "2029-05-06",
      2030: "2030-05-05",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "fixed", month: 3, day: 19 },
    dates: {
      2026: "2026-03-19",
      2027: "2027-03-19",
      2028: "2028-03-19",
      2029: "2029-03-19",
      2030: "2030-03-19",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "grandparents_day",
    label: "Grandparents' Day",
    rule: { kind: "fixed", month: 7, day: 26 },
    dates: {
      2026: "2026-07-26",
      2027: "2027-07-26",
      2028: "2028-07-26",
      2029: "2029-07-26",
      2030: "2030-07-26",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "easter",
    label: "Easter Sunday",
    rule: { kind: "easter_offset", days: 0 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "all_saints",
    label: "All Saints' Day",
    rule: { kind: "fixed", month: 11, day: 1 },
    dates: {
      2026: "2026-11-01",
      2027: "2027-11-01",
      2028: "2028-11-01",
      2029: "2029-11-01",
      2030: "2030-11-01",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "ES",
    occasion: "sant_jordi",
    label: "Sant Jordi",
    rule: { kind: "fixed", month: 4, day: 23 },
    dates: {
      2026: "2026-04-23",
      2027: "2027-04-23",
      2028: "2028-04-23",
      2029: "2029-04-23",
      2030: "2030-04-23",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "womens_day",
    label: "Women's Day",
    rule: { kind: "fixed", month: 3, day: 8 },
    dates: {
      2026: "2026-03-08",
      2027: "2027-03-08",
      2028: "2028-03-08",
      2029: "2029-03-08",
      2030: "2030-03-08",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 2 },
    dates: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "fixed", month: 3, day: 19 },
    dates: {
      2026: "2026-03-19",
      2027: "2027-03-19",
      2028: "2028-03-19",
      2029: "2029-03-19",
      2030: "2030-03-19",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "grandparents_day",
    label: "Grandparents' Day",
    rule: { kind: "fixed", month: 10, day: 2 },
    dates: {
      2026: "2026-10-02",
      2027: "2027-10-02",
      2028: "2028-10-02",
      2029: "2029-10-02",
      2030: "2030-10-02",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "easter",
    label: "Easter Sunday",
    rule: { kind: "easter_offset", days: 0 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "all_saints",
    label: "All Saints' Day",
    rule: { kind: "fixed", month: 11, day: 1 },
    dates: {
      2026: "2026-11-01",
      2027: "2027-11-01",
      2028: "2028-11-01",
      2029: "2029-11-01",
      2030: "2030-11-01",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "IT",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "womens_day",
    label: "Women's Day",
    rule: { kind: "fixed", month: 3, day: 8 },
    dates: {
      2026: "2026-03-08",
      2027: "2027-03-08",
      2028: "2028-03-08",
      2029: "2029-03-08",
      2030: "2030-03-08",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 1 },
    dates: {
      2026: "2026-05-03",
      2027: "2027-05-02",
      2028: "2028-05-07",
      2029: "2029-05-06",
      2030: "2030-05-05",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 2 },
    dates: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "easter",
    label: "Sfintele Paști (Orthodox Easter Sunday)",
    rule: { kind: "orthodox_easter_offset", days: 0 },
    dates: {
      2026: "2026-04-12",
      2027: "2027-05-02",
      2028: "2028-04-16",
      2029: "2029-04-08",
      2030: "2030-04-28",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "all_saints",
    label: "All Saints' Day",
    rule: { kind: "fixed", month: 11, day: 1 },
    dates: {
      2026: "2026-11-01",
      2027: "2027-11-01",
      2028: "2028-11-01",
      2029: "2029-11-01",
      2030: "2030-11-01",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "RO",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "NL",
    occasion: "valentines",
    label: "Valentine's Day",
    rule: { kind: "fixed", month: 2, day: 14 },
    dates: {
      2026: "2026-02-14",
      2027: "2027-02-14",
      2028: "2028-02-14",
      2029: "2029-02-14",
      2030: "2030-02-14",
    },
    inSeed: true,
  },
  {
    country: "NL",
    occasion: "mothers_day",
    label: "Mother's Day",
    rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 2 },
    dates: {
      2026: "2026-05-10",
      2027: "2027-05-09",
      2028: "2028-05-14",
      2029: "2029-05-13",
      2030: "2030-05-12",
    },
    inSeed: true,
  },
  {
    country: "NL",
    occasion: "fathers_day",
    label: "Father's Day",
    rule: { kind: "nth_weekday", month: 6, weekday: 7, n: 3 },
    dates: {
      2026: "2026-06-21",
      2027: "2027-06-20",
      2028: "2028-06-18",
      2029: "2029-06-17",
      2030: "2030-06-16",
    },
    inSeed: true,
  },
  {
    country: "NL",
    occasion: "easter",
    label: "Easter Sunday",
    rule: { kind: "easter_offset", days: 0 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: true,
  },
  {
    country: "NL",
    occasion: "christmas",
    label: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    dates: {
      2026: "2026-12-25",
      2027: "2027-12-25",
      2028: "2028-12-25",
      2029: "2029-12-25",
      2030: "2030-12-25",
    },
    inSeed: true,
  },
  {
    country: "NL",
    occasion: "new_year",
    label: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    dates: {
      2026: "2026-01-01",
      2027: "2027-01-01",
      2028: "2028-01-01",
      2029: "2029-01-01",
      2030: "2030-01-01",
    },
    inSeed: true,
  },
  {
    country: "GB",
    occasion: "mothers_day",
    label: "Mothering Sunday",
    rule: { kind: "lent_sunday", n: 4 },
    dates: {
      2026: "2026-03-15",
      2027: "2027-03-07",
      2028: "2028-03-26",
      2029: "2029-03-11",
      2030: "2030-03-31",
    },
    inSeed: false,
  },
  {
    country: "NO",
    occasion: "mothers_day",
    label: "Morsdag",
    rule: { kind: "nth_weekday", month: 2, weekday: 7, n: 2 },
    dates: {
      2026: "2026-02-08",
      2027: "2027-02-14",
      2028: "2028-02-13",
      2029: "2029-02-11",
      2030: "2030-02-10",
    },
    inSeed: false,
  },
  {
    country: "SE",
    occasion: "mothers_day",
    label: "Mors dag",
    rule: { kind: "last_weekday", month: 5, weekday: 7 },
    dates: {
      2026: "2026-05-31",
      2027: "2027-05-30",
      2028: "2028-05-28",
      2029: "2029-05-27",
      2030: "2030-05-26",
    },
    inSeed: false,
  },
  // The three Romanian observances that hang off Orthodox Easter (spec 009 AC-12). They are not
  // seed rows — `occasion-country.json` carries no Floriile, Înălțarea or Rusalii occasion — but
  // they are the reason the offset half of the rule type exists, and their 2026 dates are the
  // four the Patriarchate's own calendar prints (header § 1), which is what verifies the offsets
  // rather than just the anchor.
  {
    country: "RO",
    occasion: "palm_sunday",
    label: "Floriile (Palm Sunday, Pascha − 7)",
    rule: { kind: "orthodox_easter_offset", days: -7 },
    dates: {
      2026: "2026-04-05",
      2027: "2027-04-25",
      2028: "2028-04-09",
      2029: "2029-04-01",
      2030: "2030-04-21",
    },
    inSeed: false,
  },
  {
    country: "RO",
    occasion: "ascension",
    label: "Înălțarea Domnului (Ascension, Pascha + 39)",
    rule: { kind: "orthodox_easter_offset", days: 39 },
    dates: {
      2026: "2026-05-21",
      2027: "2027-06-10",
      2028: "2028-05-25",
      2029: "2029-05-17",
      2030: "2030-06-06",
    },
    inSeed: false,
  },
  {
    country: "RO",
    occasion: "pentecost",
    label: "Rusaliile (Pentecost, Pascha + 49)",
    rule: { kind: "orthodox_easter_offset", days: 49 },
    dates: {
      2026: "2026-05-31",
      2027: "2027-06-20",
      2028: "2028-06-04",
      2029: "2029-05-27",
      2030: "2030-06-16",
    },
    inSeed: false,
  },
];

/**
 * The flat view spec 001 §2 reserved on the fixtures barrel (`occasionDates`): one row per dated
 * occurrence, with the occasion key in the hyphenated slug form catalogue URLs use. Derived from
 * the table above — a fixture from a fixture, never from the module under test — so the two
 * cannot drift.
 */
export const occasionDates: readonly OccasionDateFixture[] =
  occasionRuleFixtures.flatMap((row) =>
    OCCASION_FIXTURE_YEARS.flatMap((year) => {
      const date = row.dates[year];
      return date === null
        ? []
        : [
            {
              occasion: row.occasion.replaceAll("_", "-"),
              country: row.country,
              date,
            },
          ];
    }),
  );
