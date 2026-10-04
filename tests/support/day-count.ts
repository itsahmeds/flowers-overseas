/**
 * A promise of a number of days, in any of the four languages (founder, 2026-10-04: "cant
 * promise staying fresh"; PR 172 breaker round 2 carry-forward b, widened by PR 174's breaker H4).
 *
 * Two shapes match:
 *  - **a count before a day word**: a number, in digits or spelled one to ten (one–ten,
 *    eins–zehn, jeden–dziesięć with their case forms), then at most two words, then a word that
 *    contains a day stem — day, tag/täg, dni/dzie, dob(a) — so "7 days", "7-tägige",
 *    "7 full days", "7 Kalendertage", "sieben Tage" and "7 dni świeżości" all match;
 *  - **a week word** anywhere — week, Woche/wöchig, tydzień/tygodni — since a week is a count of
 *    days ("a week", "tydzień świeżości").
 *
 * "24/7" is not a count of days: a digit after a slash never starts a match, and a slash is not a
 * separator, so it passes. German "ein"/"eine" are left out of the spelled numbers on purpose:
 * they are the indefinite article, and "ein Strauß zum Geburtstag" is not a promise.
 */
const NUMBER = [
  String.raw`\d+`,
  "one|two|three|four|five|six|seven|eight|nine|ten",
  "eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn",
  "jeden|jedna|jednego|dwa|dwie|dwóch|trzy|trzech|cztery|czterech|pięć|pięciu",
  "sześć|sześciu|siedem|siedmiu|osiem|ośmiu|dziewięć|dziewięciu|dziesięć|dziesięciu",
].join("|");

const SEPARATOR = String.raw`[\s \-‑–]`;

export const DAY_COUNT = new RegExp(
  [
    String.raw`(?<![\p{L}\d/])(?:${NUMBER})(?![\p{L}\d/])`,
    String.raw`(?:${SEPARATOR}+[\p{L}.']+){0,2}?`,
    String.raw`${SEPARATOR}*\p{L}*?(?:day|tag|täg|dni|dzie|dob)`,
  ].join(""),
  "iu",
);

export const WEEK_WORD = /week|woche|wöch|tydzie|tygod/iu;

/** The first day-count promise in `text`, or `undefined`. */
export function dayCountIn(text: string): string | undefined {
  return DAY_COUNT.exec(text)?.[0] ?? WEEK_WORD.exec(text)?.[0];
}
