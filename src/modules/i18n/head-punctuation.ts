/**
 * Head punctuation: no dash in a `<title>`, a meta description or a structured-data name (spec 003
 * §14 A-founder-2026-10-15a; TASK-242).
 *
 * The founder approved the copy "just no em dash" (2026-10-05) and then banned the spaced hyphen
 * and the spaced en dash too ("dashes yes", 2026-10-15), because swapping one dash for another
 * does not meet the ruling. This file is the rule's one definition, read by three gates:
 *
 *  - `pnpm i18n:check` (its head-punctuation check) over the message keys in `HEAD_MESSAGE_KEYS`;
 *  - `pnpm seed:check` (`copy/dash-in-head`) over seed copy `name`, `seoTitle`, `seoDescription`;
 *  - `pnpm corridor:check` (`dash-in-head`) over guide `seoTitle`, `seoDescription`, `faq[].q`.
 *
 * The built-site scan (`tests/e2e/head-dash-scan.spec.ts`, spec 003 AC-51) reads the same
 * function over every prerendered document, which is the backstop for a key that reaches the head
 * but is missing from the list below: the fix is to add it here.
 *
 * What counts as a dash (breaker r1 on PR 266, holes 1 and 2):
 *
 *  - **always a dash**, wherever it stands: U+2014 em dash, U+2012 figure dash, U+2015 horizontal
 *    bar, U+2212 minus sign, U+2E3A and U+2E3B two- and three-em dashes, U+FE58 small em dash,
 *    U+FE63 small hyphen-minus, U+FF0D fullwidth hyphen-minus, and a double hyphen ("--");
 *  - **a dash unless it joins two characters**: the hyphen-minus, U+2010 hyphen, U+2011
 *    non-breaking hyphen and U+2013 en dash. Inside a word or a range ("hand-tied", "10\u201312")
 *    they pass; with whitespace on both sides ("a - b") they are a spaced dash; with whitespace on
 *    one side, or at the start or end of the string ("a -b", "a- b", "- a", "a \u2013"), they are
 *    a one-sided dash. The one exception is the suspended hyphen of German and Polish compounds:
 *    a hyphen after a letter, followed by a space and a conjunction or by a comma ("Box- und
 *    Topfgestecke", "Box-, Topf- und", "dwu- i trzypokojowe"), which is correct spelling.
 *
 * The middle dot of `shop.pagination.titleSuffix` and `plan/02` §5.3's "·" and "|" separators
 * are not dashes.
 *
 * Import-free on purpose: the three gates run under plain `node`, outside the Next graph.
 */

/**
 * The closed list of message keys whose value reaches a `<title>`, a meta description or a
 * JSON-LD name (spec 003 §14 A-founder-2026-10-15a clause 4). A `*` stands for exactly one key
 * segment: `meta.*.title` is `meta.home.title`, `meta.notFound.title`, `meta.error.title`.
 */
export const HEAD_MESSAGE_KEYS: readonly string[] = [
  "meta.*.title",
  "meta.*.description",
  "catalog.descriptor.name",
  "shop.root.seoTitle",
  "shop.root.seoDescription",
  "shop.category.seoTitle",
  "shop.category.seoDescription",
  "shop.occasion.seoTitle",
  "shop.occasion.seoDescription",
  "shop.pagination.titleSuffix",
  "destinationsHub.seoTitle",
  "destinationsHub.seoDescription",
  // The hubs' fallback `<title>` where a seed row has no `seoTitle`.
  "categoryHub.h1",
  "occasionHub.h1",
  // The occasions index reuses these as its `<title>` and description.
  "occasionsIndex.h1",
  "occasionsIndex.intro",
  // The `BreadcrumbList` item names (breaker r1 on PR 266, hole 7): the trail's labels, the home
  // crumb and the country names, which also fill `{country}` in the shop titles.
  "breadcrumb.*",
  "common.homeLink",
  "destinations.*.name",
];

function patternMatches(pattern: string, key: string): boolean {
  const want = pattern.split(".");
  const have = key.split(".");
  if (want.length !== have.length) return false;
  return want.every(
    (segment, index) => segment === "*" || segment === have[index],
  );
}

/** Whether a flattened message key is head copy under `patterns` (the committed list by default). */
export function isHeadMessageKey(
  key: string,
  patterns: readonly string[] = HEAD_MESSAGE_KEYS,
): boolean {
  return patterns.some((pattern) => patternMatches(pattern, key));
}

/** One refused mark: what it is, in words a CI log reader understands. */
export interface HeadDash {
  readonly mark: string;
}

/** Characters that are a dash wherever they stand. */
const ALWAYS_DASH: ReadonlyMap<string, string> = new Map([
  ["\u2012", "a figure dash (U+2012)"],
  ["\u2014", "an em dash (U+2014)"],
  ["\u2015", "a horizontal bar (U+2015)"],
  ["\u2212", "a minus sign (U+2212)"],
  ["\u2e3a", "a two-em dash (U+2E3A)"],
  ["\u2e3b", "a three-em dash (U+2E3B)"],
  ["\ufe58", "a small em dash (U+FE58)"],
  ["\ufe63", "a small hyphen-minus (U+FE63)"],
  ["\uff0d", "a fullwidth hyphen-minus (U+FF0D)"],
]);

/** Characters that join two characters, and are a dash when they do not. */
const JOINERS: ReadonlyMap<string, string> = new Map([
  ["-", "hyphen"],
  ["\u2010", "hyphen (U+2010)"],
  ["\u2011", "non-breaking hyphen (U+2011)"],
  ["\u2013", "en dash (U+2013)"],
]);

const HYPHENS = new Set(["-", "\u2010", "\u2011"]);

const WHITESPACE = /\s/u;
const LETTER = /\p{L}/u;

/** The words after which a hyphen is a suspended compound ("Box- und"), not a dash. */
const SUSPENDED_HYPHEN_FOLLOWERS =
  /^\s+(?:und|oder|bis|sowie|bzw\.|i|lub|albo|oraz|czy)(?=\s)/u;

function isSuspendedHyphen(chars: readonly string[], index: number): boolean {
  const before = chars[index - 1];
  if (before === undefined || !LETTER.test(before)) return false;
  if (chars[index + 1] === ",") return true;
  return SUSPENDED_HYPHEN_FOLLOWERS.test(chars.slice(index + 1).join(""));
}

/**
 * The dashes a head string carries, each kind once, in the order they first appear; empty when
 * the value is clean. The value is read as written (an ICU message is checked as its source text,
 * placeholders and all).
 */
export function headDashesIn(value: string): readonly HeadDash[] {
  const chars = [...value];
  const marks: string[] = [];
  const add = (mark: string): void => {
    if (!marks.includes(mark)) marks.push(mark);
  };
  chars.forEach((char, index) => {
    const always = ALWAYS_DASH.get(char);
    if (always !== undefined) {
      add(always);
      return;
    }
    const joiner = JOINERS.get(char);
    if (joiner === undefined) return;
    const before = chars[index - 1];
    const after = chars[index + 1];
    if (char === "-" && (before === "-" || after === "-")) {
      add("a double hyphen (--)");
      return;
    }
    const openBefore = before === undefined || WHITESPACE.test(before);
    const openAfter = after === undefined || WHITESPACE.test(after);
    if (!openBefore && !openAfter) return;
    if (HYPHENS.has(char) && isSuspendedHyphen(chars, index)) return;
    const spaced =
      before !== undefined &&
      after !== undefined &&
      WHITESPACE.test(before) &&
      WHITESPACE.test(after);
    add(spaced ? `a spaced ${joiner}` : `a one-sided ${joiner}`);
  });
  return marks.map((mark) => ({ mark }));
}

/** The marks, joined for a problem line: "an em dash (U+2014), a spaced hyphen". */
export function describeHeadDashes(found: readonly HeadDash[]): string {
  return found.map((dash) => dash.mark).join(", ");
}
