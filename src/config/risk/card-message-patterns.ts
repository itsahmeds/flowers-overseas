/**
 * The card-message patterns of signal S15 (spec 021 §5.2 "Signals", §7 "Locale-aware matching",
 * AC-13; TASK-493): per-locale words for payment, money transfer, crypto and gift-card requests
 * (en, de, pl), plus locale-free shapes (IBAN, Bitcoin and Ethereum addresses). The matcher
 * (`cardMessageMatches` in the risk module) NFKC-normalises and casefolds the text first and
 * matches a word only between non-letters, so "Gutschein-Code" matches and "Kocham" does not.
 *
 * Words are lower case. A pattern answers yes or no only; no text is ever stored or logged.
 */
export const CARD_MESSAGE_WORDS: Readonly<
  Record<"en" | "de" | "pl", readonly string[]>
> = {
  en: [
    "bank transfer",
    "wire transfer",
    "money transfer",
    "send money",
    "send me money",
    "account number",
    "sort code",
    "iban",
    "gift card",
    "giftcard",
    "gift voucher",
    "voucher code",
    "itunes card",
    "google play card",
    "steam card",
    "western union",
    "moneygram",
    "bitcoin",
    "crypto",
    "usdt",
    "paypal.me",
  ],
  de: [
    "überweisung",
    "überweisen",
    "kontonummer",
    "bankverbindung",
    "gutschein",
    "geschenkkarte",
    "paysafecard",
    "krypto",
  ],
  pl: [
    "przelew",
    "przelać",
    "numer konta",
    "karta podarunkowa",
    "karty podarunkowej",
    "kartę podarunkową",
    "kod blik",
    "blik",
    "kod doładowania",
    "kryptowaluta",
    "kryptowaluty",
  ],
};

/**
 * Locale-free shapes. An IBAN (two letters, two check digits, 11 to 30 alphanumerics, whole or in
 * groups of four) is found by the matcher's own scan and counts only with a valid mod-97 checksum.
 */
export const CARD_MESSAGE_SHAPES = {
  /** Bitcoin bech32 (`bc1…`) and legacy base58 (`1…`, `3…`) addresses. */
  bitcoin:
    /\b(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/u,
  /** An Ethereum address. */
  ethereum: /\b0x[a-f0-9]{40}\b/iu,
} as const;
