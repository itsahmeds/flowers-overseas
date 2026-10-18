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
 * Hyphenated words ("hand-tied", "all-in") and unspaced ranges pass. The middle dot of
 * `shop.pagination.titleSuffix` and `plan/02` §5.3's "·" and "|" separators are not dashes.
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
  readonly mark:
    "an em dash (U+2014)" | "a spaced hyphen" | "a spaced en dash (U+2013)";
}

/**
 * Whitespace on either side makes a hyphen or an en dash a dash, so "hand-tied" and "10–12" pass
 * while "a - b", "a -b" and "a- b" do not: the same reading as the `Product.name` guard of
 * `src/modules/seo/schema/productOffer.ts` (spec 009 AC-36), so the gates and the builder agree.
 */
const SPACED_HYPHEN = /\s-|-\s/u;
const SPACED_EN_DASH = /\s\u2013|\u2013\s/u;
const EM_DASH = /\u2014/u;

/**
 * The dashes a head string carries, in a fixed order; empty when the value is clean. The value is
 * read as written (an ICU message is checked as its source text, placeholders and all).
 */
export function headDashesIn(value: string): readonly HeadDash[] {
  const found: HeadDash[] = [];
  if (EM_DASH.test(value)) found.push({ mark: "an em dash (U+2014)" });
  if (SPACED_HYPHEN.test(value)) found.push({ mark: "a spaced hyphen" });
  if (SPACED_EN_DASH.test(value))
    found.push({ mark: "a spaced en dash (U+2013)" });
  return found;
}

/** The marks, joined for a problem line: "an em dash (U+2014), a spaced hyphen". */
export function describeHeadDashes(found: readonly HeadDash[]): string {
  return found.map((dash) => dash.mark).join(", ");
}
