/**
 * `seed/copy.ts` — the rules and derivations that govern `seed/data/copy/{locale}/{entity}.json`
 * (spec 006 §2.2 "Copy", §2.3 rule 6, §6 "Thin and duplicate content", §7; TASK-073).
 *
 * The schema for a copy row is `seed/schema/copy.ts`'s `SeedCopySchema` and is not restated here.
 * What this module owns is everything a *single row* cannot see and a *file* therefore cannot
 * validate: the word band, the closing sentence, the banned-superlative list, cross-product
 * duplication, and the two derivations that must have exactly one implementation in the
 * repository — the ASCII slug fold and the `sourceHash` canonicalisation.
 *
 * Four decisions are recorded here because they are the ones a later reader will want the reason
 * for:
 *
 *  1. **The local-florist sentence lives in `messages/*.json` under `catalog.floristSentence`,
 *     once per locale, and is *appended to* every description by `withFloristSentence()`.** Spec
 *     006 §7 requires both that every description end with it and that a rewording be "one
 *     catalogue edit in four locales rather than 84 description edits". Those two are only
 *     compatible if the sentence is authored in one place and written into the dataset
 *     mechanically: `pnpm i18n:draft` re-synchronises the closing sentence of every row in every
 *     locale from the message catalogue, so a reword is one edit plus one deterministic run, and
 *     `pnpm seed:check` (TASK-075) can still read the tail off the file it is given.
 *  2. **The word band applies to every description in the dataset, not only to products.** Spec
 *     006 §2.3 rule 6 says "an `en` description outside 60–90 words"; category and occasion
 *     intros are descriptions. Holding them to the same band is the stricter reading, it is what
 *     keeps a hub page from being the thin page `plan/02` §4.2 warns about, and it cannot be
 *     wrong under either reading of the rule.
 *  3. **A slug is the ASCII fold of its name** (AC-7), which makes `asciiFoldSlug()` a derivation
 *     rather than a check: the dataset is generated with it and the gate re-derives it. Polish
 *     `ł` and the Nordic letters are not decomposed by Unicode NFD, so the fold carries an
 *     explicit transliteration table; without it `Kraków Spring` folds correctly by accident and
 *     `Wrocław Light` would not.
 *  4. **`sourceHash` is over the translatable text of the `en` row, in a fixed field order.** A
 *     row carries four translatable values, and `plan/03` §6 step 5 wants one hash whose change
 *     means "the English moved". Hashing a canonical `field=value` block over
 *     `name`/`descriptionMd`/`seoTitle`/`seoDescription` gives that, and deliberately excludes
 *     `slug` (never machine-drafted, §6) and the review triple (metadata, not source).
 *
 * No database, no network, no clock, no randomness: `pnpm check:no-db` covers this file and every
 * function in it is pure (spec 006 AC-1).
 */
import { createHash } from "node:crypto";

import type { SeedCopy, SeedCopyEntity } from "./schema/copy.ts";

/* -------------------------------------------------------------------------- */
/* Where the copy lives.                                                      */
/* -------------------------------------------------------------------------- */

/** The copy sub-directory of `seed/data` (spec 006 §2.2's `copy/{locale}/{entity}.json`). */
export const SEED_COPY_DIR = "copy";

/**
 * The entities that carry authored copy. Add-ons are absent on purpose: their name and
 * description are message keys (`catalog.addon.*`, shipped by TASK-062) because an add-on has no
 * page, no slug and no SEO surface of its own.
 */
export const SEED_COPY_ENTITIES = ["product", "category", "occasion"] as const;
export type SeedCopyFileEntity = (typeof SEED_COPY_ENTITIES)[number];

/** The file each entity's rows live in, one per locale. */
export const SEED_COPY_FILENAMES: Readonly<Record<SeedCopyFileEntity, string>> =
  {
    product: "products.json",
    category: "categories.json",
    occasion: "occasions.json",
  };

/** `copy/en/products.json` — the path of one copy file, relative to `seed/data`. */
export function seedCopyPath(
  locale: string,
  entity: SeedCopyFileEntity,
): string {
  return `${SEED_COPY_DIR}/${locale}/${SEED_COPY_FILENAMES[entity]}`;
}

/** The locale every other copy file is drafted from (`plan/03` §6 step 1). */
export const COPY_SOURCE_LOCALE = "en";

/**
 * The locales whose copy files are machine-drafted by `pnpm i18n:draft` (spec 006 §7). `en` is
 * authored, `en-gb` is a human override set (`plan/03` §6, spec 003 §13 Q5) — neither is drafted.
 */
export const COPY_DRAFT_LOCALES = ["de", "pl"] as const;

/* -------------------------------------------------------------------------- */
/* The message keys this dataset depends on.                                  */
/* -------------------------------------------------------------------------- */

/** The one key the closing sentence of every description comes from (spec 006 §7). */
export const FLORIST_SENTENCE_KEY = "catalog.floristSentence";

/* -------------------------------------------------------------------------- */
/* Rule 6 of §2.3: the copy rules.                                            */
/* -------------------------------------------------------------------------- */

/** `plan/10` §2.2: descriptions are 60–90 words. Inclusive on both ends (T-05's boundaries). */
export const COPY_WORD_MIN = 60;
export const COPY_WORD_MAX = 90;

/**
 * The superlatives `plan/10` §2.2 forbids because nothing in the dataset can back them. Short and
 * closed on purpose: a long list becomes a thesaurus nobody reads, and every entry here is a
 * claim a consumer authority would ask us to substantiate (`plan/07` §2.1).
 */
export const BANNED_SUPERLATIVES = [
  "best",
  "finest",
  "cheapest",
  "fastest",
  "unbeatable",
  "unrivalled",
  "unrivaled",
  "world-class",
  "number one",
  "most beautiful",
  "perfect",
  "luxurious",
  "stunning",
  "exquisite",
  "flawless",
  "guaranteed fresh",
] as const;

/**
 * The delivery-timing phrases copy may not contain (spec 006 §14 A4). No description, intro,
 * `seoTitle` or `seoDescription` may state a lead time, a "next day" or "same day" claim, or a
 * punctuality promise: no such data exists — `src/config/countries.ts` deliberately carries no
 * `delivery_days` — and the cutoff and next-available-date sentence is spec 009's server-rendered
 * per-country block. The only permitted form in copy is a *pointer* to that block ("order by the
 * cutoff shown for the destination"), which is why the pattern names phrases rather than the word
 * "cutoff".
 *
 * Word-bounded on purpose: `or late` must not fire on "tied f**or late** summer", and the plural
 * forms are included because "working days" is the same claim as "working day".
 *
 * `pnpm seed:check` (TASK-075) composes this into the copy rule family; the assertion that the
 * committed dataset is clean in every locale lives in `tests/unit/seed-copy.test.ts`.
 */
export const DELIVERY_TIMING_PATTERN =
  /\b(?:next[- ]days?|same[- ]days?|working days?|lead[- ]times?|or late|within \d+ (?:hours?|days?))\b/iu;

/**
 * The delivery-timing phrases a piece of copy contains, lowercased (spec 006 §14 A4). Compiles a
 * fresh global regex per call rather than exporting a `/g` constant, so a caller that reaches for
 * `DELIVERY_TIMING_PATTERN.test()` cannot be bitten by `lastIndex`.
 */
export function deliveryTimingPhrasesIn(text: string): readonly string[] {
  const pattern = new RegExp(DELIVERY_TIMING_PATTERN.source, "giu");
  return [...text.matchAll(pattern)].map((match) => match[0].toLowerCase());
}

/**
 * Words in a description. Whitespace-separated tokens that contain at least one letter or digit,
 * so a stray em dash or bullet is not a word and the count a human gets from a word processor is
 * the count the gate gets.
 */
export function wordCount(text: string): number {
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}

/** The banned superlatives a description contains, matched on word boundaries, lowercased. */
export function bannedSuperlativesIn(text: string): readonly string[] {
  const haystack = text.toLowerCase();
  return BANNED_SUPERLATIVES.filter((term) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${term}(?![\\p{L}\\p{N}])`, "u").test(
      haystack,
    ),
  );
}

/**
 * Append the locale's local-florist sentence to an authored body.
 *
 * Idempotent: a body that already ends with the sentence is returned unchanged, so the authoring
 * step and the drafter can both call it. Rewording is `replaceTrailingSentence()`, which is a
 * different operation and must not be confused with this one — appending to a description that
 * already ends with an *older* wording would leave both sentences in the file.
 */
export function withFloristSentence(
  description: string,
  sentence: string,
): string {
  const body = description.trimEnd();
  if (body.endsWith(sentence)) return body;
  return body === "" ? sentence : `${body} ${sentence}`;
}

/**
 * The last sentence of a description: everything after the final sentence break. Used to read the
 * closing local-florist sentence off a file without being told what it currently says, which is
 * what lets one edit to `catalog.floristSentence` re-flow every description in every locale
 * (spec 006 §7).
 *
 * "Sentence break" is `. ` / `! ` / `? ` — deliberately naive, because catalogue descriptions are
 * plain prose with no abbreviations by rule, and a sentence tokeniser would be a dependency and a
 * source of surprises in four languages.
 */
export function trailingSentence(description: string): string {
  const text = description.trimEnd();
  const match = /(?:^|[.!?]\s+)([^.!?]*[.!?]?)$/u.exec(text);
  return (match?.[1] ?? text).trim();
}

/** The description with its last sentence replaced by `sentence`. */
export function replaceTrailingSentence(
  description: string,
  sentence: string,
): string {
  const text = description.trimEnd();
  if (text.endsWith(sentence)) return text;
  const trailing = trailingSentence(text);
  const body = text.slice(0, text.length - trailing.length).trimEnd();
  return body === "" ? sentence : `${body} ${sentence}`;
}

/** The description without its closing sentence, if it has one. */
export function stripFloristSentence(
  description: string,
  sentence: string,
): string {
  return description.trimEnd().endsWith(sentence)
    ? description.trimEnd().slice(0, -sentence.length).trimEnd()
    : description;
}

/** Does this description end with the locale's local-florist sentence (AC-5)? */
export function endsWithFloristSentence(
  description: string,
  sentence: string,
): boolean {
  return description.trimEnd().endsWith(sentence);
}

/** One problem found in a copy file: the file, the row's key and the rule it broke. */
export interface CopyProblem {
  readonly file: string;
  readonly key: string;
  readonly rule: string;
  readonly message: string;
}

export interface CopyRuleContext {
  /** The locale's `catalog.floristSentence` value. */
  readonly floristSentence: string;
  /** The file the rows came from, for the message (`copy/en/products.json`). */
  readonly file: string;
  /**
   * `true` for the source locale only. The word band, the closing sentence and the superlative
   * list are asserted on `en` (spec 006 §2.3 rule 6 says "an `en` description"); a machine draft
   * of a German description is checked for its flags, not its prose, because nobody wrote it.
   */
  readonly source: boolean;
}

/**
 * Rule family 6 of spec 006 §2.3 over one file's rows, plus AC-5's flag rules. Returns one
 * problem per fault, each naming the row — the shape `pnpm seed:check` (TASK-075) prints, and the
 * reason the rules live here rather than inside the gate: the task that authors the copy owns the
 * definition of correct copy, and the gate composes the families.
 *
 * Cross-file duplication (a description shared by two products) is `duplicateDescriptions()`,
 * because it spans the whole dataset.
 */
export function copyProblems(
  rows: readonly SeedCopy[],
  context: CopyRuleContext,
): readonly CopyProblem[] {
  const problems: CopyProblem[] = [];
  const at = (row: SeedCopy, rule: string, message: string): void => {
    problems.push({ file: context.file, key: row.key, rule, message });
  };

  for (const row of rows) {
    if (row.name.trim() === "") {
      at(row, "name", "has no name: every locale's row carries a name (AC-5)");
    }
    const expectedSlug = asciiFoldSlug(row.name);
    if (row.slug !== expectedSlug) {
      at(
        row,
        "slug",
        `slug \`${row.slug}\` is not the ASCII fold of \`${row.name}\` (\`${expectedSlug}\`) — spec 006 AC-7`,
      );
    }
    if (context.source && row.translationStatus !== "human") {
      at(
        row,
        "translationStatus",
        "the source locale is authored, never machine-drafted (`plan/03` §6 step 1)",
      );
    }
    if (
      !context.source &&
      row.translationStatus === "machine" &&
      row.reviewed
    ) {
      at(
        row,
        "reviewed",
        "a machine draft may not claim a review (AC-5: never present, unreviewed and unflagged)",
      );
    }
    const description = row.descriptionMd;
    if (description === undefined) {
      at(
        row,
        "descriptionMd",
        "has no description: a null description keeps the page out of the index (spec 002 §6)",
      );
      continue;
    }
    if (!endsWithFloristSentence(description, context.floristSentence)) {
      at(
        row,
        "floristSentence",
        `does not end with the \`${FLORIST_SENTENCE_KEY}\` sentence for this locale (spec 006 §7)`,
      );
    }
    if (!context.source) continue;
    const words = wordCount(description);
    if (words < COPY_WORD_MIN || words > COPY_WORD_MAX) {
      at(
        row,
        "wordCount",
        `description is ${String(words)} words, outside ${String(COPY_WORD_MIN)}–${String(COPY_WORD_MAX)} (\`plan/10\` §2.2)`,
      );
    }
    const banned = bannedSuperlativesIn(description);
    if (banned.length > 0) {
      at(
        row,
        "superlative",
        `description uses ${banned.map((term) => `\`${term}\``).join(", ")}, which nothing in the dataset can back (\`plan/10\` §2.2)`,
      );
    }
  }

  return problems;
}

/**
 * Descriptions shared by two or more rows — the thin-content guard of spec 006 §6. Compared after
 * whitespace normalisation, so a reflowed copy of another product's description is still a
 * duplicate. Returns one entry per offending description with every key that carries it.
 */
export function duplicateDescriptions(rows: readonly SeedCopy[]): readonly {
  readonly description: string;
  readonly keys: readonly string[];
}[] {
  const byDescription = new Map<string, string[]>();
  for (const row of rows) {
    if (row.descriptionMd === undefined) continue;
    const normalised = row.descriptionMd.replace(/\s+/gu, " ").trim();
    const keys = byDescription.get(normalised) ?? [];
    keys.push(`${row.entity}:${row.key}`);
    byDescription.set(normalised, keys);
  }
  return [...byDescription.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([description, keys]) => ({ description, keys }));
}

/* -------------------------------------------------------------------------- */
/* The two derivations (decisions 3 and 4).                                   */
/* -------------------------------------------------------------------------- */

/**
 * Letters Unicode NFD does not decompose, and the ASCII they fold to. Polish `ł` is the one that
 * matters today (`Wrocław`); the rest are the launch-adjacent locales' letters, so the fold does
 * not have to be revisited when the fifth locale arrives.
 */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  ł: "l",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ı: "i",
  "'": "",
  "’": "",
};

/**
 * The ASCII fold of a name into a slug (`plan/02` §4, spec 006 AC-7): `Kraków Spring` →
 * `krakow-spring`, `Valentine's Day` → `valentines-day`.
 *
 * Apostrophes are dropped rather than hyphenated — `valentines-day`, not `valentine-s-day` —
 * which is the only rule in the fold that a reader could get wrong twice.
 */
export function asciiFoldSlug(name: string): string {
  const folded = [...name.toLowerCase()]
    .map((character) => TRANSLITERATIONS[character] ?? character)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");
  return folded
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "");
}

/** The translatable fields of a copy row, in the fixed order `sourceHash` canonicalises them. */
const HASHED_FIELDS = [
  "name",
  "descriptionMd",
  "seoTitle",
  "seoDescription",
] as const;

/** The source text a `sourceHash` is taken over, canonicalised (decision 4 in the header). */
export interface CopySource {
  readonly name: string;
  readonly descriptionMd?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export function copySourceText(row: CopySource): string {
  return HASHED_FIELDS.map((field) => `${field}=${row[field] ?? ""}`).join(
    "\n",
  );
}

/**
 * sha256 of the `en` row's translatable text, lowercase hex — the drift record of `plan/03` §6
 * step 5 and the value every locale's row stores. A locale's own row hashes the **English**
 * source, never its own translation: that is what makes an English edit flip every dependant
 * stale (spec 006 §7).
 */
export function copySourceHash(row: CopySource): string {
  return createHash("sha256").update(copySourceText(row), "utf8").digest("hex");
}

/** `product:FO-BQ-001` — the identity of a copy row across locales. */
export function copyRowKey(entity: SeedCopyEntity, key: string): string {
  return `${entity}:${key}`;
}
