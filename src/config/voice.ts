/**
 * The voice register (spec 004 §14 A5; spec 007 AC-2; TASK-087).
 *
 * The nine words spec 004 §14 A5 bans from customer copy, in one place.
 *
 * The list was born inside `tests/unit/design-docs.test.ts`, which is the right place to *assert*
 * it and the wrong place to *keep* it: spec 007's `pnpm corridor:check` has to fail a corridor
 * guide that says "our partner florist", and a gate that copied the nine words would agree with
 * itself and drift from the test the day a tenth word is banned. So the list moved here — the
 * registry directory, beside `countries.ts` and `site-links.ts` — and both readers import it.
 *
 * Two properties are deliberate:
 *
 *  - **The words are matched, not the punctuation.** `bannedVoiceWordsIn()` treats a hyphen as
 *    "hyphen or space", so "third party" and "third-party" are one entry rather than two, exactly
 *    as the artboard scan has always done.
 *  - **It is prose that is scanned, never an identifier.** `corridorPagePublished`,
 *    `catalog.availability.noPartner` and `third-party-script` are names the code and the CSP use;
 *    the callers decide what counts as prose (a message *value*, an artboard's text, a corridor
 *    guide's body) and this file decides nothing about where to look.
 *
 * `docs/design/README.md` §Voice is the human-readable source of the same rule and is pinned
 * against this list by `tests/unit/design-docs.test.ts`.
 */

/**
 * The nine words. "corridor" is the one with an exemption: it may appear inside an `[internal]`
 * annotation block on an artboard (it is our word for the page type, not the buyer's), which is
 * the artboard scan's business — a corridor *guide* a buyer reads may never use it.
 */
export const BANNED_VOICE_WORDS = [
  "relay",
  "corridor",
  "partner",
  "third party",
  "third-party",
  "vendor",
  "network",
  "anywhere in the world",
  "super fresh",
] as const;

export type BannedVoiceWord = (typeof BANNED_VOICE_WORDS)[number];

/**
 * The **one** sanctioned use of a banned word (spec 004 §14 **A22**; founder, 2026-10-04, in chat:
 * "Allow \"my partner\""). A22 keeps "partner" banned for florists and allows exactly the phrase
 * "my partner" as the home sentence's "who it's for" option. So the exception is pinned to both
 * the **message key** and the **exact phrase**: "my partner" anywhere else, "our partner", or
 * "my partner florist" still fails. Nothing else may be added here without a spec amendment.
 */
export const VOICE_EXCEPTIONS = [
  { messageKey: "home.sentence.who", phrase: "my partner" },
] as const;

export interface VoiceExceptionRule {
  readonly messageKey: string;
  readonly phrase: string;
}

export interface BannedVoiceOptions {
  /** The catalogue key the prose is the value of, when it is a message; enables A22's exception. */
  readonly messageKey?: string;
  /** The exceptions to honour; `VOICE_EXCEPTIONS` unless a test mutates it. */
  readonly exceptions?: readonly VoiceExceptionRule[];
}

/**
 * `prose` with each sanctioned phrase removed, unless a florist noun follows it. In an ICU value
 * the phrase is a select branch whose keyword is its own last word (`partner {my partner}`). That
 * keyword is syntax, not prose, so under the exception's key it is dropped; the branch text is
 * scanned as prose like any other, so `partner {our partner}` still fails.
 */
function withoutExceptions(prose: string, options: BannedVoiceOptions): string {
  const rules = (options.exceptions ?? VOICE_EXCEPTIONS).filter(
    (rule) => rule.messageKey === options.messageKey,
  );
  return rules.reduce((text, rule) => {
    const keyword = rule.phrase.split(" ").at(-1) ?? rule.phrase;
    // The select keyword is syntax in every locale's value (`partner {meinen Schatz}`); the
    // branch text after it is still prose and is still scanned.
    return text.replaceAll(`${keyword} {`, " {").replaceAll(
      // Exact, lower-case phrase; not when a florist noun follows ("my partner florist").
      new RegExp(
        `(?<![\\p{L}])${rule.phrase}(?![\\p{L}]|[- ]?(?:florist|shop|network))`,
        "gu",
      ),
      " ",
    );
  }, prose);
}

/**
 * The banned words that appear in one piece of prose, each named once, in list order.
 *
 * **No word boundaries, on purpose** (`/review 63`): "networked" trips `network` and "vendors"
 * trips `vendor`. The rule is over-inclusive, which is the safe direction for a copy ban — a
 * false positive costs one rewording, a false negative ships the word. Do not "fix" this with
 * `\b` without changing spec 004 §14 A5 first; the reading is recorded in spec 007 §14 A1.
 *
 * A caller scanning a message passes its `messageKey`, and only then can A22's exception apply.
 */
export function bannedVoiceWordsIn(
  prose: string,
  options: BannedVoiceOptions = {},
): readonly BannedVoiceWord[] {
  const scanned = withoutExceptions(prose, options);
  return BANNED_VOICE_WORDS.filter((word) =>
    new RegExp(word.replaceAll("-", "[- ]"), "i").test(scanned),
  );
}
