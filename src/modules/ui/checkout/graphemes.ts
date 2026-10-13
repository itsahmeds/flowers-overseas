/**
 * The card counter's in-browser count (spec 010 §13 Q9, §5.4; TASK-201).
 *
 * The server's rule is `countGraphemes()` in `src/modules/i18n/format.ts`: `Intl.Segmenter` over
 * the NFC text, and that file is the only one allowed to construct a segmenter (`fo/no-adhoc-intl`).
 * It also parses its argument with zod, so importing it into the island would put zod in the
 * browser and break the 4 096 B budget (AC-38; the budget test fails on exactly that).
 *
 * This approximates the same count without `Intl` or zod, over NFC code points:
 *
 *  - combining marks, ZWNJ, variation selectors, skin-tone modifiers, tag characters and the Thai
 *    and Lao SARA AM (spacing marks, UAX #29 GB9a) extend the previous character;
 *  - a ZWJ extends the previous character, and joins the next one only after a pictograph (GB11),
 *    so a ZWJ family is one and `a`+ZWJ+`b` is two;
 *  - an Indic virama (Devanagari to Malayalam) followed by a consonant joins them (GB9c), so a
 *    conjunct such as `क्ष` is one;
 *  - a pair of regional indicators is one flag, and CRLF is one break.
 *
 * `tests/unit/checkout-ui-islands.test.ts` pins it equal to `countGraphemes()` on the fixture
 * set (Latin, Polish, Cyrillic, combining accents, ZWJ families, flags, skin tones, ZWJ between
 * letters, ZWNJ, a Devanagari conjunct, Thai, Persian). Outside that set it can still differ
 * from the full rules. It is a display aid: the server's count decides, on every submit, with or
 * without JavaScript.
 */

/** Characters that never start a grapheme of their own. */
const EXTENDS_PREVIOUS =
  /[\p{M}\u200C\u0E33\u0EB3\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}]/u;

const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;

const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** The Indic viramas that link two consonants into one conjunct (UAX #29 GB9c). */
const LINKER = /[\u094D\u09CD\u0ACD\u0B4D\u0C4D\u0D4D]/u;

/** A consonant of the scripts `LINKER` covers. */
const INDIC_CONSONANT =
  /[\u0915-\u0939\u0958-\u095F\u0978-\u097F\u0995-\u09B9\u09DC-\u09DF\u0A95-\u0AB9\u0B15-\u0B39\u0B5C-\u0B5F\u0C15-\u0C39\u0C58-\u0C5A\u0D15-\u0D3A]/u;

const ZWJ = "\u200D";

export function approximateGraphemes(text: string): number {
  let count = 0;
  let joined = false;
  let linked = false;
  let openFlag = false;
  let base = "";
  let previous = "";
  for (const char of text.normalize("NFC")) {
    const after = previous;
    previous = char;
    if (char === ZWJ && count > 0) {
      joined = PICTOGRAPH.test(base);
      continue;
    }
    if (joined || (linked && INDIC_CONSONANT.test(char))) {
      joined = false;
      linked = false;
      continue;
    }
    joined = false;
    if (EXTENDS_PREVIOUS.test(char) && count > 0) {
      if (LINKER.test(char)) linked = true;
      continue;
    }
    linked = false;
    if (char === "\n" && after === "\r") continue;
    base = char;
    if (REGIONAL_INDICATOR.test(char)) {
      if (openFlag) {
        openFlag = false;
        continue;
      }
      openFlag = true;
      count += 1;
      continue;
    }
    openFlag = false;
    count += 1;
  }
  return count;
}
