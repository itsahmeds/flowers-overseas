/**
 * `pnpm i18n:check` check 10, "drafts" (spec 003 §14 A15 clauses 4 to 6, AC-33, AC-35, AC-37,
 * AC-39; TASK-185).
 *
 * `de` and `pl` carry agent-written drafts, not echoed English. This module holds the rules that
 * keep them so, and `scripts/i18n-check.ts` runs them on every tree it checks under a policy:
 *
 *  - **Identical to `en`.** For every registry locale whose primary language is not `en`'s (today
 *    `de` and `pl`; `en-gb` stays under check 5), a key whose value, resolved through the fallback
 *    chain, is byte-identical to `en`'s is a fault, naming the catalogue file and the key, unless
 *    `content/i18n/draft-policy.json` excludes the key (clause 4) or lists it under that locale's
 *    `identical` with a reason from the closed set (`name`, `same-word`, `icu-only`, `held`).
 *  - **Stale `identical` entries.** An entry whose key no longer exists in `en`, or whose value no
 *    longer equals `en`'s, is a fault: the allow-list may not outlive the reason it was granted.
 *  - **The policy file itself.** Zod-validated (`DraftPolicySchema`). An `identical` entry with a
 *    reason outside the closed set, or a `held` entry with no task id, is a fault naming the file
 *    and the key. Every `reviewBeforeOrders` entry names an `en` key, a `prefix.*` that reaches
 *    one, or the token `seed:products`; none is also excluded.
 *  - **The drafted values** (`draftValueProblems`, AC-37). Every `de`/`pl` value whose review
 *    record says `machine` and whose text differs from `en`'s passes six rules: the voice scan in
 *    English, German and Polish (`bannedVoiceWordsIn`), spec 009 A11's freshness scan, the home rule
 *    (no `home.*` value states a price or that VAT and delivery are included), the register rule
 *    (`Sie` in German, `Ty` in Polish), the brand rule ("Flowers Overseas" uninflected, in exactly
 *    the keys where `en` has it) and the Polish plural rule (`one`, `few`, `many`, `other`). A
 *    seventh, clause 4's "no hand-typed formatting", refuses a digit, currency sign or `%` that
 *    the `en` value lacks.
 *
 * **Which policy a run reads.** `--policy <file>` when given; otherwise the committed file, over
 * the committed tree only (this repository's own `messages/`), exactly as check 11 reads its
 * registry. A fixture tree with no `--policy` runs without check 10: the one-fault fixtures of
 * `tests/fixtures/i18n/_cases/` model pre-A15 echoes on purpose, and the committed tree, which is
 * what CI gates, always runs it. Rules over prose read the text of the ICU message, not its
 * argument names or select keywords: the `partner` case keyword of `home.sentence.who` is syntax,
 * and the voice rule reads what the case renders.
 */
import { existsSync, readFileSync } from "node:fs";

import { TYPE, parse } from "@formatjs/icu-messageformat-parser";
import { z } from "zod";

import { freshnessClaims } from "../src/config/freshness-claim.ts";
import { bannedVoiceWordsIn } from "../src/config/voice.ts";

/** The committed policy, relative to the repository root. */
export const DRAFT_POLICY_FILE = "content/i18n/draft-policy.json";

/** The brand, never translated, never inflected (glossary.pl §2). */
export const BRAND = "Flowers Overseas";

/** The token in `reviewBeforeOrders` that stands for every drafted seed product row. */
export const SEED_PRODUCTS_TOKEN = "seed:products";

/** Clause 6's closed set of reasons a value may stay identical to `en`. */
export const IDENTICAL_REASONS = [
  "name",
  "same-word",
  "icu-only",
  "held",
] as const;

/** Why a key or seed row is never drafted (clause 4). */
export const EXCLUSION_REASONS = [
  "legal",
  "consent",
  "price-display",
  "sympathy-funeral-all-saints",
] as const;

const KEY_PATTERN =
  /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*(?:\.\*)?$/;
const TASK_PATTERN = /^TASK-\d{3,}$/;

const ExcludedEntrySchema = z.strictObject({
  key: z.string().regex(KEY_PATTERN, "a key or a `prefix.*`"),
  reason: z.enum(EXCLUSION_REASONS),
  note: z.string().min(1).optional(),
});

const ExcludedSeedRowSchema = z.strictObject({
  key: z.string().regex(/^FO-[A-Z]{2}-\d{3}$/, "a seed product key"),
  reason: z.literal("sympathy-funeral-all-saints"),
});

const IdenticalEntrySchema = z
  .strictObject({
    key: z.string().regex(KEY_PATTERN, "a message key"),
    reason: z.enum(IDENTICAL_REASONS),
    task: z
      .string()
      .regex(TASK_PATTERN, "a task id such as TASK-185")
      .optional(),
    note: z.string().min(1).optional(),
  })
  .refine((entry) => entry.reason !== "held" || entry.task !== undefined, {
    message: "a `held` entry names the task that fixes the English (`task`)",
    path: ["task"],
  });

export const DraftPolicySchema = z.strictObject({
  $comment: z.string().optional(),
  excluded: z.array(ExcludedEntrySchema),
  excludedSeedRows: z.array(ExcludedSeedRowSchema),
  reviewBeforeOrders: z.array(z.string().min(1)),
  identical: z.record(
    z.string().regex(/^[a-z]{2}(?:-[a-z]{2})?$/),
    z.array(IdenticalEntrySchema),
  ),
});

export type DraftPolicy = z.infer<typeof DraftPolicySchema>;
export type IdenticalEntry = DraftPolicy["identical"][string][number];

export interface DraftProblem {
  readonly file: string;
  readonly key?: string;
  readonly reason: string;
}

/** `consent.*` reaches `consent.headline`; `nav.utility.cutoff` reaches only itself. */
export function policyMatches(match: string, key: string): boolean {
  return match.endsWith(".*")
    ? key.startsWith(match.slice(0, -1))
    : key === match;
}

export function isExcluded(policy: DraftPolicy, key: string): boolean {
  return policy.excluded.some((entry) => policyMatches(entry.key, key));
}

/**
 * Read and validate a policy file. A schema fault is reported per issue, naming the entry's key
 * where the issue sits inside one (`identical.de[3].reason` names that entry's `key`), so a bad
 * reason is actionable from the CI log alone.
 */
export function readDraftPolicy(
  path: string,
  file: string,
): { policy?: DraftPolicy; problems: readonly DraftProblem[] } {
  if (!existsSync(path)) {
    return {
      problems: [
        {
          file,
          reason:
            "is missing: check 10 reads the draft policy (spec 003 §14 A15 clause 4)",
        },
      ],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      problems: [
        {
          file,
          reason: `is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
        },
      ],
    };
  }
  const parsed = DraftPolicySchema.safeParse(raw);
  if (parsed.success) return { policy: parsed.data, problems: [] };
  return {
    problems: parsed.error.issues.map((issue) => {
      const key = entryKeyAt(raw, issue.path);
      return {
        file,
        ...(key === undefined ? {} : { key }),
        reason: `is not a valid draft policy entry at \`${issue.path.map(String).join(".")}\`: ${issue.message}${issue.path.includes("reason") ? ` (the closed set is ${IDENTICAL_REASONS.join(", ")} for \`identical\`, ${EXCLUSION_REASONS.join(", ")} for \`excluded\`)` : ""}`,
      };
    }),
  };
}

function entryKeyAt(
  raw: unknown,
  path: readonly PropertyKey[],
): string | undefined {
  let node: unknown = raw;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) return undefined;
    const next: unknown = (node as Record<PropertyKey, unknown>)[segment];
    if (
      typeof next === "object" &&
      next !== null &&
      !Array.isArray(next) &&
      typeof (next as Record<string, unknown>)["key"] === "string"
    ) {
      return (next as Record<string, string>)["key"];
    }
    node = next;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// the six value rules (AC-37) and the formatting rule (clause 4)
// ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The text an ICU message renders, with each argument as a space and a plural's `#` as `#`:
 * literals, the branches of every plural and select, and the children of every tag. Argument
 * names and select keywords are syntax, not prose, so they are not in it. A value that does not
 * parse is returned as it is (check 3 reports it).
 */
export function icuProse(message: string): string {
  let elements: readonly unknown[];
  try {
    elements = parse(message, { requiresOtherClause: true });
  } catch {
    return message;
  }
  const parts: string[] = [];
  const walk = (nodes: readonly unknown[]): void => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const type = node["type"];
      if (type === TYPE.literal && typeof node["value"] === "string") {
        parts.push(node["value"]);
      } else if (type === TYPE.pound) {
        parts.push("#");
      } else if (type === TYPE.plural || type === TYPE.select) {
        const options = node["options"];
        if (isRecord(options)) {
          for (const option of Object.values(options)) {
            parts.push(" ");
            if (isRecord(option) && Array.isArray(option["value"])) {
              walk(option["value"] as readonly unknown[]);
            }
            parts.push(" ");
          }
        }
      } else if (type === TYPE.tag && Array.isArray(node["children"])) {
        walk(node["children"] as readonly unknown[]);
      } else {
        parts.push(" ");
      }
    }
  };
  walk(elements);
  return parts.join("");
}

/** Every cardinal plural's category set, in document order. */
export function pluralCategories(
  message: string,
): readonly (readonly string[])[] {
  let elements: readonly unknown[];
  try {
    elements = parse(message, { requiresOtherClause: true });
  } catch {
    return [];
  }
  const found: string[][] = [];
  const walk = (nodes: readonly unknown[]): void => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const options = node["options"];
      if (
        node["type"] === TYPE.plural &&
        node["pluralType"] !== "ordinal" &&
        isRecord(options)
      ) {
        found.push(Object.keys(options));
      }
      if (isRecord(options)) {
        for (const option of Object.values(options)) {
          if (isRecord(option) && Array.isArray(option["value"])) {
            walk(option["value"] as readonly unknown[]);
          }
        }
      }
      if (Array.isArray(node["children"])) {
        walk(node["children"] as readonly unknown[]);
      }
    }
  };
  walk(elements);
  return found;
}

/** CLDR's cardinal categories for Polish; every Polish plural carries all four (glossary.pl §2). */
export const POLISH_PLURAL_CATEGORIES = [
  "one",
  "few",
  "many",
  "other",
] as const;

/** A letter, digit or underscore on either side breaks a match (Unicode word boundaries). */
function word(source: string, flags = "iu"): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`,
    flags,
  );
}

/**
 * The register rule (clause 4, open item (a)): German addresses the reader as `Sie`, Polish as
 * `Ty`. Case-insensitive, whole words.
 */
export const REGISTER_PATTERNS: Readonly<Record<"de" | "pl", RegExp>> = {
  de: word("du|dich|dir|dein|deine|deinem|deinen|deiner|deines"),
  pl: word(
    "pan|pana|panu|panem|panie|pani|panią|państwo|państwa|państwu|państwem",
  ),
};

/**
 * The home rule (decisions log 2026-10-04, "No VAT-and-delivery line on the home"): no `home.*`
 * value states a price (a currency sign or code), VAT, or that something is included in the
 * price, in English, German or Polish. Over-inclusive on purpose, like the voice scan: a false
 * positive costs one rewording. The bare word "price" is not on it: "every price is final" says
 * how we price, not what anything costs.
 */
export const HOME_PRICE_PATTERN = new RegExp(
  [
    "[€£$]",
    String.raw`(?<![\p{L}\p{N}_])(?:zł|pln|eur|gbp|euro|euros|złotych)(?![\p{L}\p{N}_])`,
    String.raw`(?<![\p{L}\p{N}_])(?:vat|vat-u|mwst|ust)(?![\p{L}\p{N}_])`,
    "mehrwertsteuer",
    "umsatzsteuer",
    "inkl\\.",
    "inklusive",
    "im preis",
    "w cenie",
    "wliczon",
    "podat",
    "includ",
    "zawier",
    String.raw`(?<![\p{L}\p{N}_])(?:delivery and vat|vat and delivery)(?![\p{L}\p{N}_])`,
  ].join("|"),
  "iu",
);

/** An inflected or hyphen-joined brand: "Flowers Overseasie", "Flowers-Overseas-Team". */
const BRAND_ANY = /Flowers[\s -]+Overseas/u;
const BRAND_INFLECTED =
  /Flowers\s+Overseas(?=[\p{L}\p{N}'’\-])|Flowers-Overseas/u;

/** Digit runs, currency signs and `%`: what clause 4 forbids a draft to add. */
const TYPED_FORMATTING = /\p{Nd}+|[€£$%]/gu;

export interface DraftValue {
  readonly locale: string;
  readonly key: string;
  readonly value: string;
  readonly enValue: string;
  /** False for seed copy (markdown, not ICU): its prose is the text as written. */
  readonly icu?: boolean;
}

/**
 * Every rule a drafted `de`/`pl` value breaks, as reasons. An empty array means the value passes
 * the six checks of AC-37 and clause 4's formatting rule.
 */
export function draftValueProblems(draft: DraftValue): readonly string[] {
  const { locale, key, value, enValue } = draft;
  const icu = draft.icu ?? true;
  const prose = icu ? icuProse(value) : value;
  const enProse = icu ? icuProse(enValue) : enValue;
  const language = locale.split("-")[0] ?? locale;
  const problems: string[] = [];

  const voice = bannedVoiceWordsIn(prose, { locale, messageKey: key });
  if (voice.length > 0) {
    problems.push(
      `uses a banned voice word (spec 004 §14 A5; A15 clause 5): ${voice.map((term) => `"${term}"`).join(", ")}`,
    );
  }

  const freshness = freshnessClaims(value);
  if (freshness.length > 0) {
    problems.push(
      `promises a number of days of freshness (spec 009 §14 A11): ${freshness.map((claim) => `"${claim.claim}" beside "${claim.freshness}"`).join(", ")}`,
    );
  }

  if (key.startsWith("home.")) {
    const price = HOME_PRICE_PATTERN.exec(prose);
    if (price !== null) {
      problems.push(
        `states a price or that VAT and delivery are included on the home ("${price[0]}"; decisions log 2026-10-04)`,
      );
    }
  }

  if (language === "de" || language === "pl") {
    const register = REGISTER_PATTERNS[language].exec(prose);
    if (register !== null) {
      problems.push(
        language === "de"
          ? `addresses the reader as \`du\` ("${register[0]}"): German drafts use \`Sie\` (A15 open item (a))`
          : `addresses the reader formally ("${register[0]}"): Polish drafts use \`Ty\` (spec 003 §13 Q2)`,
      );
    }
  }

  const enHasBrand = BRAND_ANY.test(enProse);
  const hasBrand = prose.includes(BRAND);
  if (BRAND_INFLECTED.test(prose)) {
    problems.push(
      `inflects or hyphenates the brand: "${BRAND}" is never translated or inflected (glossary.pl §2)`,
    );
  } else if (enHasBrand !== hasBrand) {
    problems.push(
      enHasBrand
        ? `drops the brand: \`en\` names "${BRAND}" and the draft must too, uninflected`
        : `adds the brand: "${BRAND}" appears only in the keys where \`en\` has it`,
    );
  }

  if (language === "pl" && icu) {
    for (const categories of pluralCategories(value)) {
      const missing = POLISH_PLURAL_CATEGORIES.filter(
        (category) => !categories.includes(category),
      );
      if (missing.length > 0) {
        problems.push(
          `has a plural without ${missing.map((category) => `\`${category}\``).join(", ")}: every Polish plural carries one, few, many and other (glossary.pl §2)`,
        );
      }
    }
  }

  const allowed = new Set(enProse.match(TYPED_FORMATTING) ?? []);
  const added = [...new Set(prose.match(TYPED_FORMATTING) ?? [])].filter(
    (token) => token !== "#" && !allowed.has(token),
  );
  if (added.length > 0) {
    problems.push(
      `types a number, currency sign or percent the \`en\` value lacks (${added.map((token) => `"${token}"`).join(", ")}): prices and dates come from \`Intl\` (A15 clause 4)`,
    );
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// check 10
// ---------------------------------------------------------------------------------------------

export interface DraftLocale {
  readonly code: string;
  /** Repo-relative catalogue path, named in a fault. */
  readonly cataloguePath: string;
  /** The value `resolveCatalogue()` gives the key, after the fallback chain. */
  readonly resolved: (key: string) => string | undefined;
  /** The locale's own authored values. */
  readonly flat: ReadonlyMap<string, string>;
  /** `machine` | `human` per key, from the locale's manifest. */
  readonly source: (key: string) => string | undefined;
}

export interface DraftCheckInput {
  readonly policy: DraftPolicy;
  readonly policyFile: string;
  readonly sourceFlat: ReadonlyMap<string, string>;
  /** The locales check 10 covers: primary language other than `en`'s. */
  readonly locales: readonly DraftLocale[];
}

export interface DraftCheckResult {
  readonly problems: readonly DraftProblem[];
  /** Per locale, the keys reported identical to `en`: the summary's "identical to `en`" column. */
  readonly identicalCount: ReadonlyMap<string, number>;
}

export function draftProblems(input: DraftCheckInput): DraftCheckResult {
  const { policy, policyFile, sourceFlat } = input;
  const problems: DraftProblem[] = [];
  const identicalCount = new Map<string, number>();
  const sourceKeys = [...sourceFlat.keys()];

  // The policy against the catalogue.
  for (const entry of policy.reviewBeforeOrders) {
    if (entry === SEED_PRODUCTS_TOKEN) continue;
    const reached = sourceKeys.filter((key) => policyMatches(entry, key));
    if (!KEY_PATTERN.test(entry) || reached.length === 0) {
      problems.push({
        file: policyFile,
        key: entry,
        reason: `is under \`reviewBeforeOrders\` but names no \`en\` key: every entry names a key, a \`prefix.*\` that reaches one, or \`${SEED_PRODUCTS_TOKEN}\` (A15 clause 4)`,
      });
      continue;
    }
    const excluded = reached.filter((key) => isExcluded(policy, key));
    if (excluded.length > 0) {
      problems.push({
        file: policyFile,
        key: entry,
        reason: `is under both \`reviewBeforeOrders\` and \`excluded\` (${excluded.join(", ")}): an excluded key is not drafted, so a person writes it, and it is not also a draft to review (A15 clause 4)`,
      });
    }
  }

  for (const locale of input.locales) {
    const allowed = new Map(
      (policy.identical[locale.code] ?? []).map((entry) => [entry.key, entry]),
    );
    let identical = 0;

    for (const [key, enValue] of sourceFlat) {
      if (isExcluded(policy, key)) continue;
      const value = locale.resolved(key);
      if (value === enValue) {
        if (allowed.has(key)) continue;
        identical += 1;
        problems.push({
          file: locale.cataloguePath,
          key,
          reason: `is identical to \`en\` in \`${locale.code}\`: draft it (A15 clause 6), or list it under \`identical.${locale.code}\` in \`${policyFile}\` with a reason from ${IDENTICAL_REASONS.join(", ")}`,
        });
        continue;
      }
      if (value === undefined) continue;
      if (locale.source(key) !== "machine") continue;
      for (const reason of draftValueProblems({
        locale: locale.code,
        key,
        value,
        enValue,
      })) {
        problems.push({ file: locale.cataloguePath, key, reason });
      }
    }

    for (const [key, entry] of allowed) {
      const enValue = sourceFlat.get(key);
      if (enValue === undefined) {
        problems.push({
          file: policyFile,
          key,
          reason: `is a stale \`identical.${locale.code}\` entry: \`en\` has no such key`,
        });
      } else if (locale.resolved(key) !== enValue) {
        problems.push({
          file: policyFile,
          key,
          reason: `is a stale \`identical.${locale.code}\` entry (${entry.reason}): its \`${locale.code}\` value no longer equals \`en\`'s`,
        });
      } else if (isExcluded(policy, key)) {
        problems.push({
          file: policyFile,
          key,
          reason: `is under \`identical.${locale.code}\` and \`excluded\`: an excluded key needs no allow-list entry`,
        });
      }
    }

    identicalCount.set(locale.code, identical);
  }

  return { problems, identicalCount };
}

// ---------------------------------------------------------------------------------------------
// seed rows (clause 4's catalogue rule)
// ---------------------------------------------------------------------------------------------

export interface SeedProductRecord {
  readonly sku: string;
  readonly productType: string;
  readonly occasions: readonly string[];
}

/**
 * The product keys clause 4 excludes: `productType: "funeral"`, or `sympathy` or `all_saints`
 * among `occasions`. `excludedSeedRows` must equal this set.
 */
export function excludedSeedRowKeys(
  products: readonly SeedProductRecord[],
): readonly string[] {
  return products
    .filter(
      (product) =>
        product.productType === "funeral" ||
        product.occasions.includes("sympathy") ||
        product.occasions.includes("all_saints"),
    )
    .map((product) => product.sku)
    .sort();
}
