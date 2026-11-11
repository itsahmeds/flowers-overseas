/**
 * The words spec 022a's buyer copy never uses (AC-9; founder 2026-10-14: no refund, problem or
 * failure wording after payment; UCPD Annex I 23c and DMCC Sch. 20: no incentive), and the scan
 * that reads them (TASK-370, TASK-371). Stems match case-insensitively at a word start; `de` and
 * `pl` text is held to the English list too, because their drafts can echo English. Relay words
 * are not here: `relayMatches` in `src/config/honesty.ts` is the one list.
 */
export const REVIEW_NEGATIVE_STEMS = {
  en: [
    "refund",
    "cancel",
    "problem",
    "complaint",
    "complain",
    "sorry",
    "unfortunately",
    "wrong",
    "fail",
  ],
  de: [
    "rückerstatt",
    "erstatt",
    "storn",
    "problem",
    "beschwerde",
    "reklamation",
    "leider",
    "entschuldig",
    "falsch",
    "fehlgeschlagen",
    "fehler",
  ],
  pl: [
    "zwrot",
    "anul",
    "problem",
    "reklamac",
    "skarg",
    "przeprasz",
    "niestety",
    "błęd",
    "błąd",
    "nieudan",
  ],
} as const;

/** Incentive words (Annex I 23c; DMCC Sch. 20): nothing is offered for a review, in any copy. */
export const REVIEW_INCENTIVE_STEMS = {
  en: [
    "discount",
    "voucher",
    "code",
    "coupon",
    "prize",
    "win",
    "free",
    "reward",
    "gift",
  ],
  de: [
    "rabatt",
    "gutschein",
    "code",
    "coupon",
    "preisausschreiben",
    "gewinn",
    "gratis",
    "kostenlos",
    "belohn",
    "geschenk",
  ],
  pl: [
    "rabat",
    "zniżk",
    "kupon",
    "kod",
    "nagrod",
    "wygra",
    "darmow",
    "gratis",
    "prezent",
  ],
} as const;

type ScanLocale = keyof typeof REVIEW_NEGATIVE_STEMS;

function scanLocale(locale: string): ScanLocale {
  return locale === "de" || locale === "pl" ? locale : "en";
}

/** Every negative-framing or incentive stem found in `text`. Empty means clean. */
export function reviewCopyHits(text: string, locale: string): string[] {
  const key = scanLocale(locale);
  const stems = new Set<string>([
    ...REVIEW_NEGATIVE_STEMS.en,
    ...REVIEW_NEGATIVE_STEMS[key],
    ...REVIEW_INCENTIVE_STEMS.en,
    ...REVIEW_INCENTIVE_STEMS[key],
  ]);
  return [...stems].filter((stem) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${stem}`, "iu").test(text),
  );
}
