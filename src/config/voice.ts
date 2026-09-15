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

/** The banned words that appear in one piece of prose, each named once, in list order. */
export function bannedVoiceWordsIn(prose: string): readonly BannedVoiceWord[] {
  return BANNED_VOICE_WORDS.filter((word) =>
    new RegExp(word.replaceAll("-", "[- ]"), "i").test(prose),
  );
}
