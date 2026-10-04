/**
 * A promise of a number of days, in any of the four languages (founder, 2026-10-04: "cant
 * promise staying fresh"; PR 172 breaker round 2 carry-forward b, widened by PR 174's breaker H4
 * and round-2 hole 3).
 *
 * Four shapes match:
 *  - **a count, then a day word**: a number in digits or spelled one to fourteen (en, de, pl with
 *    the case forms), then at most two words, then a word containing a day stem — day, tag/täg,
 *    dni/dzie, dob/dób: "7 days", "7-tägige", "7 full days", "7 Kalendertage", "sieben Tage",
 *    "fourteen days", "Vierzehn Tage", "7 dób";
 *  - **a count fused with the stem**: "siebentägigen", "Siedmiodniowa", "14-dniowa", using the
 *    German number words and the Polish compound prefixes (jedno-, dwu-, siedmio- …);
 *  - **a fortnight**;
 *  - **a week word**: week, Woche/wöch, tydzień/tygod — but not "weekend" or "Wochenende".
 *
 * "24/7" is not a count of days: a number directly after or before a slash never starts a match,
 * so "open 24/7 days and nights" passes. German "ein"/"eine" are left out of the spelled numbers
 * on purpose: they are the indefinite article, and "ein Strauß zum Geburtstag" is no promise.
 */
const NUMBER_WORDS = [
  String.raw`\d+`,
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen",
  "eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn",
  "jeden|jedna|jednego|dwa|dwie|dwóch|trzy|trzech|cztery|czterech|pięć|pięciu",
  "sześć|sześciu|siedem|siedmiu|osiem|ośmiu|dziewięć|dziewięciu|dziesięć|dziesięciu",
  "czternaście|czternastu",
].join("|");

/** Number stems that fuse with the day stem into one word. */
const FUSED_NUMBERS = [
  String.raw`\d+`,
  "zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn",
  "jedno|dwu|trzy|cztero|pięcio|sześcio|siedmio|ośmio|dziewięcio|dziesięcio|czternasto",
].join("|");

const DAY_STEM = "day|tag|täg|dni|dzie|dob|dób";

const SEPARATOR = String.raw`[\s \-‑–]`;

export const DAY_COUNT = new RegExp(
  [
    String.raw`(?<![\p{L}\d/])(?:${NUMBER_WORDS})(?![\p{L}\d/])`,
    String.raw`(?:${SEPARATOR}+[\p{L}.']+){0,2}?`,
    String.raw`${SEPARATOR}*\p{L}*?(?:${DAY_STEM})`,
  ].join(""),
  "iu",
);

export const FUSED_DAY_COUNT = new RegExp(
  String.raw`(?<![\p{L}\d/])(?:${FUSED_NUMBERS})[\-‑]?(?:täg|tag|dniow|dniów|dzienn|day)`,
  "iu",
);

export const WEEK_WORD =
  /fortnight|week(?!end)|woche(?!nende)|wöch|tydzie|tygod/iu;

/** The first day-count promise in `text`, or `undefined`. */
export function dayCountIn(text: string): string | undefined {
  return (
    DAY_COUNT.exec(text)?.[0] ??
    FUSED_DAY_COUNT.exec(text)?.[0] ??
    WEEK_WORD.exec(text)?.[0]
  );
}
