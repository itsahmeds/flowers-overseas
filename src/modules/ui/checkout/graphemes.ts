/**
 * The card counter's in-browser count (spec 010 §13 Q9, §5.4; TASK-201).
 *
 * The server's rule is `countGraphemes()` in `src/modules/i18n/format.ts`: `Intl.Segmenter` over
 * the NFC text, and that file is the only one allowed to construct a segmenter (`fo/no-adhoc-intl`).
 * It also parses its argument with zod, so importing it into the island would put zod in the
 * browser and break the 4 096 B budget (AC-38; the budget test fails on exactly that).
 *
 * This is the same count without `Intl` or zod: NFC code points, where combining marks, the
 * zero-width joiner and the code point it joins, variation selectors, skin-tone modifiers and tag
 * characters extend the previous character, a pair of regional indicators is one flag, and CRLF is
 * one break. `tests/unit/checkout-ui-islands.test.ts` pins it equal to `countGraphemes()` on the
 * fixture set (Latin, Polish, Cyrillic, combining accents, ZWJ families, flags, skin tones). It is
 * a display aid: the server's count decides, on every submit, with or without JavaScript.
 */

/** Characters that never start a grapheme of their own. */
const EXTENDS_PREVIOUS =
  /[\p{M}︀-️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}]/u;

const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;

const ZWJ = "‍";

export function approximateGraphemes(text: string): number {
  let count = 0;
  let joined = false;
  let openFlag = false;
  let previous = "";
  for (const char of text.normalize("NFC")) {
    const after = previous;
    previous = char;
    if (char === ZWJ) {
      joined = count > 0;
      continue;
    }
    if (joined) {
      joined = false;
      continue;
    }
    if (EXTENDS_PREVIOUS.test(char) && count > 0) continue;
    if (char === "\n" && after === "\r") continue;
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
