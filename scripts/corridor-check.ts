/**
 * `pnpm corridor:check` — the corridor content gate (spec 007 §2, §11, AC-2 / T-03; TASK-087).
 *
 * The eighteen rules that make `plan/02` §5.2's minimum-unique-data rule a fact.
 *
 * ```
 * pnpm corridor:check            # exit 0 on a clean corpus, one line per problem otherwise
 * pnpm corridor:check --summary  # also write the published-set summary to the step summary
 * ```
 *
 * ## Why it exists
 *
 * Every failure mode `plan/02` §1 catalogues — FloraQueen's 12,610 programmatic collections,
 * floristsonline.net's 4,542 duplicate city entries, "Empfänger in Frankreich" on fleurop.de's
 * Poland page — is a template that was allowed to render for a place the publisher had nothing to
 * say about. Good intentions do not survive a country launch at 23:00, so the eighteen rules below
 * are the intentions, executable. A corridor page exists because a human wrote something true
 * about that country, and this is the assertion behind that claim.
 *
 * ## The eighteen rules (AC-2)
 *
 * | # | rule | fails when |
 * |---|---|---|
 * | 1 | `parses` | the file name, its frontmatter or its shape does not parse |
 * | 2 | `source-human` | the file says `source: machine` (`plan/02` §12) |
 * | 3 | `body-word-floor` | the guide body is under 600 words |
 * | 4 | `intro-word-range` | the intro is outside 120–200 words |
 * | 5 | `token-distinctness` | under 70% token-distinct from another corridor file in the locale |
 * | 6 | `faq-count` | fewer than 8 or more than 12 FAQ items |
 * | 7 | `faq-country-specific` | under half the FAQ questions name the country or something in it |
 * | 8 | `seo-title` | `seoTitle` is absent or over 60 characters |
 * | 9 | `seo-description` | `seoDescription` is absent or over 155 characters |
 * | 10 | `own-slug-in-body` | the country's own URL slug appears in body prose |
 * | 11 | `other-country-in-body` | another country's name, adjective or slug appears in the body |
 * | 12 | `banned-words` | any of the nine words of `docs/design/README.md` §Voice appears |
 * | 13 | `guide-claims` | a guide file claims a delivery time, a cutoff, a florist count, a rating, a review or a delivery photo |
 * | 14 | `scale-claim` | a digit-bearing claim of scale ("200+ florists") |
 * | 15 | `price-literal` | a price literal in copy (prices are data, `formatMoney` only) |
 * | 16 | `live-operations` | a `live` file for a country with no complete `operations` block |
 * | 17 | `en-gb-overrides` | an `en-gb` file that `extends: en` without overriding title, description and ≥2 FAQ answers |
 * | 18 | `related-targets` | `relatedIso2` names an unknown country, or a related file that does not name it back |
 *
 * ## Three properties that are design, not accident
 *
 * **It composes; it does not restate.** The shape is `CountryLocaleContentBaseSchema`, the nine
 * banned words are `src/config/voice.ts`, the delivery-timing phrases are `seed/copy.ts`'s
 * `DELIVERY_TIMING_PATTERN` (extended by this task with the clock-bearing forms the reviewer of
 * PR 59 found missing), the word count is `wordCount()`, the slugs are `countries.ts` and the
 * country names are `messages/{locale}.json`. A gate that carried its own copy of any of them
 * would agree with itself and drift from the thing it is gating.
 *
 * **It is a pure function of a corpus value.** `readCorridorCorpus()` does all the I/O and returns
 * a list of `{ path, source }`; `checkCorridorCorpus()` is pure. That is what lets the eighteen
 * fixtures of T-03 be small declarative *overlays* on the committed corpus
 * (`scripts/corridor-check-cases.ts`) rather than eighteen rotting 600-word copies of it.
 *
 * **No clock, no network, no database, no environment** — `pnpm check:no-db` covers this file, and
 * the only `process.env` read is `GITHUB_STEP_SUMMARY` inside `main()` (the precedent of
 * `scripts/catalogue-check.ts`). A gate whose verdict changes at midnight is not a gate.
 *
 * ## The one thing the summary is for (spec 007 §11)
 *
 * `--summary` prints the published-set summary: per locale, how many corridor files exist, how
 * many are reviewed, and which countries they cover. That is the number the `seo-auditor` compares
 * against "countries with `guide_published = true OR status = live`" and the number the founder
 * watches as native reviews land.
 *
 * ## One interpretation, stated rather than hidden (rule 10)
 *
 * `plan/02` §5.3's "the country's own slug must not appear in body prose" cannot be read as a
 * case-insensitive word grep: the English slug for Poland *is* `poland`, so the rule read that way
 * would forbid the word "Poland" from Poland's guide and no guide could be written. It is
 * therefore implemented as a **URL-shaped** grep — the slug adjacent to a `/` or a `-`
 * (`send-flowers-to/poland`, `poland-guide`) — which is the leak the rule exists to catch, while
 * prose may of course name the country. Recorded in `docs/tasks/TASK-087.md` and in the PR.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { DELIVERY_TIMING_PATTERN, wordCount } from "../seed/copy.ts";
import {
  COUNTRIES,
  hasCompleteOperations,
  isCountryIso2,
} from "../src/config/countries.ts";
import { launchLocales } from "../src/config/locales.ts";
import { bannedVoiceWordsIn } from "../src/config/voice.ts";
import {
  readCorridorCorpus,
  repoRootFromModule,
  type CorridorSourceFile,
} from "../src/modules/geo/content/corpus.ts";
import {
  CORRIDOR_CONTENT_DIR,
  parseCorridorContentShape,
} from "../src/modules/geo/content/parse.ts";
import {
  BODY_WORD_MIN,
  FAQ_MAX,
  FAQ_MIN,
  INTRO_WORD_MAX,
  INTRO_WORD_MIN,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  type CountryLocaleContentBase,
} from "../src/modules/geo/content/schemas.ts";

const CLI_NAME = "corridor:check";

/** The eighteen rules, in the order AC-2 lists them. */
export const CORRIDOR_CHECK_RULES = [
  "parses",
  "source-human",
  "body-word-floor",
  "intro-word-range",
  "token-distinctness",
  "faq-count",
  "faq-country-specific",
  "seo-title",
  "seo-description",
  "own-slug-in-body",
  "other-country-in-body",
  "banned-words",
  "guide-claims",
  "scale-claim",
  "price-literal",
  "live-operations",
  "en-gb-overrides",
  "related-targets",
] as const;

export type CorridorCheckRule = (typeof CORRIDOR_CHECK_RULES)[number];

/** `plan/02` §5.2's uniqueness test: a corridor page is ≥70% token-distinct from its siblings. */
export const TOKEN_DISTINCTNESS_MIN = 0.7;
/** `plan/02` §5.2: at least half the FAQ questions are about *this* country. */
export const COUNTRY_SPECIFIC_FAQ_MIN_SHARE = 0.5;
/** Spec 007 §6 (b): an `en-gb` override changes at least two FAQ answers. */
export const EN_GB_FAQ_OVERRIDE_MIN = 2;

/** One fault: the file to open, the field to look at, the rule broken and why it matters. */
export interface CorridorProblem {
  /** Repo-relative path, so a CI log line can be pasted into an editor. */
  readonly file: string;
  /** The frontmatter field, `body`, or `-` for a whole-file fault. */
  readonly field: string;
  readonly rule: CorridorCheckRule;
  readonly message: string;
}

/** One line per problem, naming file, field and rule (AC-2). */
export function formatCorridorProblems(
  problems: readonly CorridorProblem[],
): string {
  return problems
    .map(
      (problem) =>
        `${problem.file}: [${problem.rule}] \`${problem.field}\` ${problem.message}`,
    )
    .join("\n");
}

/** The process exit code for a run: 0 on a clean corpus, 1 with any problem. */
export function corridorCheckExitCode(
  problems: readonly CorridorProblem[],
): number {
  return problems.length === 0 ? 0 : 1;
}

/* -------------------------------------------------------------------------- */
/* Country vocabulary — gate data, never rendered.                            */
/* -------------------------------------------------------------------------- */

/**
 * What "about this country" means, per destination (rules 7 and 11).
 *
 * Gate-only reference data: no page reads it, no message key comes from it, and it is not copy —
 * it is the vocabulary a question has to touch before it counts as a question about Poland rather
 * than a question about flowers. Every entry is a plain, checkable fact (the language, the
 * currency, the largest cities, the occasions the country actually keeps); the customs lists are
 * the ones the guides themselves are allowed to explain.
 *
 * It lives beside the gate rather than in `src/config/` on purpose: a registry under `src/` is
 * something a page may read, and nothing here should ever reach a page.
 */
const CountryVocabularySchema = z.record(
  z.string(),
  z
    .object({
      adjectives: z.array(z.string().min(3)).min(1),
      language: z.array(z.string().min(3)).min(1),
      currency: z.array(z.string().min(2)).min(1),
      cities: z.array(z.string().min(3)).min(3),
      customs: z.array(z.string().min(3)).min(1),
    })
    .strict(),
);

export const COUNTRY_VOCABULARY = CountryVocabularySchema.parse({
  PL: {
    adjectives: ["polish", "polska", "polskie"],
    language: ["polish"],
    currency: ["złoty", "zloty", "złotych", "pln"],
    cities: [
      "warsaw",
      "warszawa",
      "kraków",
      "krakow",
      "wrocław",
      "wroclaw",
      "gdańsk",
      "gdansk",
      "poznań",
      "poznan",
      "łódź",
      "lodz",
    ],
    customs: [
      "imieniny",
      "name day",
      "name-day",
      "wigilia",
      "all saints",
      "wszystkich świętych",
      "dzień matki",
      "dzień kobiet",
      "andrzejki",
      "boże ciało",
    ],
  },
  DE: {
    adjectives: ["german"],
    language: ["german"],
    currency: ["euro", "eur"],
    cities: [
      "berlin",
      "munich",
      "münchen",
      "hamburg",
      "cologne",
      "köln",
      "frankfurt",
    ],
    customs: ["muttertag", "advent", "namenstag"],
  },
  FR: {
    adjectives: ["french"],
    language: ["french"],
    currency: ["euro", "eur"],
    cities: ["paris", "lyon", "marseille", "toulouse", "bordeaux", "nice"],
    customs: ["fête des mères", "toussaint", "muguet"],
  },
  ES: {
    adjectives: ["spanish"],
    language: ["spanish", "castilian", "catalan"],
    currency: ["euro", "eur"],
    cities: ["madrid", "barcelona", "valencia", "seville", "sevilla", "bilbao"],
    customs: ["día de la madre", "santo", "sant jordi"],
  },
  IT: {
    adjectives: ["italian"],
    language: ["italian"],
    currency: ["euro", "eur"],
    cities: [
      "rome",
      "roma",
      "milan",
      "milano",
      "naples",
      "napoli",
      "turin",
      "torino",
      "florence",
      "firenze",
    ],
    customs: ["festa della mamma", "onomastico", "ognissanti"],
  },
  RO: {
    adjectives: ["romanian"],
    language: ["romanian"],
    currency: ["leu", "lei", "ron"],
    cities: [
      "bucharest",
      "bucurești",
      "bucuresti",
      "cluj",
      "timișoara",
      "timisoara",
      "iași",
      "iasi",
    ],
    customs: ["mărțișor", "martisor", "ziua mamei", "ziua numelui"],
  },
  NL: {
    adjectives: ["dutch", "netherlandish"],
    language: ["dutch"],
    currency: ["euro", "eur"],
    cities: [
      "amsterdam",
      "rotterdam",
      "the hague",
      "den haag",
      "utrecht",
      "eindhoven",
    ],
    customs: ["moederdag", "sinterklaas", "koningsdag"],
  },
});

/**
 * The names every launch catalogue gives each destination, merged. A country is named in whatever
 * language the page is written in, and "Polen" on an English page is the same leak as "Poland" —
 * so both the country-specificity rule and the other-country rule read the union rather than one
 * locale's column. It is also what keeps an `en-gb` file, whose catalogue is a partial override of
 * `en`, from looking as if it never names its own country.
 */
function mergeNames(
  names: ReadonlyMap<string, ReadonlyMap<string, string>>,
): ReadonlyMap<string, readonly string[]> {
  const merged = new Map<string, string[]>();
  for (const localeNames of names.values()) {
    for (const [iso2, name] of localeNames) {
      const existing = merged.get(iso2) ?? [];
      if (!existing.includes(name)) existing.push(name);
      merged.set(iso2, existing);
    }
  }
  return merged;
}

/** Every term that makes a sentence be about this country: name, adjective, city, money, custom. */
function termsFor(
  iso2: string,
  names: ReadonlyMap<string, readonly string[]>,
): string[] {
  const vocabulary = COUNTRY_VOCABULARY[iso2];
  return [
    ...(names.get(iso2) ?? []),
    ...(vocabulary === undefined
      ? []
      : [
          ...vocabulary.adjectives,
          ...vocabulary.language,
          ...vocabulary.currency,
          ...vocabulary.cities,
          ...vocabulary.customs,
        ]),
  ].map((term) => term.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* The corpus as a value.                                                     */
/* -------------------------------------------------------------------------- */

/** The names a locale's catalogue gives the destinations, keyed by ISO code. */
export function destinationNames(
  locale: string,
  root: string,
): ReadonlyMap<string, string> {
  const catalogue = JSON.parse(
    readFileSync(resolve(root, "messages", `${locale}.json`), "utf8"),
  ) as { destinations?: Record<string, { name?: string }> };
  return new Map(
    Object.entries(catalogue.destinations ?? {}).flatMap(([key, value]) =>
      typeof value.name === "string"
        ? [[key.toUpperCase(), value.name] as [string, string]]
        : [],
    ),
  );
}

/** The corpus a check run sees: the files, plus the catalogue names each locale uses. */
export interface CorridorCorpus {
  readonly files: readonly CorridorSourceFile[];
  /** locale -> (ISO code -> country name). */
  readonly names: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/** Read the committed corpus and the catalogues it is checked against. All the I/O is here. */
export function readCorridorCheckCorpus(
  root: string = repoRootFromModule(),
): CorridorCorpus {
  return {
    files: readCorridorCorpus(root),
    names: new Map(
      launchLocales.map((locale) => [locale, destinationNames(locale, root)]),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Rule helpers.                                                              */
/* -------------------------------------------------------------------------- */

/** Words of a text: whitespace-separated tokens containing a letter or a digit (`seed/copy.ts`). */
export { wordCount };

/** The normalised token multiset of a body: lowercased words, stop-words retained (`plan/02` §5.2). */
export function tokensOf(text: string): readonly string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 0,
  );
}

/**
 * The share of `a`'s tokens that `b` does not also carry, as a multiset difference. 1 means
 * nothing in common; 0 means `a` is contained in `b`. `plan/02` §5.2 wants ≥0.70.
 */
export function tokenDistinctness(a: string, b: string): number {
  const own = tokensOf(a);
  if (own.length === 0) return 1;
  const other = new Map<string, number>();
  for (const token of tokensOf(b)) {
    other.set(token, (other.get(token) ?? 0) + 1);
  }
  let shared = 0;
  for (const token of own) {
    const left = other.get(token) ?? 0;
    if (left > 0) {
      shared += 1;
      other.set(token, left - 1);
    }
  }
  return 1 - shared / own.length;
}

/** A word-bounded, case-insensitive test for a phrase that may contain spaces. */
function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(haystack);
}

/** A slug in URL shape: adjacent to a `/` or a `-` (see the header's rule-10 note). */
function containsSlugAsUrl(haystack: string, slug: string): boolean {
  return new RegExp(
    `(?:[/-]${slug}(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])${slug}[/-])`,
    "iu",
  ).test(haystack);
}

/** The claims a `guide` file may not make (§8, AC-19), each named so a failure is actionable. */
const GUIDE_CLAIM_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: "delivery timing", pattern: DELIVERY_TIMING_PATTERN },
  { label: "cutoff", pattern: /\bcut[- ]?offs?\b/iu },
  {
    label: "delivery date",
    pattern:
      /\b(?:delivery dates?|deliver(?:ed|y|s)? (?:today|tomorrow)|by tomorrow|on the day you choose)\b/iu,
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
      /\b(?:delivery photos?|photos? of the delivery|photographed at the door|proof of delivery)\b/iu,
  },
];

/** A digit-bearing claim of scale ("200+ florists", "1,200 cities"). */
const SCALE_CLAIM_PATTERN =
  /\b\d[\d,.]*\s*\+?\s*(?:florists?|shops?|partners?|cities|towns|countries|deliveries|customers|orders|bouquets)\b|\b\d[\d,.]*\+/iu;

/** A price literal in copy. Prices are data (`formatMoney`), never a sentence. */
const PRICE_LITERAL_PATTERN =
  /(?:[£€$]\s?\d|\b\d[\d,.]*\s?(?:zł|złotych|pln|eur|gbp|euros?|pounds?|lei|ron)\b)/iu;

/* -------------------------------------------------------------------------- */
/* The rules.                                                                 */
/* -------------------------------------------------------------------------- */

interface ParsedFile {
  /** Repo-relative path. */
  readonly file: string;
  /** Path relative to `content/corridors/`. */
  readonly path: string;
  readonly content: CountryLocaleContentBase;
}

/** Everything a file's copy is made of, as one string: the gate greps copy, not markup. */
function proseOf(content: CountryLocaleContentBase): string {
  return [
    content.seoTitle ?? "",
    content.seoDescription ?? "",
    content.h1,
    content.intro,
    content.localFlowers,
    content.taboos,
    ...content.faq.flatMap((item) => [item.q, item.a]),
    content.body,
  ].join("\n");
}

function problem(
  file: string,
  field: string,
  rule: CorridorCheckRule,
  message: string,
): CorridorProblem {
  return { file, field, rule, message };
}

/**
 * The eighteen rules over a corpus value. Pure: same corpus in, same problems out, in file order
 * then rule order.
 */
export function checkCorridorCorpus(
  corpus: CorridorCorpus,
): readonly CorridorProblem[] {
  const problems: CorridorProblem[] = [];
  const parsed: ParsedFile[] = [];
  const names = mergeNames(corpus.names);

  /* 1. parses ------------------------------------------------------------ */
  for (const file of corpus.files) {
    const repoPath = `${CORRIDOR_CONTENT_DIR}/${file.path}`;
    const result = parseCorridorContentShape(file.path, file.source);
    if (!result.ok) {
      for (const issue of result.issues) {
        problems.push(
          problem(issue.file, issue.field, "parses", issue.message),
        );
      }
      continue;
    }
    parsed.push({ file: repoPath, path: file.path, content: result.content });
  }

  for (const entry of parsed) {
    const { file, content } = entry;
    const prose = proseOf(content);

    /* 2. source-human --------------------------------------------------- */
    if (content.source !== "human") {
      problems.push(
        problem(
          file,
          "source",
          "source-human",
          "corridor copy is never machine-drafted, not even noindexed (plan/02 §12)",
        ),
      );
    }

    /* 3. body-word-floor ------------------------------------------------ */
    const bodyWords = wordCount(content.body);
    if (bodyWords < BODY_WORD_MIN) {
      problems.push(
        problem(
          file,
          "body",
          "body-word-floor",
          `body is ${String(bodyWords)} words; at least ${String(BODY_WORD_MIN)} country-specific words are required (plan/02 §5.1)`,
        ),
      );
    }

    /* 4. intro-word-range ----------------------------------------------- */
    const introWords = wordCount(content.intro);
    if (introWords < INTRO_WORD_MIN || introWords > INTRO_WORD_MAX) {
      problems.push(
        problem(
          file,
          "intro",
          "intro-word-range",
          `intro is ${String(introWords)} words; ${String(INTRO_WORD_MIN)}–${String(INTRO_WORD_MAX)} are required (plan/02 §5.2)`,
        ),
      );
    }

    /* 5. token-distinctness --------------------------------------------- */
    for (const other of parsed) {
      if (other === entry || other.content.locale !== content.locale) continue;
      const distinctness = tokenDistinctness(content.body, other.content.body);
      if (distinctness < TOKEN_DISTINCTNESS_MIN) {
        problems.push(
          problem(
            file,
            "body",
            "token-distinctness",
            `body is ${(distinctness * 100).toFixed(1)}% token-distinct from ${other.file}; ${String(TOKEN_DISTINCTNESS_MIN * 100)}% is the floor (plan/02 §5.2)`,
          ),
        );
      }
    }

    /* 6. faq-count ------------------------------------------------------ */
    if (content.faq.length < FAQ_MIN || content.faq.length > FAQ_MAX) {
      problems.push(
        problem(
          file,
          "faq",
          "faq-count",
          `faq has ${String(content.faq.length)} item(s); ${String(FAQ_MIN)}–${String(FAQ_MAX)} are required (plan/02 §5.2)`,
        ),
      );
    }

    /* 7. faq-country-specific ------------------------------------------- */
    if (content.faq.length > 0) {
      const terms = termsFor(content.iso2, names);
      const specific = content.faq.filter((item) =>
        terms.some((term) => containsTerm(item.q, term)),
      ).length;
      const share = specific / content.faq.length;
      if (share < COUNTRY_SPECIFIC_FAQ_MIN_SHARE) {
        problems.push(
          problem(
            file,
            "faq",
            "faq-country-specific",
            `${String(specific)} of ${String(content.faq.length)} FAQ questions name the country, one of its cities, its language, its currency or one of its occasions; at least ${String(COUNTRY_SPECIFIC_FAQ_MIN_SHARE * 100)}% must (plan/02 §5.2)`,
          ),
        );
      }
    }

    /* 8. seo-title ------------------------------------------------------ */
    if (content.seoTitle === undefined) {
      problems.push(
        problem(
          file,
          "seoTitle",
          "seo-title",
          "seoTitle is absent (plan/02 §5.3)",
        ),
      );
    } else if (content.seoTitle.length > SEO_TITLE_MAX) {
      problems.push(
        problem(
          file,
          "seoTitle",
          "seo-title",
          `seoTitle is ${String(content.seoTitle.length)} characters; the limit is ${String(SEO_TITLE_MAX)} (plan/02 §5.3)`,
        ),
      );
    }

    /* 9. seo-description ------------------------------------------------ */
    if (content.seoDescription === undefined) {
      problems.push(
        problem(
          file,
          "seoDescription",
          "seo-description",
          "seoDescription is absent (plan/02 §5.3)",
        ),
      );
    } else if (content.seoDescription.length > SEO_DESCRIPTION_MAX) {
      problems.push(
        problem(
          file,
          "seoDescription",
          "seo-description",
          `seoDescription is ${String(content.seoDescription.length)} characters; the limit is ${String(SEO_DESCRIPTION_MAX)} (plan/02 §5.3)`,
        ),
      );
    }

    /* 10. own-slug-in-body ---------------------------------------------- */
    const own = COUNTRIES.find((country) => country.iso2 === content.iso2);
    const ownSlugs: readonly string[] =
      own === undefined ? [] : Object.values(own.slugs);
    for (const slug of new Set(ownSlugs)) {
      if (containsSlugAsUrl(content.body, slug)) {
        problems.push(
          problem(
            file,
            "body",
            "own-slug-in-body",
            `body prose contains the country's own URL slug \`${slug}\`; a slug is a URL, not a word (plan/02 §5.3)`,
          ),
        );
      }
    }

    /* 11. other-country-in-body ----------------------------------------- */
    for (const country of COUNTRIES) {
      if (country.iso2 === content.iso2) continue;
      const otherTerms = [
        ...(names.get(country.iso2) ?? []),
        ...(COUNTRY_VOCABULARY[country.iso2]?.adjectives ?? []),
      ];
      for (const term of otherTerms) {
        if (containsTerm(content.body, term)) {
          problems.push(
            problem(
              file,
              "body",
              "other-country-in-body",
              `body names another destination (\`${term}\`, ${country.iso2}); a corridor guide is about one country (plan/02 §1, the fleurop.de failure)`,
            ),
          );
        }
      }
      for (const slug of new Set(Object.values(country.slugs))) {
        if (containsSlugAsUrl(content.body, slug)) {
          problems.push(
            problem(
              file,
              "body",
              "other-country-in-body",
              `body contains another destination's URL slug \`${slug}\` (${country.iso2})`,
            ),
          );
        }
      }
    }

    /* 12. banned-words --------------------------------------------------- */
    for (const word of bannedVoiceWordsIn(prose)) {
      problems.push(
        problem(
          file,
          "-",
          "banned-words",
          `copy uses the banned word \`${word}\`: we speak in the first person (spec 004 §14 A5, docs/design/README.md §Voice)`,
        ),
      );
    }

    /* 13. guide-claims --------------------------------------------------- */
    if (content.state === "guide") {
      for (const claim of GUIDE_CLAIM_PATTERNS) {
        const match = claim.pattern.exec(prose);
        if (match !== null) {
          problems.push(
            problem(
              file,
              "-",
              "guide-claims",
              `guide copy makes a ${claim.label} claim (\`${match[0].trim()}\`); a guide-state page has no florist, no cutoff and no delivery yet (spec 007 §8, AC-19)`,
            ),
          );
        }
      }
    }

    /* 14. scale-claim ---------------------------------------------------- */
    const scale = SCALE_CLAIM_PATTERN.exec(prose);
    if (scale !== null) {
      problems.push(
        problem(
          file,
          "-",
          "scale-claim",
          `copy makes a digit-bearing claim of scale (\`${scale[0].trim()}\`); we count nothing we cannot show (plan/10 §3)`,
        ),
      );
    }

    /* 15. price-literal -------------------------------------------------- */
    const price = PRICE_LITERAL_PATTERN.exec(prose);
    if (price !== null) {
      problems.push(
        problem(
          file,
          "-",
          "price-literal",
          `copy contains a price literal (\`${price[0].trim()}\`); prices are data and are formatted by formatMoney (CLAUDE.md, plan/07 §4)`,
        ),
      );
    }

    /* 16. live-operations ------------------------------------------------ */
    if (
      content.state === "live" &&
      isCountryIso2(content.iso2) &&
      !hasCompleteOperations(content.iso2)
    ) {
      problems.push(
        problem(
          file,
          "state",
          "live-operations",
          `\`${content.iso2}\` has no complete \`operations\` block in src/config/countries.ts, so a live page would render a cutoff nobody agreed to (spec 007 §5.1)`,
        ),
      );
    }

    /* 17. en-gb-overrides ------------------------------------------------ */
    if (content.extends !== undefined) {
      const base = parsed.find(
        (candidate) =>
          candidate.content.locale === content.extends &&
          candidate.content.iso2 === content.iso2 &&
          candidate.content.state === content.state,
      );
      if (base === undefined) {
        problems.push(
          problem(
            file,
            "extends",
            "en-gb-overrides",
            `extends \`${content.extends}\`, which has no file for ${content.iso2}/${content.state}`,
          ),
        );
      } else {
        const baseAnswers = new Set(
          base.content.faq.map((item) => item.a.trim()),
        );
        const overridden = content.faq.filter(
          (item) => !baseAnswers.has(item.a.trim()),
        ).length;
        const missing: string[] = [];
        if (content.seoTitle === base.content.seoTitle)
          missing.push("seoTitle");
        if (content.seoDescription === base.content.seoDescription) {
          missing.push("seoDescription");
        }
        if (overridden < EN_GB_FAQ_OVERRIDE_MIN) {
          missing.push(
            `${String(EN_GB_FAQ_OVERRIDE_MIN)} FAQ answers (found ${String(overridden)})`,
          );
        }
        if (missing.length > 0) {
          problems.push(
            problem(
              file,
              "extends",
              "en-gb-overrides",
              `inherits \`${content.extends}\` without overriding ${missing.join(", ")}; the two English pages must genuinely differ (plan/02 §4.2, spec 007 §6 (b))`,
            ),
          );
        }
      }
    }

    /* 18. related-targets ------------------------------------------------ */
    for (const target of content.relatedIso2) {
      if (!isCountryIso2(target)) {
        problems.push(
          problem(
            file,
            "relatedIso2",
            "related-targets",
            `relatedIso2 names \`${target}\`, which is not a destination`,
          ),
        );
        continue;
      }
      const reciprocal = parsed.find(
        (candidate) =>
          candidate.content.iso2 === target &&
          candidate.content.locale === content.locale &&
          candidate.content.state === content.state,
      );
      if (
        reciprocal !== undefined &&
        !reciprocal.content.relatedIso2.includes(content.iso2)
      ) {
        problems.push(
          problem(
            file,
            "relatedIso2",
            "related-targets",
            `relatedIso2 names \`${target}\`, whose own file ${reciprocal.file} does not name \`${content.iso2}\` back (spec 007 AC-18)`,
          ),
        );
      }
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* The published-set summary (spec 007 §11).                                  */
/* -------------------------------------------------------------------------- */

/** One row of the summary: what exists in a locale and how much of it a human has reviewed. */
export interface CorridorSummaryRow {
  readonly locale: string;
  readonly files: number;
  readonly reviewed: number;
  readonly countries: readonly string[];
}

export function corridorSummaryRows(
  corpus: CorridorCorpus,
): readonly CorridorSummaryRow[] {
  return launchLocales.map((locale) => {
    const parsed = corpus.files.flatMap((file) => {
      const result = parseCorridorContentShape(file.path, file.source);
      return result.ok && result.content.locale === locale
        ? [result.content]
        : [];
    });
    return {
      locale,
      files: parsed.length,
      reviewed: parsed.filter((content) => content.reviewed).length,
      countries: [...new Set(parsed.map((content) => content.iso2))].sort(),
    };
  });
}

/** The markdown table CI writes to the step summary. */
export function corridorSummary(corpus: CorridorCorpus): string {
  const rows = corridorSummaryRows(corpus);
  return [
    "| locale | files | reviewed | countries |",
    "|---|---:|---:|---|",
    ...rows.map(
      (row) =>
        `| \`${row.locale}\` | ${String(row.files)} | ${String(row.reviewed)} | ${row.countries.length === 0 ? "—" : row.countries.join(", ")} |`,
    ),
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* CLI.                                                                       */
/* -------------------------------------------------------------------------- */

async function main(argv: readonly string[]): Promise<number> {
  const root = resolve(
    argv.find((argument) => !argument.startsWith("--")) ??
      fileURLToPath(new URL("..", import.meta.url)),
  );
  const corpus = readCorridorCheckCorpus(root);
  const problems = checkCorridorCorpus(corpus);

  if (problems.length > 0) {
    console.error(
      `${CLI_NAME} failed with ${String(problems.length)} problem(s) in ${String(new Set(problems.map((entry) => entry.rule)).size)} of ${String(CORRIDOR_CHECK_RULES.length)} rules:`,
    );
    console.error(formatCorridorProblems(problems));
  } else {
    console.log(
      `${CLI_NAME}: ${String(corpus.files.length)} corridor file(s), all ${String(CORRIDOR_CHECK_RULES.length)} rules clean.`,
    );
  }

  if (argv.includes("--summary")) {
    const summary = corridorSummary(corpus);
    console.log(summary);
    const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
    if (summaryPath !== undefined && summaryPath !== "") {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(
        summaryPath,
        [
          "",
          `### \`${CLI_NAME}\` — ${problems.length === 0 ? "clean" : `${String(problems.length)} problem(s)`}`,
          "",
          summary,
          "",
          ...(problems.length > 0
            ? ["```", formatCorridorProblems(problems), "```", ""]
            : []),
        ].join("\n"),
      );
    }
  }

  return corridorCheckExitCode(problems);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = await main(process.argv.slice(2));
}
