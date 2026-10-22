/**
 * Relay-language check (spec 041 §14), and the claim, scale and price-literal patterns the
 * corridor and info-page gates share (spec 041 §2; TASK-182).
 *
 * The canonical definition is spec 041 §14 A-founder-2026-10-14; spec 010 §14 A4.3 AC-51, spec 013
 * AC-41, spec 016 AC-38 and spec 018 §7 AC-38 to AC-43 cite it (TASK-226).
 *
 * The founder's ruling, 2026-10-14: buyers never learn that we relay an order to a partner
 * florist. No buyer-facing string says "partner", that a florist accepts, declines, offers or
 * takes an order, re-routing, "another florist", "no florist", "finding a florist", "until a
 * florist", or that a card is held or authorised. The voice stays: "we" send it, "our florist"
 * makes it.
 *
 * One list, one matcher, one exemption mechanism. Every scan (the catalogue unit scan, the
 * rendered-HTML e2e scans, `pnpm pages:check`, spec 018's `check-relay-language`) calls
 * `relayMatches` and reads `RELAY_EXEMPT`; no spec keeps a fixture list of its own.
 *
 *  - **Context-free** patterns fail wherever they match.
 *  - **In-context** patterns fail only when the same sentence also carries the locale's word for
 *    florist (and, for most, for order). So "Your bank declined this card", the consent banner's
 *    "Accept all" and "We are not taking orders yet" pass, while "until our florist accepts your
 *    order" and "Where our florist offers a slot" fail.
 *
 * Matching is case-insensitive with Unicode word boundaries (a letter, digit or underscore on
 * either side breaks the match, so "household" never trips `hold`). A stem pattern (`partner*`)
 * takes any letters after it. The `de` and `pl` term lists are spec 018 §7's drafts and stay
 * **proposed** until the native reviewer queue signs them off; `en-gb` reads `en`.
 */

import { DELIVERY_TIMING_PATTERN } from "../../seed/copy.ts";

/** The locales that own a pattern list; `en-gb` reads `en`. */
export type RelayLocale = "en" | "de" | "pl";

/** Which words must share the sentence for an in-context pattern to fail. */
export type RelayContext = "none" | "florist" | "floristOrOrder";

export interface RelayPattern {
  /** Stable name, reported with each match. */
  readonly id: string;
  /** The term, matched case-insensitively between Unicode word boundaries. */
  readonly pattern: RegExp;
  /** `none` for a context-free pattern; otherwise the words the sentence must also carry. */
  readonly context: RelayContext;
  /** A sentence the pattern must flag (asserted by the unit test). */
  readonly mustMatch: string;
  /** A sentence the pattern must pass (asserted by the unit test). */
  readonly mustNotMatch: string;
}

const LETTER = String.raw`[\p{L}\p{N}_]`;

/** `source` between Unicode word boundaries, case-insensitive. */
function term(source: string): RegExp {
  return new RegExp(`(?<!${LETTER})(?:${source})(?!${LETTER})`, "iu");
}

/** Any further letters: a stem such as `partner*`. */
const STEM = String.raw`\p{L}*`;

const EN: readonly RelayPattern[] = [
  {
    id: "partner",
    pattern: term(`partner${STEM}`),
    context: "none",
    mustMatch: "Your order goes to our partner florist.",
    mustNotMatch: "Our florist makes it.",
  },
  {
    id: "reroute",
    pattern: term(`re-?rout${STEM}`),
    context: "none",
    mustMatch: "We are rerouting your order.",
    mustNotMatch: "The route is short.",
  },
  {
    id: "another-florist",
    pattern: term(String.raw`another\s+florist${STEM}`),
    context: "none",
    mustMatch: "We will find another florist.",
    mustNotMatch: "Choose another bouquet.",
  },
  {
    id: "no-florist",
    pattern: term(String.raw`no\s+florist${STEM}`),
    context: "none",
    mustMatch: "There is no florist in that town.",
    mustNotMatch: "No flowers cross a border.",
  },
  {
    id: "finding-a-florist",
    pattern: term(String.raw`finding\s+a\s+florist${STEM}`),
    context: "none",
    mustMatch: "We are finding a florist for you.",
    mustNotMatch: "Finding a date is easy.",
  },
  {
    id: "florist-available",
    pattern: term(String.raw`florist${STEM}\s+available`),
    context: "none",
    mustMatch: "No florist available on that day.",
    mustNotMatch: "Where a morning or afternoon slot is available",
  },
  {
    id: "until-a-florist",
    pattern: term(String.raw`until\s+(?:a|our|the)\s+florist${STEM}`),
    context: "none",
    mustMatch: "Free to cancel until a florist accepts.",
    mustNotMatch: "Free to cancel until we start preparing your order.",
  },
  {
    id: "held",
    pattern: term("held"),
    context: "none",
    mustMatch: "Your card is held.",
    mustNotMatch: "Nothing was charged.",
  },
  {
    id: "hold",
    pattern: term(String.raw`(?:on\s+)?hold(?:s|ing)?`),
    context: "none",
    mustMatch: "Your payment is on hold.",
    mustNotMatch: "Water the household plants.",
  },
  {
    id: "authorise",
    pattern: term(`authori[sz]${STEM}`),
    context: "none",
    mustMatch: "We authorise your card today.",
    mustNotMatch: "The author of this guide lives in Kraków.",
  },
  {
    id: "accept",
    pattern: term(`accept${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Free to cancel until our florist accepts your order.",
    mustNotMatch: "Accept all",
  },
  {
    id: "decline",
    pattern: term(`declin${STEM}`),
    context: "floristOrOrder",
    mustMatch: "If our florist declines, we tell you.",
    mustNotMatch: "Your bank declined this card.",
  },
  {
    id: "offer",
    pattern: term(`offer${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Where our florist offers a slot",
    mustNotMatch: "We offer three sizes.",
  },
  {
    id: "take",
    pattern: term("take|takes|taking|took|taken"),
    context: "florist",
    mustMatch: "None of our florists can take this delivery.",
    mustNotMatch: "We are not taking orders yet.",
  },
  {
    // Plain relay wording (a florist who signed up to take our orders), named by the finisher's
    // work order for PR 225 after the breaker's H6; context-free like "partner".
    id: "agreed-to-work-with-us",
    pattern: term(String.raw`agree(?:s|d|ing)?\s+to\s+work\s+with\s+us`),
    context: "none",
    mustMatch: "Each florist has agreed to work with us.",
    mustNotMatch: "We work with care.",
  },
];

const DE: readonly RelayPattern[] = [
  {
    id: "de-partner",
    pattern: term(`partner${STEM}`),
    context: "none",
    mustMatch: "Unser Partnerflorist bindet den Strauß.",
    mustNotMatch: "Unser Florist bindet den Strauß.",
  },
  {
    id: "de-umleiten",
    pattern: term(`umleit${STEM}`),
    context: "none",
    mustMatch: "Wir müssen Ihre Bestellung umleiten.",
    mustNotMatch: "Wir liefern am Morgen.",
  },
  {
    id: "de-anderer-florist",
    pattern: term(String.raw`anderen?\s+florist${STEM}`),
    context: "none",
    mustMatch: "Wir suchen einen anderen Floristen.",
    mustNotMatch: "Wählen Sie einen anderen Strauß.",
  },
  {
    id: "de-kein-florist",
    pattern: term(String.raw`kein(?:e|en|er)?\s+florist${STEM}`),
    context: "none",
    mustMatch: "Kein Florist hat Zeit.",
    mustNotMatch: "Kein Zoll, keine Gebühr.",
  },
  {
    id: "de-florist-finden",
    pattern: term(String.raw`florist${STEM}\s+(?:zu\s+)?finden`),
    context: "none",
    mustMatch: "Wir versuchen, einen Floristen zu finden.",
    mustNotMatch: "Sie finden hier alle Termine.",
  },
  {
    id: "de-reserviert",
    pattern: term(`reserviert${STEM}`),
    context: "none",
    mustMatch: "Der Betrag ist auf Ihrer Karte reserviert.",
    mustNotMatch: "Es wurde nichts abgebucht.",
  },
  {
    id: "de-reservierung",
    pattern: term(`reservierung${STEM}`),
    context: "none",
    mustMatch: "Die Reservierung auf Ihrer Karte endet.",
    mustNotMatch: "Die Zahlung ist abgeschlossen.",
  },
  {
    id: "de-autorisieren",
    pattern: term(`autorisier${STEM}`),
    context: "none",
    mustMatch: "Wir autorisieren Ihre Karte.",
    mustNotMatch: "Wir belasten Ihre Karte bei der Bestellung.",
  },
  {
    id: "de-akzeptieren",
    pattern: term(`akzeptier${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Bis unser Florist Ihre Bestellung akzeptiert.",
    mustNotMatch: "Alle akzeptieren",
  },
  {
    id: "de-ablehnen",
    pattern: term(`ablehn${STEM}|abgelehnt${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Unser Florist hat die Bestellung abgelehnt.",
    mustNotMatch: "Ihre Bank hat diese Karte abgelehnt.",
  },
  {
    id: "de-angebot",
    pattern: term(`angebot${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Wo unser Florist ein Zeitfenster als Angebot macht",
    mustNotMatch: "Unser Angebot an Rosen wechselt mit der Saison.",
  },
];

const PL: readonly RelayPattern[] = [
  {
    id: "pl-partner",
    pattern: term(`partner${STEM}`),
    context: "none",
    mustMatch: "Nasz partner florysta zrobi bukiet.",
    mustNotMatch: "Nasz florysta zrobi bukiet.",
  },
  {
    id: "pl-przekierowanie",
    pattern: term(`przekier${STEM}`),
    context: "none",
    mustMatch: "Przekierujemy zamówienie.",
    mustNotMatch: "Dostarczymy bukiet rano.",
  },
  {
    id: "pl-innego-florysty",
    pattern: term(String.raw`innego\s+florysty`),
    context: "none",
    mustMatch: "Szukamy innego florysty.",
    mustNotMatch: "Wybierz innego dnia.",
  },
  {
    id: "pl-brak-florysty",
    pattern: term(String.raw`brak\s+florysty`),
    context: "none",
    mustMatch: "Brak florysty w tym mieście.",
    mustNotMatch: "Brak opłat celnych.",
  },
  {
    id: "pl-znalezc-florysty",
    pattern: term(String.raw`znaleźć\s+florysty`),
    context: "none",
    mustMatch: "Nie udało się znaleźć florysty.",
    mustNotMatch: "Tu można znaleźć daty dostaw.",
  },
  {
    id: "pl-zablokowane",
    pattern: term(`zablokowan${STEM}`),
    context: "none",
    mustMatch: "Kwota jest zablokowana na karcie.",
    mustNotMatch: "Nic nie zostało pobrane.",
  },
  {
    id: "pl-autoryzacja",
    pattern: term(`autoryzac${STEM}`),
    context: "none",
    mustMatch: "Trwa autoryzacja karty.",
    mustNotMatch: "Płatność pobieramy przy zamówieniu.",
  },
  {
    id: "pl-zaakceptowac",
    pattern: term(`zaakcept${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Do czasu, aż florysta zaakceptuje zamówienie.",
    mustNotMatch: "Zaakceptuj wszystkie",
  },
  {
    id: "pl-odrzucic",
    pattern: term(`odrzuc${STEM}|odrzucon${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Florysta odrzucił zamówienie.",
    mustNotMatch: "Bank odrzucił tę kartę.",
  },
  {
    id: "pl-oferta",
    pattern: term(`ofert${STEM}`),
    context: "floristOrOrder",
    mustMatch: "Gdzie nasz florysta ma ofertę godzin dostawy",
    mustNotMatch: "Nasza oferta róż zmienia się z sezonem.",
  },
];

/**
 * Every relay pattern, by locale (`en-gb` reads `en`). A list emptied for any locale fails the
 * unit test, as does a pattern whose own `mustMatch` passes or `mustNotMatch` fails.
 */
export const RELAY_PATTERNS: Readonly<
  Record<RelayLocale, readonly RelayPattern[]>
> = {
  en: EN,
  de: DE,
  pl: PL,
};

/** The words an in-context pattern needs beside it, per locale. */
const CONTEXT_WORDS: Readonly<
  Record<RelayLocale, Readonly<Record<"florist" | "order", RegExp>>>
> = {
  en: { florist: term(`florist${STEM}`), order: term(`order${STEM}`) },
  de: {
    florist: term(`florist${STEM}`),
    order: term(`bestellung${STEM}`),
  },
  pl: {
    florist: term(`florys${STEM}|kwiaciar${STEM}`),
    order: term(`zamówie${STEM}`),
  },
};

/** The pattern list a locale reads: `en-gb` (and any `en-*`) reads `en`. */
export function relayLocale(locale: string): RelayLocale {
  if (locale === "de" || locale.startsWith("de-")) return "de";
  if (locale === "pl" || locale.startsWith("pl-")) return "pl";
  return "en";
}

export interface RelayMatch {
  /** The pattern's `id`. */
  readonly id: string;
  /** The text the pattern matched. */
  readonly match: string;
  /** The sentence it matched in, whitespace collapsed. */
  readonly sentence: string;
}

/**
 * `text` without inline markup: rich-text and HTML tags (`<b>`, `</em>`, `<br/>`) and markdown
 * emphasis asterisks are removed, so "no <em>florist</em>" and "another **florist**" read as the
 * phrase they render. ICU arguments (`{country}`) stay; they are data, not markup.
 */
export function stripMarkup(text: string): string {
  return text.replaceAll(/<\/?[a-z][^<>]*>/giu, "").replaceAll(/\*+/gu, "");
}

/**
 * Sentences: split after `.`, `!`, `?` or `…` followed by space, and at a blank line (a paragraph
 * or block boundary). A single line break is a fold inside a sentence (YAML, markdown), so it is
 * read as a space. Markup is stripped first (`stripMarkup`).
 */
export function sentencesOf(text: string): readonly string[] {
  return stripMarkup(text)
    .split(/(?<=[.!?…])\s+|\n[^\S\n]*\n\s*/u)
    .map((sentence) => sentence.replaceAll(/\s+/gu, " ").trim())
    .filter((sentence) => sentence !== "");
}

function inContext(
  sentence: string,
  context: RelayContext,
  words: Readonly<Record<"florist" | "order", RegExp>>,
): boolean {
  if (context === "none") return true;
  if (words.florist.test(sentence)) return true;
  return context === "floristOrOrder" && words.order.test(sentence);
}

/**
 * Every relay-language match in `text`, read with `locale`'s list (`en-gb` reads `en`; `de` and
 * `pl` also read `en`, see below), in sentence order then list order. An empty array means the
 * text is clean.
 *
 * `patterns` exists for the unit test's mutations; every scan passes the default.
 */
export function relayMatches(
  text: string,
  locale: string,
  patterns: Readonly<
    Record<RelayLocale, readonly RelayPattern[]>
  > = RELAY_PATTERNS,
): readonly RelayMatch[] {
  const key = relayLocale(locale);
  // `de` and `pl` read the `en` list too: their Phase 0 drafts echo the English (spec 003 §14
  // A15), so a buyer there can be shown an English sentence, and it is held to the same rule.
  const lists: readonly RelayLocale[] = key === "en" ? ["en"] : [key, "en"];
  return sentencesOf(text).flatMap((sentence) =>
    lists.flatMap((list) =>
      patterns[list].flatMap((pattern) => {
        const found = pattern.pattern.exec(sentence);
        if (
          found === null ||
          !inContext(sentence, pattern.context, CONTEXT_WORDS[list])
        ) {
          return [];
        }
        return [{ id: pattern.id, match: found[0], sentence }];
      }),
    ),
  );
}

/**
 * One surface the relay scans do not read, with its one-line reason. Spec 041 §14 allows two
 * kinds: (a) **non-buyer surfaces** (florist, admin, founder and ops), named by message namespace
 * or route; (b) **quoted amendment records** (`specs/`, `docs/`, a legal document's dated change
 * history), named by path. Kind (c), `messageCase` (spec 041 §14 A-founder-2026-10-14c), is the
 * single string recorded under the decisions-log row of 2026-10-04 ("my partner" allowed as a who
 * option; spec 004 §14 A22 clause 2): one ICU select case, in one key, in the English catalogues,
 * which means the buyer's loved one and never a florist. It exempts that exact case text, never
 * the word.
 */
export type RelayExemption =
  | {
      readonly kind: "non-buyer-namespace";
      /** A message key prefix, ending in a dot. */
      readonly namespace: string;
      readonly reason: string;
    }
  | {
      readonly kind: "non-buyer-route";
      /** A route segment after the locale, e.g. `admin`. */
      readonly route: string;
      readonly reason: string;
    }
  | {
      readonly kind: "quoted-record";
      /** A repository path prefix. */
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "messageCase";
      /** The message key that holds the ICU select. */
      readonly key: string;
      /** The select case keyword (syntax, never scanned). */
      readonly selectCase: string;
      /** The case's whole text, exactly; any other text in that case is scanned. */
      readonly text: string;
      readonly locales: readonly string[];
      readonly reason: string;
    };

/** The only exemption mechanism. A buyer string that trips a pattern is reworded, not listed. */
export const RELAY_EXEMPT: readonly RelayExemption[] = [
  {
    kind: "non-buyer-namespace",
    namespace: "forFlorists.",
    reason:
      "Florist recruitment and florist-facing copy; florists know they are partners.",
  },
  {
    kind: "non-buyer-namespace",
    namespace: "floristAuth.",
    reason: "Florist sign-in; never shown to a buyer.",
  },
  {
    kind: "non-buyer-namespace",
    namespace: "floristInbox.",
    reason:
      "The florist inbox shows offers and acceptance by design (spec 011).",
  },
  {
    kind: "non-buyer-namespace",
    namespace: "admin.",
    reason:
      "Founder and ops screens show assignment, offers and acceptance (spec 012).",
  },
  {
    kind: "non-buyer-route",
    route: "admin",
    reason: "Founder and ops routes; never reachable by a buyer.",
  },
  // Spec 011's florists pages (TASK-210): recruitment copy addressed to florists, in the `en`, `de`
  // and `pl` spelling of the `forFlorists` segment. A florist accepts and declines orders by design;
  // the ban on "partner" stays, as one of the nine banned words (spec 011 §13 Q11).
  ...(["for-florists", "fuer-floristen", "dla-kwiaciarni"] as const).map(
    (route): RelayExemption => ({
      kind: "non-buyer-route",
      route,
      reason:
        "The for-florists landing, walkthrough and application address florists, never a buyer (spec 011).",
    }),
  ),
  {
    kind: "quoted-record",
    path: "specs/",
    reason: "Specs quote superseded wording verbatim as amendment records.",
  },
  {
    kind: "quoted-record",
    path: "docs/",
    reason:
      "ADRs, the decisions log, advice and task briefs quote superseded wording.",
  },
  {
    kind: "messageCase",
    key: "home.sentence.who",
    selectCase: "partner",
    text: "my partner",
    locales: ["en", "en-gb"],
    reason:
      'decisions-log 2026-10-04 "\\"my partner\\" allowed as a who option" (spec 004 §14 A22 clause 2): the buyer\'s loved one, never a florist.',
  },
];

/** Whether a message key lies in a non-buyer namespace of `RELAY_EXEMPT`. */
export function relayExemptKey(
  messageKey: string,
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): boolean {
  return exempt.some(
    (rule) =>
      rule.kind === "non-buyer-namespace" &&
      messageKey.startsWith(rule.namespace),
  );
}

/** Whether a route segment after the locale (`admin`, `for-florists`) is a non-buyer route. */
export function relayExemptRoute(
  segment: string,
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): boolean {
  return exempt.some(
    (rule) => rule.kind === "non-buyer-route" && rule.route === segment,
  );
}

/**
 * `value` with each decided string removed: only under its key, only in its locales, and only as
 * the whole ICU select case (it must start the value or follow whitespace or a brace, and it ends
 * at the case's closing brace, so nothing may follow the phrase).
 */
export function withoutDecidedStrings(
  value: string,
  locale: string,
  messageKey: string,
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): string {
  return exempt.reduce((text, rule) => {
    if (
      rule.kind !== "messageCase" ||
      rule.key !== messageKey ||
      !rule.locales.includes(locale)
    ) {
      return text;
    }
    const token = escapeRegExp(`${rule.selectCase} {${rule.text}}`);
    return text.replaceAll(new RegExp(`(?<=^|[\\s{}])${token}`, "gu"), " ");
  }, value);
}

/** `source` with every regular-expression metacharacter escaped. */
function escapeRegExp(source: string): string {
  return source.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** The exact rendered texts of the decided strings a locale's page may show. */
export function decidedRenderedStrings(
  locale: string,
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): readonly string[] {
  return exempt.flatMap((rule) =>
    rule.kind === "messageCase" && rule.locales.includes(locale)
      ? [rule.text]
      : [],
  );
}

/* -------------------------------------------------------------------------- */
/* The claim, scale and price-literal patterns (spec 041 §2; spec 007 §8).    */
/* -------------------------------------------------------------------------- */

/** One named claim pattern: a failure reports the label, so it is actionable. */
export interface ClaimPattern {
  readonly label: string;
  readonly pattern: RegExp;
}

/**
 * The claims a corridor `guide` file (spec 007 §8, AC-19) and a trust page (spec 041 §2, outside
 * a sentence the file lists in `honestyAllow`) may not make. Moved here from
 * `scripts/corridor-check.ts` (spec 041 §2 "One list, two readers"; TASK-182): `corridor:check`
 * and `pages:check` both import it, so the two gates cannot drift apart.
 */
export const CLAIM_PATTERNS: readonly ClaimPattern[] = [
  { label: "delivery timing", pattern: DELIVERY_TIMING_PATTERN },
  { label: "cutoff", pattern: /\bcut[- ]?offs?\b/iu },
  {
    label: "delivery date",
    pattern:
      /\b(?:delivery dates?|deliver(?:ed|y|s)? (?:today|tomorrow)|by tomorrow|on the (?:day|date) (?:you|they) (?:choose|chose|chosen|pick|picked|select|selected))\b/iu,
  },
  {
    label: "florist count",
    pattern:
      /\b(?:\d[\d,.]*\+?|dozens|hundreds|thousands|a network of)\s+(?:of\s+)?florists?\b/iu,
  },
  { label: "rating", pattern: /\b(?:ratings?|stars?|star[- ]rated)\b/iu },
  { label: "review", pattern: /\b(?:reviews?|testimonials?|trustpilot)\b/iu },
  {
    label: "delivery photo",
    pattern:
      /\b(?:delivery photos?|photos? of the delivery|photo(?:graph)?(?:s|ed|ing)?\s+(?:(?:it|them|the\s+(?:flowers|bouquet))\s+)?(?:at|on)\s+the\s+(?:door|doorstep)|proof of delivery)\b/iu,
  },
];

/** A digit-bearing claim of scale ("200+ florists", "1,200 cities"). */
export const SCALE_CLAIM_PATTERN =
  /\b\d[\d,.]*\s*\+?\s*(?:florists?|shops?|partners?|cities|towns|countries|deliveries|customers|orders|bouquets)\b|\b\d[\d,.]*\+/iu;

/**
 * A price literal in copy. Prices are data (`formatMoney`), never a sentence.
 *
 * The currency alternation closes on the Unicode-aware `(?![\p{L}\p{N}])` lookahead this file
 * uses in `containsTerm()` / `containsSlugAsUrl()`, **not** on `\b`: JS `\b` is ASCII-only, so
 * after a branch ending in `ł` there is no word boundary and every `129 zł` form escaped the rule
 * (`/review 63`). `złotych` survived only because it ends in an ASCII `h`. Any currency word added
 * here that ends in a non-ASCII letter falls into the same trap, which the lookahead closes.
 */
export const PRICE_LITERAL_PATTERN =
  /(?:[£€$]\s?\d|\b\d[\d,.]*\s?(?:zł|złotych|pln|eur|gbp|euros?|pounds?|lei|ron)(?![\p{L}\p{N}]))/iu;
