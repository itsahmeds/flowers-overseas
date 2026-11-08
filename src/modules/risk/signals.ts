/**
 * `cardMessageMatches` (spec 021 §5.2 "Signals" S15, §7 "Locale-aware matching", AC-13;
 * TASK-493): whether a card message or "sign as" asks for a payment, a money transfer, crypto or
 * a gift card. Answers a boolean only: the text is read in memory and never stored, logged or
 * returned. The velocity queries over `risk_identity` join this file with the gate (TASK-494).
 *
 * The text is NFKC-normalised and case-folded; a word of any locale's list matches only between
 * non-letters and non-digits; an IBAN shape counts only with a valid mod-97 checksum; Bitcoin
 * (bech32 and legacy) and Ethereum address shapes count as they are.
 */
import {
  CARD_MESSAGE_SHAPES,
  CARD_MESSAGE_WORDS,
} from "@/config/risk/card-message-patterns";

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

let wordPatterns: readonly RegExp[] | undefined;

function words(): readonly RegExp[] {
  wordPatterns ??= Object.values(CARD_MESSAGE_WORDS)
    .flat()
    .map(
      (word) =>
        new RegExp(
          `(?<![\\p{L}\\p{N}])${escape(word.normalize("NFKC").toLowerCase()).replace(/ /gu, "\\s+")}(?![\\p{L}\\p{N}])`,
          "u",
        ),
    );
  return wordPatterns;
}

/** The ISO 13616 mod-97 check of an IBAN candidate (spaces already removed). */
export function ibanChecksumValid(candidate: string): boolean {
  const iban = candidate.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = /\d/u.test(character)
      ? character
      : String(character.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function hasIban(folded: string): boolean {
  for (const match of folded.matchAll(CARD_MESSAGE_SHAPES.iban)) {
    if (ibanChecksumValid(match[0].replace(/ /gu, ""))) return true;
  }
  return false;
}

/** True when any of `texts` (card message, "sign as") matches a pattern. Never logs. */
export function cardMessageMatches(
  ...texts: readonly (string | null | undefined)[]
): boolean {
  return texts.some((text) => {
    if (text === null || text === undefined || text.trim() === "") return false;
    const normal = text.normalize("NFKC");
    const folded = normal.toLowerCase();
    return (
      words().some((pattern) => pattern.test(folded)) ||
      hasIban(folded) ||
      CARD_MESSAGE_SHAPES.bitcoin.test(normal) ||
      CARD_MESSAGE_SHAPES.ethereum.test(normal)
    );
  });
}
