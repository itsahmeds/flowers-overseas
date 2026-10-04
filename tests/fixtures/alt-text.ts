/**
 * Alt texts for `product_media_alt_alt_check` and `AltEntrySchema` (spec 002 AC-11, §8; spec 006
 * AC-8; TASK-017 holes 3 and 7 on PR 184).
 *
 * `UNANNOUNCED_ALTS` are eight-character alts a screen reader announces as nothing: every blank
 * character, the zero-width, bidi and invisible-operator controls, the soft hyphen, the braille
 * blank, the Hangul fillers (letters that render as nothing), variation selectors, a tag
 * character, a control character and a lone combining mark. The database and the seed schema
 * must refuse each one. `REAL_ALTS` are alts in several scripts that both must accept.
 *
 * Built from code points, so this file stays ASCII and no invisible character hides in source.
 */

const at = (code: number): readonly [string, number] => [
  `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
  code,
];

const range = (
  from: number,
  to: number,
): readonly (readonly [string, number])[] =>
  Array.from({ length: to - from + 1 }, (_, index) => at(from + index));

/** One code point each, named; repeated eight times below to pass the seed's length floor. */
export const UNANNOUNCED_CHARACTERS: readonly (readonly [string, number])[] = [
  // Blank: ASCII whitespace and the Unicode spaces (hole 3).
  at(0x09),
  at(0x0a),
  at(0x0b),
  at(0x0c),
  at(0x0d),
  at(0x20),
  at(0x85),
  at(0xa0),
  at(0x1680),
  at(0x180e),
  ...range(0x2000, 0x200f),
  at(0x2028),
  at(0x2029),
  at(0x202f),
  at(0x205f),
  at(0x2060),
  at(0x3000),
  at(0xfeff),
  // Invisible but not blank (hole 7).
  at(0x1f),
  at(0xad),
  at(0x0301),
  at(0x034f),
  at(0x061c),
  at(0x115f),
  at(0x1160),
  at(0x180b),
  ...range(0x202a, 0x202e),
  ...range(0x2061, 0x2064),
  ...range(0x2066, 0x206a),
  at(0x2800),
  at(0x3164),
  at(0xfe0f),
  at(0xffa0),
  at(0xe0020),
];

export const UNANNOUNCED_ALTS: readonly (readonly [string, string])[] = [
  ...UNANNOUNCED_CHARACTERS.map(([name, code]): readonly [string, string] => [
    name,
    String.fromCodePoint(code).repeat(8),
  ]),
  ["CRLF", "\r\n".repeat(4)],
  ["space, tab, space", " \t ".repeat(3)],
  [
    "NBSP, ZWSP, U+3000, BOM",
    String.fromCodePoint(0xa0, 0x200b, 0x3000, 0xfeff).repeat(2),
  ],
  [
    "LRM, soft hyphen, Hangul filler, VS16",
    String.fromCodePoint(0x200e, 0xad, 0x3164, 0xfe0f).repeat(2),
  ],
  ["a combining mark on a space", " ́".repeat(4)],
];

export const REAL_ALTS: readonly string[] = [
  "Twelve red roses in a kraft wrap",
  `Twelve${String.fromCodePoint(0xa0)}red roses`,
  "Dwanaście czerwonych róż",
  "赤いバラの花束です",
  "장미 열두 송이",
  "باقة ورد",
  "गुलाब का गुलदस्ता",
  `${String.fromCodePoint(0x3000)}   roses   ${String.fromCodePoint(0xfeff)}`,
  `${String.fromCodePoint(0x3164).repeat(7)}a`,
  "12 roses",
];
