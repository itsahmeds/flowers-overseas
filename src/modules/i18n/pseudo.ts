/**
 * Pseudo-locale generation (spec 003 §2 "Pseudo-locales", §5.3, §6 "Crawl efficiency", §7 "RTL
 * impact", §8 "Security", AC-29, AC-30; TASK-042).
 *
 * Two generated locales, both derived from `messages/en.json` and from nothing else:
 *
 *  - **`en-XA`** — every letter accented and the message expanded by at least 40 %, wrapped in
 *    `[ ]`. It answers two questions a screenshot of English cannot: does the layout survive a
 *    German-length string, and is any visible string missing from the catalogue (unbracketed text
 *    on `/en-XA` is hard-coded copy, which is what `fo/no-literal-strings` cannot see in a
 *    template it does not lint, e.g. a string arriving from a third-party component).
 *  - **`ar-XB`** — the same English text with each literal run wrapped in an RTL override, and
 *    `dir="rtl"` on the document from the locale config (never from the strings, §7). It makes
 *    right-to-left a screenshotted reality in Phase 0 instead of a promise, which is what the
 *    `pseudo-rtl` Playwright project asserts against a committed baseline (AC-30).
 *
 * ## Decisions worth stating
 *
 * **Latin letters and bidi controls, not Arabic glyphs.** `ar-XB` could substitute Arabic-script
 * homoglyphs, and Chrome's own `ar-XB` does something close to it. It does not here: §7 says no
 * Arabic font is loaded, so on a runner without one every glyph rasterises as a tofu box and the
 * screenshot stops being a gate on *layout* — which is the only thing the project exists to
 * measure. `U+202E RIGHT-TO-LEFT OVERRIDE` … `U+202C POP DIRECTIONAL FORMATTING` around each
 * literal run mirrors the text with the fonts that are already there, and the leading
 * `U+200F RIGHT-TO-LEFT MARK` is the marker a test can assert on.
 *
 * **The transforms are ICU-aware.** A pseudo-locale that broke `{count, plural, …}` would replace
 * a layout bug with a render crash, so the walker below transforms *literal text only*: argument
 * names, argument types, plural/select keywords, `offset:`, `#` and quoted runs are copied byte
 * for byte, and every submessage inside a plural or select branch is transformed recursively.
 * `tests/unit/i18n-pseudo.test.ts` parses every generated value with
 * `@formatjs/icu-messageformat-parser` — the parser next-intl formats with — so "still valid ICU"
 * is measured, not asserted (T-29).
 *
 * **Nothing here reads a file.** `generatePseudoCatalogues()` is a pure function of the English
 * catalogue, and `src/modules/i18n/messages.ts` calls it when `ENABLE_PSEUDO_LOCALES` is on. So
 * the committed `pnpm i18n:pseudo` output (`messages/en-XA.json`, `messages/ar-XB.json`, both
 * git-ignored) is an *artifact for humans and for diffs*, not an input the routes depend on: a
 * pseudo route cannot render a stale catalogue, no build step has to run before `next build`, and
 * `pnpm i18n:check` pins the two files to this function's output whenever they exist (§2's
 * regeneration-determinism clause). The parser stays out of `src/` for the same reason —
 * `@formatjs/icu-messageformat-parser` is a devDependency and this module ships to the browser's
 * server bundle.
 */
import type { MessageTree } from "./schemas.ts";

/** The accented, expanded pseudo-locale (`plan/03` §4). */
export const PSEUDO_ACCENT_LOCALE = "en-XA";
/** The RTL pseudo-locale (`plan/03` §4); `dir: "rtl"` comes from `src/config/locales.ts`. */
export const PSEUDO_RTL_LOCALE = "ar-XB";

/** `U+200F RIGHT-TO-LEFT MARK`: the marker at the head of every `ar-XB` value. */
export const RTL_MARK = "‏";
/** `U+202E RIGHT-TO-LEFT OVERRIDE` … `U+202C POP DIRECTIONAL FORMATTING`. */
const RTL_OVERRIDE = "‮";
const POP_DIRECTIONAL = "‬";

/** Minimum growth of an `en-XA` value over its English source (`plan/03` §4: +40 %). */
export const PSEUDO_EXPANSION_RATIO = 0.4;

/** `U+00B7 MIDDLE DOT`: visible, never an ICU metacharacter, never a letter. */
const PAD_CHARACTER = "·";

/**
 * ASCII letter → single accented code point. One code point per letter, so an accented value has
 * exactly the length of its source and the expansion below is the only thing that changes it.
 */
const ACCENTS: Readonly<Record<string, string>> = {
  a: "á",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ó",
  p: "þ",
  q: "ɋ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "ú",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Á",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ɱ",
  N: "Ñ",
  O: "Ó",
  P: "Þ",
  Q: "Ɋ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Ú",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

/** ICU argument types whose contents are a format skeleton, never translatable text. */
const SUBMESSAGE_TYPES = new Set(["plural", "selectordinal", "select"]);

/** Index of the `}` matching the `{` at `start`, or `-1` when the message is unbalanced. */
function matchingBrace(message: string, start: number): number {
  let depth = 0;
  for (let index = start; index < message.length; index += 1) {
    const character = message[index];
    if (character === "'") {
      index = skipQuoted(message, index) - 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Index just past an ICU quoted run starting at `index` (which must be `'`).
 *
 * ICU 4.8's apostrophe rules, which is what `@formatjs/icu-messageformat-parser` implements: `''`
 * is a literal apostrophe, and `'` starts a quoted run **only** when the next character is `{`,
 * `}` or `#`. A lone apostrophe in `don't` is ordinary text, so it must not swallow the rest of
 * the sentence — the bug this function exists to avoid.
 */
function skipQuoted(message: string, index: number): number {
  const next = message[index + 1];
  if (next === "'") return index + 2;
  if (next !== "{" && next !== "}" && next !== "#") return index + 1;
  for (let cursor = index + 2; cursor < message.length; cursor += 1) {
    if (message[cursor] === "'") {
      return message[cursor + 1] === "'" ? cursor + 2 : cursor + 1;
    }
  }
  return message.length;
}

/** Is the `'` at `index` the opening delimiter of a quoted run (rather than plain text)? */
function opensQuotedRun(message: string, index: number): boolean {
  const next = message[index + 1];
  return next === "'" || next === "{" || next === "}" || next === "#";
}

/** Applied to literal text only. */
type TextTransform = (text: string) => string;

/**
 * Walk an ICU message and apply `transform` to its literal text, copying every piece of syntax —
 * `{arg}`, `{count, plural, …}` keywords, `#`, quoted runs — unchanged. Submessages inside a
 * plural/select branch are walked recursively, because they are text a reader sees.
 */
export function mapIcuText(message: string, transform: TextTransform): string {
  let out = "";
  let literal = "";
  const flush = (): void => {
    if (literal !== "") {
      out += transform(literal);
      literal = "";
    }
  };

  let index = 0;
  while (index < message.length) {
    const character = message[index] ?? "";
    if (character === "'" && opensQuotedRun(message, index)) {
      flush();
      const end = skipQuoted(message, index);
      out += message.slice(index, end);
      index = end;
      continue;
    }
    if (character === "{") {
      const end = matchingBrace(message, index);
      if (end === -1) break;
      flush();
      out += mapArgument(message.slice(index, end + 1), transform);
      index = end + 1;
      continue;
    }
    literal += character;
    index += 1;
  }
  flush();
  // An unbalanced message is not ours to repair: copy the remainder verbatim so the generated
  // value fails ICU parsing exactly where `messages/en.json` already does (`i18n:check` check 3).
  return index < message.length ? out + message.slice(index) : out;
}

/** Split `{…}` contents at top-level commas, keeping the original spacing of each part. */
function splitArgument(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === "'") {
      index = skipQuoted(inner, index) - 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === "," && depth === 0 && parts.length < 2) {
      parts.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

/** Transform the submessages of a `{…}` argument; leave its name, type and options alone. */
function mapArgument(chunk: string, transform: TextTransform): string {
  const inner = chunk.slice(1, -1);
  const parts = splitArgument(inner);
  const type = parts[1]?.trim();
  if (parts.length < 3 || type === undefined || !SUBMESSAGE_TYPES.has(type)) {
    // `{name}`, `{value, number}`, `{when, date, medium}`: no translatable text inside.
    return chunk;
  }
  const options = parts[2] ?? "";
  let out = "";
  let index = 0;
  while (index < options.length) {
    const character = options[index];
    if (character === "{") {
      const end = matchingBrace(options, index);
      if (end === -1) break;
      out += `{${mapIcuText(options.slice(index + 1, end), transform)}}`;
      index = end + 1;
      continue;
    }
    // A plural/select key, `offset:1`, or the whitespace between them: syntax, copied verbatim.
    out += character;
    index += 1;
  }
  if (index < options.length) out += options.slice(index);
  return `{${parts[0] ?? ""},${parts[1] ?? ""},${out}}`;
}

/** Every ASCII letter of `text` replaced by its accented twin; everything else untouched. */
function accentLetters(text: string): string {
  let out = "";
  for (const character of text) out += ACCENTS[character] ?? character;
  return out;
}

/**
 * The expansion run appended inside the closing bracket. Sized from the source length so the
 * whole value grows by at least `PSEUDO_EXPANSION_RATIO`, counting the two brackets and the
 * separating space towards it; at least one pad character, so even a one-word label is visibly
 * longer than its English source.
 */
function expansionFor(value: string): string {
  const target = Math.ceil(value.length * PSEUDO_EXPANSION_RATIO);
  const pad = Math.max(1, target - 3);
  return ` ${PAD_CHARACTER.repeat(pad)}`;
}

/**
 * `en-XA`: accented, expanded by ≥ 40 %, and bracketed so a truncated or hard-coded string is
 * visible at a glance (a value with no `]` on screen was cut off; text with no `[` never came
 * from the catalogue).
 */
export function pseudoAccent(value: string): string {
  return `[${mapIcuText(value, accentLetters)}${expansionFor(value)}]`;
}

/**
 * `ar-XB`: each literal run wrapped in an RTL override, the value marked RTL at its head. The
 * document's own `dir="rtl"` comes from the locale config, never from these strings (§7).
 */
export function pseudoRtl(value: string): string {
  const mirrored = mapIcuText(value, (text) =>
    text.trim() === "" ? text : `${RTL_OVERRIDE}${text}${POP_DIRECTIONAL}`,
  );
  return `${RTL_MARK}${mirrored}`;
}

/** Applied to a whole message value (`pseudoAccent`, `pseudoRtl`). */
type ValueTransform = (value: string) => string;

function mapTree(tree: MessageTree, transform: ValueTransform): MessageTree {
  const out: Record<string, string | MessageTree> = {};
  // Sorted keys at every level: the generated files are byte-stable across platforms and the
  // determinism clause of `pnpm i18n:check` compares bytes (AC-29).
  for (const key of Object.keys(tree).sort()) {
    const value = tree[key];
    if (typeof value === "string") out[key] = transform(value);
    else if (value !== undefined) out[key] = mapTree(value, transform);
  }
  return out;
}

/**
 * The two pseudo catalogues, keyed by locale code, derived from the English catalogue. Pure and
 * deterministic: same input, same bytes, no clock, no randomness, no I/O (AC-29).
 */
export function generatePseudoCatalogues(
  source: MessageTree,
): Readonly<Record<string, MessageTree>> {
  return {
    [PSEUDO_ACCENT_LOCALE]: mapTree(source, pseudoAccent),
    [PSEUDO_RTL_LOCALE]: mapTree(source, pseudoRtl),
  };
}
