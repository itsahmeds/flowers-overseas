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
 * **Text is normalised before it is read** (`normaliseForScan`): NFKC (full-width digits become
 * ASCII, NFD "świeże" is composed), `&nbsp;`-style entities become spaces, every format character
 * (`\p{Cf}`: soft hyphen, zero-width space, word joiner) is removed, and the text is lower-cased
 * with `ß` folded to `ss`, so "DREISSIG", "dreißig" and "DREIẞIG" read alike. A digit is any
 * decimal digit (`\p{Nd}`: ٧ and ७ count). The join between a number and its day word is nothing,
 * whitespace, or any dash (`\p{Pd}`, U+2212) with optional spaces around it.
 *
 * **Two widenings past A11's letter, both stricter, never looser** (reviewer to rule, TASK-172
 * brief): one word may sit between the number and the day word ("7 full days", "7 volle Tage"),
 * and a number may carry a `+` ("7+ days"). An ICU argument of any name (`{count}`,
 * `{n, number}`) or a plural's `#` counts as a number, and a claim inside an ICU argument spans
 * the whole argument, so A9's plural cannot come back under another name.
 *
 * `guaranteeTextViolations` is the whole rule for one guarantee value: the freshness scan, a
 * day count beside a guarantee word ("7-Tage-Garantie", "gwarancja 7 dni"), the retired "7-day"
 * in any hyphen, and any ICU argument naming days.
 *
 * One matcher for every reader: the message-and-content unit scan
 * (`tests/unit/freshness-claim.test.ts`) and, from TASK-182, spec 041's `pnpm pages:check`.
 * `FRESHNESS_TERMS` is exported so the unit test can delete each branch and watch a fixture go
 * red.
 */
import { decodeHTML } from "entities";

import { sentencesOf } from "./honesty.ts";

/** A letter, digit or underscore: what a Unicode word boundary may not have on either side. */
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;
/** Any further letters: a stem such as `fresh*`. */
const STEM = String.raw`\p{L}*`;
/**
 * "Directly followed, hyphenated or not": nothing, any dash with optional spaces, or whitespace
 * with at most two words in it (the widening above: "7 full days", "5 or more days").
 */
const JOIN = String.raw`(?:\s*[\p{Pd}\u2212]\s*|\s+(?:\p{L}+\s+){0,2})?`;

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
  "dreissig",
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

/**
 * A digit run in any script (with an optional `+`), an ICU argument of any name, a plural's `#`,
 * or a spelled-out number.
 */
const COUNT = [
  String.raw`\p{Nd}+\+?`,
  String.raw`\{[^{}]*\}`,
  "#",
  ...EN_NUMBERS,
  ...DE_NUMBERS,
  ...PL_NUMBERS,
].join("|");

/** Day words: `day`, `days`, `Tag`, `Tage`, `Tagen`, `tägig*`, `dzień`, `dni`, `dniow*`. */
const DAY_WORD = `days?|tag(?:e|en)?|tägig${STEM}|dzień|dni|dniow${STEM}`;

/**
 * The day words a label puts before its number ("Fresh days: 5", "Frische (Tage): 5", "Garantie
 * in Tagen: 5"), read by the reverse day count.
 */
const REVERSE_DAY_WORD = `days?|tag(?:e|en)?|dzień|dni`;

/**
 * Between a label's day word and its number: punctuation and spaces, and at most one word
 * ("days: about 5"). Never a brace or `#`, which belong to the count.
 */
const REVERSE_GAP = String.raw`[^\p{L}\p{N}{}#]*(?:\p{L}+[^\p{L}\p{N}{}#]+)?`;

/**
 * A label's number: a digit run (with an optional `+`), an ICU argument or a plural's `#`. A
 * spelled-out number after a label ("days: five") is not read.
 */
const REVERSE_COUNT = String.raw`\p{Nd}+\+?|\{[^{}]*\}|#`;

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

/**
 * An ICU argument whose name contains a day word: `{days}`, `{freshnessDays}`, `{tage}`, `{dni}`,
 * `{days, plural, …}`.
 */
const DAY_ARGUMENT_SOURCE = String.raw`\{\s*[\p{L}\p{N}_]*(?:day|tage|dni)[\p{L}\p{N}_]*\s*[,}]`;

/** Guarantee words: `guarantee*`, `Garantie*`, `gwarancj*`, `promise*`, `Versprechen*`, `obietnic*`. */
const GUARANTEE_WORD = `guarant${STEM}|garantie${STEM}|gwarancj${STEM}|promis${STEM}|versprech${STEM}|obietnic${STEM}`;

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
      bounded(
        `(?:${REVERSE_DAY_WORD})(?!${WORD_CHAR})${REVERSE_GAP}(?:${REVERSE_COUNT})`,
      ).source,
      bounded(WEEK_WORD).source,
      `${WEEK_SUFFIX}(?!${WORD_CHAR})`,
      DAY_ARGUMENT_SOURCE,
    ].join("|"),
    "giu",
  ),
  freshness: bounded(FRESHNESS_WORD),
} as const;

/** Guarantee words, read beside a day claim by `guaranteeTextViolations`. */
export const GUARANTEE_TERMS = bounded(GUARANTEE_WORD);

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
  const groups = braceGroups(sentence);
  return [...sentence.matchAll(global)].map((found) => {
    const group = groups.find(
      ([from, to]) => found.index >= from && found.index < to,
    );
    const start = group?.[0] ?? found.index;
    const end = Math.max(group?.[1] ?? 0, found.index + found[0].length);
    return { text: sentence.slice(start, end), start, end };
  });
}

/**
 * The outermost ICU arguments of a sentence, nested braces included, as `[from, to)` ranges. A
 * claim that starts inside one spans all of it, so a plural (`{n, plural, one {# day} other
 * {# days}}`) counts as one word-free span and the window is measured from its edges.
 */
function braceGroups(sentence: string): readonly (readonly [number, number])[] {
  const groups: (readonly [number, number])[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < sentence.length; index += 1) {
    const char = sentence.charAt(index);
    if (char === "{") {
      if (depth === 0) from = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) groups.push([from, index + 1]);
    }
  }
  if (depth > 0) groups.push([from, sentence.length]);
  return groups;
}

/** Words in a gap: runs of letters and digits, a hyphenated compound counting as one. */
function wordsIn(gap: string): number {
  return (
    gap.match(/[\p{L}\p{N}]+(?:['\u2019\p{Pd}][\p{L}\p{N}]+)*/gu)?.length ?? 0
  );
}

/** The most words allowed between a day claim and a freshness word (A11: "at most three"). */
export const FRESHNESS_WINDOW = 3;

/**
 * Cyrillic and Greek letters that look like the Latin letters of a day or freshness word ("dаys"
 * with a Cyrillic `а`). No launch locale writes Cyrillic or Greek, so folding them is clean.
 */
const CONFUSABLES: Readonly<Record<string, string>> = {
  "\u0430": "a",
  "\u0435": "e",
  "\u043e": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0443": "y",
  "\u0445": "x",
  "\u0456": "i",
  "\u0455": "s",
  "\u0458": "j",
  "\u0501": "d",
  "\u04cf": "l",
  "\u0410": "a",
  "\u0415": "e",
  "\u041e": "o",
  "\u0420": "p",
  "\u0421": "c",
  "\u0425": "x",
  "\u03b1": "a",
  "\u03b5": "e",
  "\u03bf": "o",
  "\u03b9": "i",
  "\u03ba": "k",
  "\u03bd": "v",
  "\u03c4": "t",
  "\u03c5": "u",
};

/**
 * "N days a week" says when we answer, not how long flowers last (a support-hours line, TASK-182
 * and TASK-238), so it is removed before the scan, in all four locales.
 */
export const DAYS_A_WEEK =
  /(?<![\p{L}\p{N}_])(?:\p{Nd}+|seven|sieben|siedem)\s*(?:days? (?:a|per) week|tage (?:die|pro|in der) woche|dni w tygodniu)(?![\p{L}\p{N}_])/gu;

/**
 * The text as the scan reads it: every HTML entity decoded (`entities`' HTML5 decoder: `&ndash;`,
 * `&#8209;`, `&shy;`, `&#53;`, `&auml;`), NFKC, Cyrillic and Greek look-alikes folded to Latin,
 * format characters (`\p{Cf}`: soft hyphen, zero-width space, word joiner, BOM), variation
 * selectors and the keycap mark ("5️⃣" reads 5) removed, markdown underscores (`_x_`, `__x__`)
 * removed, lower-cased with `ß` folded to `ss`, and "N days a week" removed.
 */
export function normaliseForScan(text: string): string {
  const folded = [...decodeHTML(text).normalize("NFKC")]
    .map((char) => CONFUSABLES[char] ?? char)
    .join("")
    .replaceAll(/[\p{Cf}\uFE00-\uFE0F\u20E3]/gu, "")
    .replaceAll(/_+/gu, "")
    .toLowerCase()
    .replaceAll("ß", "ss");
  return folded.replaceAll(DAYS_A_WEEK, " ");
}

function claimsNear(
  text: string,
  dayClaim: RegExp,
  near: RegExp,
): readonly FreshnessClaim[] {
  return sentencesOf(normaliseForScan(text)).flatMap((sentence) => {
    const claims = spans(dayClaim, sentence);
    if (claims.length === 0) return [];
    const words = spans(near, sentence);
    return claims.flatMap((claim) => {
      const found = words.find((word) => {
        if (word.start < claim.end && claim.start < word.end) return true;
        const gap =
          word.start >= claim.end
            ? sentence.slice(claim.end, word.start)
            : sentence.slice(word.end, claim.start);
        return wordsIn(gap) <= FRESHNESS_WINDOW;
      });
      return found === undefined
        ? []
        : [{ claim: claim.text, freshness: found.text, sentence }];
    });
  });
}

/**
 * Every freshness claim in `text`, sentence by sentence (normalised by `normaliseForScan`, markup
 * stripped as `sentencesOf` reads it). An empty array means the text promises no number of days
 * of freshness. `sentence` is reported in its normalised (lower-case) form.
 *
 * `terms` exists for the unit test's mutations; every scan passes the default.
 */
export function freshnessClaims(
  text: string,
  terms: FreshnessTerms = FRESHNESS_TERMS,
): readonly FreshnessClaim[] {
  return claimsNear(text, terms.dayClaim, terms.freshness);
}

/**
 * An ICU argument whose name contains `day`. A9's `{days}` parameter is withdrawn (A11), so no
 * guarantee message may take one at all, whatever sits beside it.
 */
export const DAY_ARGUMENT = new RegExp(DAY_ARGUMENT_SOURCE, "iu");

/**
 * Every day claim within three words of a guarantee word ("7-Tage-Garantie", "gwarancja 7 dni",
 * "a 7 day guarantee"). `near` exists for the unit test's mutations.
 */
export function guaranteeDayClaims(
  text: string,
  near: RegExp = GUARANTEE_TERMS,
): readonly FreshnessClaim[] {
  return claimsNear(text, FRESHNESS_TERMS.dayClaim, near);
}

/** The retired "7-day" in any hyphen, dash or spacing ("7 day", "7‑day", "7—days"). */
export const SEVEN_DAY =
  /(?<!\p{Nd})7(?:\s*[\p{Pd}\u2212]\s*|\s+)?days?(?![\p{L}\p{N}_])/u;

/** Which of `guaranteeTextViolations`' four checks fired. */
export type GuaranteeCheck =
  "sevenDay" | "dayArgument" | "freshnessClaim" | "guaranteeDays";

export interface GuaranteeViolation {
  readonly check: GuaranteeCheck;
  readonly detail: string;
}

/**
 * Everything A11 forbids in one guarantee value (a message under a guarantee key, an
 * `infoPages.*` value, a `guarantee.md`): the retired "7-day" in any hyphen, an ICU argument
 * naming days, a freshness claim, and a day claim within three words of a guarantee word
 * ("7-Tage-Garantie", "gwarancja 7 dni"). An empty array means the value is clean.
 */
export function guaranteeTextViolations(
  text: string,
): readonly GuaranteeViolation[] {
  const normalised = normaliseForScan(text);
  return [
    ...(SEVEN_DAY.test(normalised)
      ? [{ check: "sevenDay" as const, detail: '"7-day"' }]
      : []),
    ...(DAY_ARGUMENT.test(normalised)
      ? [
          {
            check: "dayArgument" as const,
            detail: "an ICU argument naming days",
          },
        ]
      : []),
    ...freshnessClaims(text).map((claim) => ({
      check: "freshnessClaim" as const,
      detail: `"${claim.claim}" beside "${claim.freshness}"`,
    })),
    ...guaranteeDayClaims(text).map((claim) => ({
      check: "guaranteeDays" as const,
      detail: `"${claim.claim}" beside "${claim.freshness}"`,
    })),
  ];
}
