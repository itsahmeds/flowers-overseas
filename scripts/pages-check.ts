/**
 * `pnpm pages:check` — the info-page honesty gate (spec 041 §2 "The honesty gate", §11, AC-5,
 * AC-16, AC-30; TASK-182).
 *
 * ```
 * pnpm pages:check            # exit 0 on a clean tree, one line per problem otherwise
 * pnpm pages:check --summary  # also print the page × locale table to the step summary (§11)
 * ```
 *
 * Every content file under `content/pages/` and `content/legal/` is read, and each problem is one
 * line naming the file, the field and the rule. The rules:
 *
 * | rule | fails when |
 * |---|---|
 * | `parses` | the name, the frontmatter or its shape does not parse (AC-3) |
 * | `seo-title` / `seo-description` | the title is over 60, the description over 155 characters |
 * | `reviewed-meta` | `reviewed: true` without `reviewedBy` and `reviewedAt` |
 * | `source-human` | `source: machine` in an `en` or `en-gb` file |
 * | `faq-count` | the help page's questions are outside 10–14 |
 * | `banned-words` | one of the nine words of `src/config/voice.ts`, in any prose |
 * | `relay-language` | a `RELAY_PATTERNS` match in any prose; `honestyAllow` never exempts one |
 * | `scale-claim` / `price-literal` | a digit-bearing claim of scale or a price literal |
 * | `trust-claims` | a trust page claims delivery timing, a cutoff, a delivery date, a florist count, a rating, a review or a delivery photo outside a sentence its `honestyAllow` lists |
 * | `honesty-allow-unused` | an `honestyAllow` entry matches no sentence, or a sentence that trips no claim pattern |
 * | `freshness-days` | a sentence states a number of days of freshness, or "7-day" (AC-16) |
 *
 * The claim, scale and price-literal patterns are `src/config/honesty.ts`'s, the list
 * `corridor:check` reads too (spec 041 §2 "One list, two readers"). Legal documents are exempt
 * from the claim patterns (a contract has to name delivery dates and refunds) and keep the
 * word, relay, scale and price rules.
 *
 * Pure over a corpus value (`checkInfoCorpus`), so the cases in `tests/unit/pages-check.test.ts`
 * are small overlays on the committed files. No clock, no network, no database.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CLAIM_PATTERNS,
  PRICE_LITERAL_PATTERN,
  SCALE_CLAIM_PATTERN,
  relayMatches,
  sentencesOf,
} from "../src/config/honesty.ts";
import { guaranteeTextViolations } from "../src/config/freshness-claim.ts";
import { bannedVoiceWordsIn } from "../src/config/voice.ts";
import { readInfoContent } from "../src/modules/content/corpus-files.ts";
import {
  type InfoSourceFile,
  type ParsedInfoFile,
  infoFilePath,
  parseInfoFile,
} from "../src/modules/content/parse.ts";
import {
  INFO_FAQ_MAX,
  INFO_FAQ_MIN,
  type HonestyAllow,
} from "../src/modules/content/schemas.ts";

const CLI_NAME = "pages:check";

export const PAGES_CHECK_RULES = [
  "parses",
  "seo-title",
  "seo-description",
  "reviewed-meta",
  "source-human",
  "faq-count",
  "banned-words",
  "relay-language",
  "scale-claim",
  "price-literal",
  "trust-claims",
  "honesty-allow-unused",
  "freshness-days",
] as const;
export type PagesCheckRule = (typeof PAGES_CHECK_RULES)[number];

export interface PagesCheckProblem {
  readonly file: string;
  readonly field: string;
  readonly rule: PagesCheckRule;
  readonly message: string;
}

/** The schema field a parse issue names, mapped to the rule it breaks. */
function ruleForField(field: string): PagesCheckRule {
  if (field === "seoTitle") return "seo-title";
  if (field === "seoDescription") return "seo-description";
  if (field === "reviewedBy" || field === "reviewedAt") return "reviewed-meta";
  return "parses";
}

/** Every prose field of a parsed file, as `[field, text]` pairs. */
function proseOf(file: ParsedInfoFile): readonly (readonly [string, string])[] {
  if (file.kind === "extends") return [];
  const content = file.content;
  const fields: [string, string][] = [
    ["seoTitle", content.seoTitle],
    ["seoDescription", content.seoDescription],
    ["h1", content.h1],
  ];
  if (file.kind === "legal") {
    const legal = file.content;
    fields.push(["body", file.body]);
    legal.changeLog.forEach((entry, index) => {
      fields.push([`changeLog.${String(index)}.summary`, entry.summary]);
    });
    (legal.links ?? []).forEach((link, index) => {
      fields.push([`links.${String(index)}.label`, link.label]);
    });
    for (const [group, labels] of Object.entries(legal.labels ?? {})) {
      for (const [name, text] of Object.entries(labels ?? {})) {
        fields.push([`labels.${group}.${name}`, text]);
      }
    }
    if (legal.interim !== undefined) {
      fields.push(["interim.heading", legal.interim.heading]);
    }
    return fields;
  }
  const trust = file.content;
  if (trust.intro !== undefined) fields.push(["intro", trust.intro]);
  trust.sections.forEach((section, index) => {
    const at = `sections.${String(index)}`;
    fields.push([`${at}.heading`, section.heading]);
    if (section.body !== undefined) fields.push([`${at}.body`, section.body]);
    (section.items ?? []).forEach((item, itemIndex) => {
      fields.push([
        `${at}.items.${String(itemIndex)}`,
        `${item.title} ${item.text}`,
      ]);
    });
  });
  (trust.faq ?? []).forEach((item, index) => {
    fields.push([`faq.${String(index)}.q`, item.q]);
    fields.push([`faq.${String(index)}.a`, item.a]);
  });
  trust.links.forEach((link, index) => {
    fields.push([`links.${String(index)}.label`, link.label]);
  });
  return fields;
}

function normalise(sentence: string): string {
  return sentence.replaceAll(/\s+/gu, " ").trim();
}

/** The checks over one parsed file. */
function checkFile(file: ParsedInfoFile, path: string): PagesCheckProblem[] {
  const problems: PagesCheckProblem[] = [];
  const push = (field: string, rule: PagesCheckRule, message: string): void => {
    problems.push({ file: path, field, rule, message });
  };
  if (file.kind === "extends") return problems;

  if (
    file.content.source === "machine" &&
    (file.locale === "en" || file.locale === "en-gb")
  ) {
    push(
      "source",
      "source-human",
      "an `en` or `en-gb` file is written by a person, never machine-drafted (plan/02 §12)",
    );
  }
  if (file.kind === "trust" && file.pageId === "help") {
    const count = file.content.faq?.length ?? 0;
    if (count < INFO_FAQ_MIN || count > INFO_FAQ_MAX) {
      push(
        "faq",
        "faq-count",
        `the help page has ${String(count)} questions; spec 041 §2 asks for 10–14`,
      );
    }
  }

  const allow: readonly HonestyAllow[] =
    file.kind === "trust"
      ? file.content.honestyAllow
      : (file.content.honestyAllow ?? []);
  const allowed = new Set(allow.map((entry) => normalise(entry.sentence)));
  const allowUsed = new Set<string>();

  for (const [field, text] of proseOf(file)) {
    for (const word of bannedVoiceWordsIn(text)) {
      push(
        field,
        "banned-words",
        `uses the banned word \`${word}\` (spec 004 §14 A5, src/config/voice.ts)`,
      );
    }
    for (const match of relayMatches(text, file.locale)) {
      push(
        field,
        "relay-language",
        `relay language \`${match.match}\` (${match.id}) in "${match.sentence}"; no honestyAllow entry can exempt it (spec 041 AC-30)`,
      );
    }
    const scale = SCALE_CLAIM_PATTERN.exec(text);
    if (scale !== null) {
      push(
        field,
        "scale-claim",
        `a digit-bearing claim of scale (\`${scale[0].trim()}\`); we count nothing we cannot show`,
      );
    }
    const price = PRICE_LITERAL_PATTERN.exec(text);
    if (price !== null) {
      push(
        field,
        "price-literal",
        `a price literal (\`${price[0].trim()}\`); prices are data, formatted by formatMoney`,
      );
    }
    // The one freshness matcher (`src/config/freshness-claim.ts`, spec 009 §14 A11), never a
    // second copy: the retired "7-day" in any spelling, an ICU argument naming days, a number of
    // days beside a freshness word, and a day count beside a guarantee word.
    for (const violation of guaranteeTextViolations(text)) {
      push(
        field,
        "freshness-days",
        `states a number of days of freshness (${violation.check}: ${violation.detail}); spec 041 AC-16, spec 009 §14 A11`,
      );
    }
    if (file.kind !== "trust") continue;
    for (const sentence of sentencesOf(text)) {
      const key = normalise(sentence);
      for (const claim of CLAIM_PATTERNS) {
        const match = claim.pattern.exec(sentence);
        if (match === null) continue;
        if (allowed.has(key)) {
          allowUsed.add(key);
          continue;
        }
        push(
          field,
          "trust-claims",
          `makes a ${claim.label} claim (\`${match[0].trim()}\`) in "${key}"; list the sentence in honestyAllow with a reason, or reword it (spec 041 §2)`,
        );
      }
    }
  }

  allow.forEach((entry, index) => {
    if (!allowUsed.has(normalise(entry.sentence))) {
      push(
        `honestyAllow.${String(index)}`,
        "honesty-allow-unused",
        `"${entry.sentence}" matches no sentence that trips a claim pattern; remove the entry (spec 041 §2)`,
      );
    }
  });
  return problems;
}

/** The whole gate over a corpus value: pure, so the tests drive it with overlays. */
export function checkInfoCorpus(
  files: readonly InfoSourceFile[],
): readonly PagesCheckProblem[] {
  const problems: PagesCheckProblem[] = [];
  for (const source of files) {
    const path = infoFilePath(source.path);
    const result = parseInfoFile(source.path, source.source);
    if (!result.ok) {
      for (const issue of result.issues) {
        problems.push({
          file: issue.file,
          field: issue.field,
          rule: ruleForField(issue.field),
          message: issue.message,
        });
      }
      continue;
    }
    problems.push(...checkFile(result.file, path));
  }
  return problems;
}

/** §11's build-time table: page × locale × reviewed × (legal) inForce / lawyerReviewed. */
export function summaryTable(files: readonly InfoSourceFile[]): string {
  const rows = [
    "| page | locale | reviewed | in force | lawyer reviewed |",
    "|---|---|---|---|---|",
  ];
  for (const source of files) {
    const result = parseInfoFile(source.path, source.source);
    if (!result.ok) continue;
    const file = result.file;
    if (file.kind === "extends") {
      rows.push(`| ${file.pageId} | ${file.locale} | extends en | | |`);
      continue;
    }
    const legal = file.kind === "legal" ? file.content : undefined;
    rows.push(
      `| ${file.pageId} | ${file.locale} | ${String(file.content.reviewed)} | ${legal === undefined ? "" : String(legal.inForce)} | ${legal === undefined ? "" : String(legal.lawyerReviewed)} |`,
    );
  }
  return `${rows.join("\n")}\n`;
}

function main(): number {
  const files = readInfoContent();
  const problems = checkInfoCorpus(files);
  if (process.argv.includes("--summary")) {
    const table = `## Info pages (spec 041 §11)\n\n${summaryTable(files)}`;
    process.stdout.write(table);
    const target = process.env["GITHUB_STEP_SUMMARY"];
    if (target !== undefined && target !== "") appendFileSync(target, table);
  }
  if (problems.length === 0) {
    process.stdout.write(
      `${CLI_NAME}: ${String(files.length)} content file(s), all ${String(PAGES_CHECK_RULES.length)} rules clean.\n`,
    );
    return 0;
  }
  process.stderr.write(
    `${CLI_NAME} failed with ${String(problems.length)} problem(s):\n`,
  );
  for (const problem of problems) {
    process.stderr.write(
      `  - ${problem.file} [${problem.field}] ${problem.rule}: ${problem.message}\n`,
    );
  }
  return 1;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = main();
}
