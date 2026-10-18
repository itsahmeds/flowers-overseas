/**
 * Freshness-claim scan (spec 009 §14 A11; spec 041 AC-16, T-16; TASK-172).
 *
 * The founder's ruling, 2026-10-04: the flowers arrive fresh, and we never promise how long they
 * stay fresh, because that depends on the room, the water and the care. Every guarantee text, in
 * every locale, is the fresh-flower promise (fresh and in good condition on arrival, a photo
 * within 72 hours of delivery) and never a number of days of freshness.
 *
 * The scan, as A11 and T-16 word it: case-insensitive, Unicode word boundaries, one sentence at a
 * time. A sentence fails when a **day claim** sits with at most three words between it and a
 * **freshness word**, in either order. A day claim is
 *
 *  - a *day count*: a digit run or a spelled-out number (`one`…`thirty`, `ein`…`dreißig`,
 *    `jeden`…`trzydzieści`, and the Polish combining forms such as `siedmio-` that a compound like
 *    "siedmiodniowa" is built from) directly followed, hyphenated or not, by a day word or a week
 *    word;
 *  - a week word on its own ("lasts a week");
 *  - an ICU argument whose name contains `day` (`{days}`, `{freshnessDays}`).
 *
 * The statutory cancellation-right copy ("14 days to change your mind", "14 Tage", "14 dni") has
 * no freshness word within that window, so it never matches; "Fresh flowers are an exception to
 * the usual 14-day right to cancel" keeps seven words between the two and passes.
 *
 * One matcher for every reader: the message-and-content unit scan
 * (`tests/unit/freshness-claim.test.ts`) and, from TASK-182, spec 041's `pnpm pages:check`.
 * `FRESHNESS_TERMS` is exported so the unit test can delete each branch and watch a fixture go
 * red.
 */
import { sentencesOf } from "./honesty.ts";

/** A letter, digit or underscore: what a Unicode word boundary may not have on either side. */
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;
/** Any further letters: a stem such as `fresh*`. */
const STEM = String.raw`\p{L}*`;
/** "Directly followed, hyphenated or not": nothing, one space or one hyphen-like mark. */
const JOIN = String.raw`[\s\u00a0\u202f\-\u2010\u2011\u2013]?`;

/** `one`…`thirty`. "twenty-seven days" is caught by its "seven days". */
const EN_NUMBERS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
];

/** `ein`…`dreißig`, with `einen` ("einen Tag") and the `…undzwanzig` compounds. */
const DE_NUMBERS = [
  "ein",
  "einen",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
  "zwanzig",
  "(?:ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)undzwanzig",
  "dreißig",
];

/**
 * `jeden`…`trzydzieści` ("dwadzieścia siedem dni" is caught by its "siedem dni"), and the
 * combining forms a compound adjective is built from ("siedmiodniowa", "dwutygodniowa").
 */
const PL_NUMBERS = [
  "jeden",
  "dwa",
  "trzy",
  "cztery",
  "pięć",
  "sześć",
  "siedem",
  "osiem",
  "dziewięć",
  "dziesięć",
  "jedenaście",
  "dwanaście",
  "trzynaście",
  "czternaście",
  "piętnaście",
  "szesnaście",
  "siedemnaście",
  "osiemnaście",
  "dziewiętnaście",
  "dwadzieścia",
  "trzydzieści",
  "(?:jedno|dwu|cztero|pięcio|sześcio|siedmio|ośmio|dziewięcio|dziesięcio|czternasto|trzydziesto)",
];

/** A digit run or a spelled-out number. */
const COUNT = [
  String.raw`\d+`,
  ...EN_NUMBERS,
  ...DE_NUMBERS,
  ...PL_NUMBERS,
].join("|");

/** Day words: `day`, `days`, `Tag`, `Tage`, `Tagen`, `tägig*`, `dzień`, `dni`, `dniow*`. */
const DAY_WORD = `days?|tag(?:e|en)?|tägig${STEM}|dzień|dni|dniow${STEM}`;

/** Week words: `week`, `weeks`, `Woche`, `Wochen`, `tydzień`, `tygodnie`, `tygodni`. */
const WEEK_WORD = `weeks?|wochen?|tydzień|tygodnie?`;

/**
 * The week stems of a compound adjective ("zweiwöchige", "dwutygodniowa"): bounded on the right
 * only, because the number is glued to their left.
 */
const WEEK_SUFFIX = `(?:wöchig|tygodniow)${STEM}`;

/**
 * Freshness words: `fresh*`, `last`, `lasts`, `lasting`, `frisch*`, `hält`, `halten`,
 * `haltbar*` (which takes `Haltbarkeit`), `śwież*`, `trwał*`, `wytrzym*`.
 */
const FRESHNESS_WORD = `fresh${STEM}|last(?:s|ing)?|frisch${STEM}|hält|halten|haltbar${STEM}|śwież${STEM}|trwał${STEM}|wytrzym${STEM}`;

/** An ICU argument whose name contains `day`: `{days}`, `{freshnessDays}`, `{days, plural, …}`. */
const DAY_ARGUMENT_SOURCE = String.raw`\{\s*[\p{L}\p{N}_]*day[\p{L}\p{N}_]*\s*[,}]`;

function bounded(source: string): RegExp {
  return new RegExp(`(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})`, "giu");
}

/**
 * The terms of the scan, one pattern each. `dayClaim` is the alternation of the three day-claim
 * shapes; `freshness` the freshness words. Both are global, so a sentence's every occurrence is
 * read.
 */
export const FRESHNESS_TERMS = {
  dayClaim: new RegExp(
    [
      bounded(`(?:${COUNT})${JOIN}(?:${DAY_WORD})`).source,
      bounded(WEEK_WORD).source,
      `${WEEK_SUFFIX}(?!${WORD_CHAR})`,
      DAY_ARGUMENT_SOURCE,
    ].join("|"),
    "giu",
  ),
  freshness: bounded(FRESHNESS_WORD),
} as const;

export type FreshnessTerms = Readonly<
  Record<keyof typeof FRESHNESS_TERMS, RegExp>
>;

export interface FreshnessClaim {
  /** The day claim that matched. */
  readonly claim: string;
  /** The freshness word within three words of it. */
  readonly freshness: string;
  /** The sentence, whitespace collapsed and markup stripped. */
  readonly sentence: string;
}

interface Span {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function spans(pattern: RegExp, sentence: string): readonly Span[] {
  const global = pattern.flags.includes("g")
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);
  return [...sentence.matchAll(global)].map((found) => {
    const start = found.index;
    const end = found[0].startsWith("{")
      ? argumentEnd(sentence, start)
      : start + found[0].length;
    return { text: sentence.slice(start, end), start, end };
  });
}

/**
 * Where the ICU argument opening at `start` closes, nested braces included, so that a plural
 * (`{days, plural, one {# day} other {# days}}`) counts as one word-free span and the window is
 * measured from its end.
 */
function argumentEnd(sentence: string, start: number): number {
  let depth = 0;
  for (let index = start; index < sentence.length; index += 1) {
    const char = sentence.charAt(index);
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return index + 1;
  }
  return sentence.length;
}

/** Words in a gap: runs of letters and digits, a hyphenated compound counting as one. */
function wordsIn(gap: string): number {
  return (
    gap.match(/[\p{L}\p{N}]+(?:['\u2019\-\u2010\u2011][\p{L}\p{N}]+)*/gu)
      ?.length ?? 0
  );
}

/** The most words allowed between a day claim and a freshness word (A11: "at most three"). */
export const FRESHNESS_WINDOW = 3;

/**
 * Every freshness claim in `text`, sentence by sentence (markup stripped, as `sentencesOf` reads
 * it). An empty array means the text promises no number of days of freshness.
 *
 * `terms` exists for the unit test's mutations; every scan passes the default.
 */
export function freshnessClaims(
  text: string,
  terms: FreshnessTerms = FRESHNESS_TERMS,
): readonly FreshnessClaim[] {
  return sentencesOf(text).flatMap((sentence) => {
    const claims = spans(terms.dayClaim, sentence);
    if (claims.length === 0) return [];
    const words = spans(terms.freshness, sentence);
    return claims.flatMap((claim) => {
      const near = words.find((word) => {
        if (word.start < claim.end && claim.start < word.end) return true;
        const gap =
          word.start >= claim.end
            ? sentence.slice(claim.end, word.start)
            : sentence.slice(word.end, claim.start);
        return wordsIn(gap) <= FRESHNESS_WINDOW;
      });
      return near === undefined
        ? []
        : [{ claim: claim.text, freshness: near.text, sentence }];
    });
  });
}

/**
 * An ICU argument whose name contains `day`. A9's `{days}` parameter is withdrawn (A11), so no
 * guarantee message may take one at all, whatever sits beside it.
 */
export const DAY_ARGUMENT = new RegExp(DAY_ARGUMENT_SOURCE, "iu");
