/**
 * `ACCUSATION_PATTERNS` and `accusationMatches` (spec 021 §8 "No accusation, positive framing
 * after purchase", AC-30; TASK-493): no buyer surface, email, catalogue key or PDF the buyer may
 * see mentions fraud, suspicion, review, verification, flags, blocks or risk. `de` and `pl` read
 * the `en` list too (their drafts echo the English, as `relayMatches` does).
 */
export type AccusationLocale = "en" | "de" | "pl";

export interface AccusationPattern {
  readonly id: string;
  readonly pattern: RegExp;
}

const word = (stem: string, tail = ""): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])${stem}${tail}(?![\\p{L}\\p{N}])`, "iu");
const prefix = (stem: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])${stem}`, "iu");

/** Every accusation pattern, by locale. */
export const ACCUSATION_PATTERNS: Readonly<
  Record<AccusationLocale, readonly AccusationPattern[]>
> = {
  en: [
    { id: "en.fraud", pattern: prefix("fraud") },
    { id: "en.suspicious", pattern: prefix("suspicio") },
    { id: "en.suspected", pattern: prefix("suspect") },
    { id: "en.verify_identity", pattern: /verify\s+your\s+identity/iu },
    { id: "en.verification", pattern: prefix("verification") },
    { id: "en.security_check", pattern: /security\s+(check|review)/iu },
    { id: "en.under_review", pattern: /under\s+(?:\p{L}+\s+)?review/iu },
    { id: "en.flagged", pattern: word("flagged") },
    { id: "en.blocked", pattern: word("block", "(ed|ing)?") },
    { id: "en.risk", pattern: word("risk", "(s|y)?") },
  ],
  de: [
    { id: "de.betrug", pattern: prefix("betrug") },
    { id: "de.verdacht", pattern: prefix("verd(ä|a)cht") },
    {
      id: "de.identitaet",
      pattern: /identit(ä|a)t\s+(best(ä|a)tigen|pr(ü|u)fen)/iu,
    },
    { id: "de.sicherheit", pattern: prefix("sicherheitspr(ü|u)fung") },
    { id: "de.ueberpruefung", pattern: prefix("(ü|u)berpr(ü|u)fung") },
    { id: "de.gesperrt", pattern: prefix("gesperrt") },
    { id: "de.markiert", pattern: word("markiert") },
    { id: "de.risiko", pattern: prefix("risiko") },
  ],
  pl: [
    { id: "pl.oszustwo", pattern: prefix("oszust") },
    { id: "pl.podejrzane", pattern: prefix("podejrz") },
    { id: "pl.weryfikacja", pattern: prefix("weryfik") },
    { id: "pl.kontrola", pattern: /kontrol\p{L}*\s+bezpiecze/iu },
    { id: "pl.zablokowane", pattern: prefix("zablokow") },
    { id: "pl.oznaczone", pattern: prefix("oznaczon") },
    { id: "pl.ryzyko", pattern: prefix("ryzyk") },
  ],
};

function accusationLocale(locale: string): AccusationLocale {
  const language = locale.toLowerCase().split("-")[0];
  return language === "de" || language === "pl" ? language : "en";
}

/** The ids of every pattern `text` matches in `locale` (and in `en`). Empty means clean. */
export function accusationMatches(
  text: string,
  locale: string,
  patterns: Readonly<
    Record<AccusationLocale, readonly AccusationPattern[]>
  > = ACCUSATION_PATTERNS,
): readonly string[] {
  const key = accusationLocale(locale);
  const lists: readonly AccusationLocale[] =
    key === "en" ? ["en"] : [key, "en"];
  return lists.flatMap((list) =>
    patterns[list]
      .filter((entry) => entry.pattern.test(text))
      .map((entry) => entry.id),
  );
}
