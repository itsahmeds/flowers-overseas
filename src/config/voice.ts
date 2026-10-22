/**
 * The voice register (spec 004 §14 A5; spec 007 AC-2; TASK-087).
 *
 * The nine words spec 004 §14 A5 bans from customer copy, in one place, and their German and Polish
 * forms (spec 003 §14 A15 clause 5; TASK-185).
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
 * The same nine words in German and Polish (spec 003 §14 A15 clause 5, advisor fix 3; TASK-185).
 * The English list alone would let "Netzwerk" or "pośrednik" through a drafted `de`/`pl` value, so
 * these sit beside it and `bannedVoiceWordsIn()` matches them with the same rule: no word
 * boundary, case-insensitive, a hyphen read as "hyphen or space". Each entry is a form that is
 * not already caught by another entry; where an inflected form does not contain its base form it
 * is listed too ("sieć" does not match "sieci"; "pośrednik" does not match "pośrednicy", which
 * "pośrednic" does). Stems are deliberate: "dostawc" takes dostawca, dostawcy and dostawców and
 * leaves "dostawa" (delivery) alone.
 *
 * They are matched in every prose a caller scans, not only in `de`/`pl` messages, because none of
 * them is an English word: the scan stays one rule for every reader. "Sprzedawca" (the seller on
 * a Polish invoice, which is us) is not a form of "vendor" here and is not listed.
 *
 * `BANNED_VOICE_WORDS` keeps the nine English words, which `docs/design/README.md` §Voice pins.
 */
export const BANNED_VOICE_FORMS = {
  de: [
    // relay
    "Relais",
    "Vermittl",
    "vermittel",
    // corridor
    "Korridor",
    // partner (the English entry already matches it; listed so every word has its German form)
    "Partner",
    // third party
    "Drittanbieter",
    "Drittpartei",
    "dritte Partei",
    "dritten Partei",
    // vendor
    "Anbieter",
    "Lieferant",
    "Händler",
    "Verkäufer",
    // network
    "Netzwerk",
    // anywhere in the world
    "weltweit",
    "überall auf der Welt",
    // super fresh
    "superfrisch",
    "super-frisch",
  ],
  pl: [
    // relay
    "pośrednik",
    "pośrednic",
    "przekaźnik",
    // corridor
    "korytarz",
    // partner
    "partner",
    // third party
    "strona trzecia",
    "strony trzeciej",
    "stronie trzeciej",
    "stronę trzecią",
    "stroną trzecią",
    "stron trzecich",
    "stronom trzecim",
    "stronami trzecimi",
    "stronach trzecich",
    // vendor
    "dostawc",
    // network
    "sieć",
    "sieci",
    // anywhere in the world
    "na całym świecie",
    "gdziekolwiek na świecie",
    "wszędzie na świecie",
    // super fresh
    "superśwież",
    "super-śwież",
  ],
} as const;

export type BannedVoiceForm =
  | (typeof BANNED_VOICE_FORMS.de)[number]
  | (typeof BANNED_VOICE_FORMS.pl)[number];

/** What `bannedVoiceWordsIn()` reports: an English word or a German or Polish form. */
export type BannedVoiceTerm = BannedVoiceWord | BannedVoiceForm;

/** Every term the scan reads, English first, then German, then Polish. */
export const BANNED_VOICE_TERMS: readonly BannedVoiceTerm[] = [
  ...BANNED_VOICE_WORDS,
  ...BANNED_VOICE_FORMS.de,
  ...BANNED_VOICE_FORMS.pl,
];

/**
 * The **one** sanctioned use of a banned word (spec 004 §14 **A22** clause 2; founder, 2026-10-04,
 * in chat: "Allow \"my partner\""). A22 keeps "partner" banned for florists and allows the home
 * sentence's "who it's for" option to read exactly "my partner". The exception is the exact ICU
 * select case `partner {my partner}`, in the value of `home.sentence.who`, in the English
 * catalogues only (`en`, `en-gb`). Per A22's default for its open item (i), `de` and `pl` render
 * the option without the letters "partner" at all, so no exception reaches them. Anything else
 * fails: "my partner" as prose, under another key or another case (`friend {my partner}`), with
 * anything after it inside the braces (`partner {my partner florist}`), or in `de`/`pl`. Nothing
 * else may be added here without a spec amendment (PR 174 review round 1, R1).
 */
export const VOICE_EXCEPTIONS = [
  {
    locales: ["en", "en-gb"],
    messageKey: "home.sentence.who",
    token: "partner {my partner}",
  },
] as const;

export interface VoiceExceptionRule {
  readonly locales: readonly string[];
  readonly messageKey: string;
  readonly token: string;
}

export interface BannedVoiceOptions {
  /** The catalogue the prose comes from, when it is a message (`en`, `de` …). */
  readonly locale?: string;
  /** The catalogue key the prose is the value of, when it is a message. */
  readonly messageKey?: string;
  /** The exceptions to honour; `VOICE_EXCEPTIONS` unless a test mutates it. */
  readonly exceptions?: readonly VoiceExceptionRule[];
  /** The terms to match; `BANNED_VOICE_TERMS` unless a test removes a list to watch a case go red. */
  readonly terms?: readonly BannedVoiceTerm[];
}

/**
 * `prose` with each sanctioned token removed: only in a message value, only under the rule's key,
 * only in the rule's locales, and only as the whole select case — the token must start the value
 * or follow whitespace or a brace, so `myfriend partner {my partner}` and the like do not slip
 * through, and it ends at the case's closing brace, so nothing can follow the phrase.
 */
function withoutExceptions(prose: string, options: BannedVoiceOptions): string {
  const { locale, messageKey } = options;
  if (locale === undefined || messageKey === undefined) return prose;
  const rules = (options.exceptions ?? VOICE_EXCEPTIONS).filter(
    (rule) => rule.messageKey === messageKey && rule.locales.includes(locale),
  );
  return rules.reduce((text, rule) => {
    const token = rule.token.replaceAll(/[{}]/g, (brace) => `\\${brace}`);
    return text.replaceAll(new RegExp(`(?<=^|[\\s{}])${token}`, "gu"), " ");
  }, prose);
}

/**
 * The banned words that appear in one piece of prose, each named once, in list order: the nine
 * English words, then the German and Polish forms (`BANNED_VOICE_FORMS`).
 *
 * **No word boundaries, on purpose** (`/review 63`): "networked" trips `network` and "vendors"
 * trips `vendor`. The rule is over-inclusive, which is the safe direction for a copy ban — a
 * false positive costs one rewording, a false negative ships the word. Do not "fix" this with
 * `\b` without changing spec 004 §14 A5 first; the reading is recorded in spec 007 §14 A1.
 *
 * A caller scanning a message passes its `locale` and `messageKey`, and only then can A22's
 * exception apply.
 */
export function bannedVoiceWordsIn(
  prose: string,
  options: BannedVoiceOptions = {},
): readonly BannedVoiceTerm[] {
  const scanned = withoutExceptions(prose, options);
  const terms = options.terms ?? BANNED_VOICE_TERMS;
  return terms.filter((word) =>
    new RegExp(word.replaceAll("-", "[- ]"), "iu").test(scanned),
  );
}
