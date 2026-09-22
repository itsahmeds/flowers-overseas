/**
 * One deliberately failing fixture per `corridor:check` rule (spec 007 AC-2 / T-03; TASK-087).
 *
 * A case is a **small, declarative overlay on the committed corpus**: it names the file it edits
 * (or the file it copies and where to), the rule it must trip, a substring the message has to
 * contain, and the one or two mutations that introduce the fault. `applyCorridorCheckCase()`
 * returns a new list of source files, so a case costs no temp directory and no file copy.
 *
 * Why not "a fixture is a whole corridor file": a corridor guide is 600+ authored words, and
 * eighteen committed copies of one would rot the first time the Poland guide is reworded — and a
 * rotted fixture is worse than no fixture, because it fails for the wrong reason and nobody
 * notices. This is `seed/check-cases.ts`'s design, applied to markdown instead of JSON.
 *
 * `alsoRules` is the honesty clause. A fixture that quietly trips a second rule could pass for the
 * wrong reason, so each case declares every rule it is allowed to break and why, and
 * `tests/unit/corridor-check.test.ts` holds it to that list exactly.
 */
import { stringify as stringifyYaml } from "yaml";

import type { CorridorCheckRule } from "./corridor-check.ts";
import type { CorridorSourceFile } from "../src/modules/geo/content/corpus.ts";
import {
  splitCorridorFile,
  type ContentParseIssue,
} from "../src/modules/geo/content/parse.ts";

/** The mutations a case may apply. Each one is the smallest edit that introduces its fault. */
export type CorridorCaseOp =
  /** Replace the whole file with arbitrary text — how the `parses` fixture stops being a file. */
  | { readonly op: "setRaw"; readonly text: string }
  /** Set one frontmatter field. */
  | { readonly op: "setField"; readonly field: string; readonly value: unknown }
  /** Remove one frontmatter field. */
  | { readonly op: "unsetField"; readonly field: string }
  /** Replace the markdown body. */
  | { readonly op: "setBody"; readonly text: string }
  /** Append a sentence to the markdown body. */
  | { readonly op: "appendBody"; readonly text: string }
  /** Keep the first `count` FAQ items (or repeat the first until there are `count`). */
  | { readonly op: "setFaqCount"; readonly count: number };

/** One case: what it breaks, where, and what the gate must say about it. */
export interface CorridorCheckCase {
  readonly rule: CorridorCheckRule;
  /** A substring of the message the gate must print: the line has to *name the fault*. */
  readonly expect: string;
  /** Every other rule this fixture is allowed to trip, with the reason in `why`. */
  readonly alsoRules?: readonly CorridorCheckRule[];
  /** Why this mutation is the right fixture for this rule (read by a human, not by code). */
  readonly why: string;
  /** The committed file the case edits, relative to `content/corridors/`. */
  readonly file: string;
  /** When set, the case adds a **copy** of `file` at this path instead of editing `file`. */
  readonly as?: string;
  readonly ops: readonly CorridorCaseOp[];
}

/** Serialise frontmatter and body back into a corridor file. */
export function renderCorridorFile(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return `---\n${stringifyYaml(frontmatter)}---\n${body}`;
}

function applyOps(
  source: string,
  ops: readonly CorridorCaseOp[],
  path: string,
): string {
  const raw = ops.find((op) => op.op === "setRaw");
  if (raw !== undefined) return raw.text;

  const split = splitCorridorFile(path, source);
  if (!split.ok) {
    throw new Error(
      `fixture base does not parse: ${split.issues
        .map((issue: ContentParseIssue) => issue.message)
        .join("; ")}`,
    );
  }
  const frontmatter = { ...(split.frontmatter as Record<string, unknown>) };
  let body = split.body;

  for (const op of ops) {
    switch (op.op) {
      case "setRaw":
        break;
      case "setField":
        frontmatter[op.field] = op.value;
        break;
      case "unsetField":
        delete frontmatter[op.field];
        break;
      case "setBody":
        body = op.text;
        break;
      case "appendBody":
        body = `${body.trimEnd()}\n\n${op.text}\n`;
        break;
      case "setFaqCount": {
        const faq = Array.isArray(frontmatter["faq"])
          ? [...(frontmatter["faq"] as unknown[])]
          : [];
        const first = faq[0];
        while (faq.length < op.count && first !== undefined) faq.push(first);
        frontmatter["faq"] = faq.slice(0, op.count);
        break;
      }
    }
  }
  return renderCorridorFile(frontmatter, body);
}

/**
 * Apply one case to a corpus, returning a new corpus. The committed files are never mutated: the
 * result is a new array, so a test may run every case against the same base value.
 */
export function applyCorridorCheckCase(
  files: readonly CorridorSourceFile[],
  testCase: CorridorCheckCase,
): readonly CorridorSourceFile[] {
  const base = files.find((file) => file.path === testCase.file);
  if (base === undefined) {
    throw new Error(
      `case names a file that is not in the corpus: ${testCase.file}`,
    );
  }
  const path = testCase.as ?? testCase.file;
  const source = applyOps(base.source, testCase.ops, path);
  const mutated: CorridorSourceFile = { path, source };
  // `as` **replaces** the file at that path when the corpus already has one, and adds it when it
  // does not. Appending unconditionally would put two files at one path in the corpus, and a rule
  // that reads across the corpus (5, 18) would then be measuring a file against itself.
  return [...files.filter((file) => file.path !== path), mutated].sort(
    (a, b) => (a.path < b.path ? -1 : 1),
  );
}

/** The eight generic questions the `faq-country-specific` fixture replaces the real ones with. */
const GENERIC_FAQ = [
  {
    q: "How do I place an order?",
    a: "You choose a bouquet, tell us where it is going and pay online.",
  },
  {
    q: "Can I add a card message?",
    a: "Yes. We write your message by hand and it travels with the flowers.",
  },
  {
    q: "What if nobody is home?",
    a: "We hold the flowers and agree a new time with the person receiving them.",
  },
  {
    q: "Can I send flowers to a hospital?",
    a: "Often yes, and we check the ward's rules with the florist first.",
  },
  {
    q: "Do you send the same bouquet as the photo?",
    a: "We match the shape, the size and the colours of what you chose.",
  },
  {
    q: "How do I pay?",
    a: "Card, and the local wallets we support in your own currency.",
  },
  {
    q: "Can I change my order?",
    a: "Write to us before the flowers are made and we will change it.",
  },
  {
    q: "Who do I talk to if something is wrong?",
    a: "Us. We answer every message ourselves and we put it right.",
  },
];

/**
 * One deliberately failing fixture per rule, in `CORRIDOR_CHECK_RULES` order (T-03's eighteen
 * cases). Every case edits or copies the committed Poland guide, so the corpus these run against
 * is the corpus that ships.
 */
export const CORRIDOR_CHECK_CASES: readonly CorridorCheckCase[] = [
  {
    rule: "parses",
    expect: "no `---` YAML frontmatter block",
    alsoRules: ["en-gb-overrides"],
    why: "a file with no frontmatter is the commonest authoring mistake and must name the file, not throw. It correctly takes the `en-gb` Poland page down with it: that file says `extends: en`, and once the `en` Poland guide has stopped being a file there is no base to compare its overrides against, which rule 17 reports as the missing base rather than passing it in silence.",
    file: "en/pl-guide.md",
    ops: [{ op: "setRaw", text: "# Poland\n\nJust prose, no frontmatter.\n" }],
  },
  {
    rule: "source-human",
    expect: "never machine-drafted",
    why: "plan/02 §12: a machine-drafted corridor page must be impossible, not merely discouraged.",
    file: "en/pl-guide.md",
    ops: [{ op: "setField", field: "source", value: "machine" }],
  },
  {
    rule: "body-word-floor",
    expect: "at least 600",
    why: "the 600-word floor is what stops a programmatic stub from becoming a page.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "setBody",
        text: "## Sending flowers there\n\nWe are choosing the florists we want to work with.\n",
      },
    ],
  },
  {
    rule: "intro-word-range",
    expect: "120–200 are required",
    why: "an intro under the band is a snippet; over it, the page opens with an essay.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "setField",
        field: "intro",
        value:
          "We know this country well and we would like to tell you about it.",
      },
    ],
  },
  {
    rule: "token-distinctness",
    expect: "shingle distinctness",
    alsoRules: ["faq-country-specific", "other-country-in-body"],
    why: "the copy of one guide filed under another country is exactly the duplication plan/02 §5.2 measures — a templated page scores near zero on the 5-gram shingle metric of spec 007 §14 A4 — and it also, correctly, reads as a page about the wrong country.",
    file: "en/pl-guide.md",
    as: "en/nl-guide.md",
    ops: [{ op: "setField", field: "relatedIso2", value: ["PL", "RO", "DE"] }],
  },
  {
    rule: "faq-count",
    expect: "8–12 are required",
    why: "seven questions is below the band a FAQPage may describe.",
    file: "en/pl-guide.md",
    ops: [{ op: "setFaqCount", count: 7 }],
  },
  {
    rule: "faq-country-specific",
    expect: "FAQ questions name the country",
    why: "eight questions that could sit on any country's page are the thin-content failure the rule exists for.",
    file: "en/pl-guide.md",
    ops: [{ op: "setField", field: "faq", value: GENERIC_FAQ }],
  },
  {
    rule: "seo-title",
    expect: "the limit is 60",
    why: "a title over 60 characters is truncated in the result and stops being the authored title.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "setField",
        field: "seoTitle",
        value:
          "Send flowers with our own florists, written and checked by the people who answer your messages",
      },
    ],
  },
  {
    rule: "seo-description",
    expect: "the limit is 155",
    why: "the same truncation, on the line that decides the click.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "setField",
        field: "seoDescription",
        value:
          "We chose every florist ourselves and we answer every message ourselves, which is why this page tells you what happens on the day, what the flowers mean where they are going, what you should not send, and what we cannot promise yet.",
      },
    ],
  },
  {
    rule: "own-slug-in-body",
    expect: "own URL slug",
    why: "plan/02 §5.3's grep: a URL pasted into prose is a slug leak, and it is how a template starts writing itself.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "appendBody",
        text: "You can read the rest at /en/send-flowers-to/poland.",
      },
    ],
  },
  {
    rule: "other-country-in-body",
    expect: "names another destination",
    why: "the fleurop.de failure: 'Empfänger in Frankreich' on a Poland page.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "appendBody",
        text: "Buyers often ask us about Germany as well.",
      },
    ],
  },
  {
    rule: "banned-words",
    expect: "banned word",
    why: "spec 004 §14 A5: we make it and our florist delivers it — the buyer never meets the word.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "appendBody",
        text: "Our partner in each city makes the bouquet.",
      },
    ],
  },
  {
    rule: "guide-claims",
    expect: "delivery timing claim",
    why: "a guide page has no florist and no cutoff, so a time on it is a promise nobody can keep.",
    file: "en/pl-guide.md",
    ops: [{ op: "appendBody", text: "Order by 14:00 and we deliver it." }],
  },
  {
    rule: "scale-claim",
    expect: "digit-bearing claim of scale",
    why: "plan/10 §3: we count nothing we cannot show, and a number is the easiest thing to invent.",
    file: "en/pl-guide.md",
    ops: [{ op: "appendBody", text: "We already cover 40 cities there." }],
  },
  {
    rule: "price-literal",
    expect: "price literal",
    why: "a price in prose is a price nobody can charge; the shown price comes from the price data.",
    file: "en/pl-guide.md",
    ops: [
      {
        op: "appendBody",
        // Both forms in one fixture: the `zł` form is the destination's own price literal and the
        // one `/review 63` found escaping the rule behind an ASCII `\b`; `€29` is the original
        // fixture, kept so the symbol branch cannot regress either.
        text: "Bouquets start at 129 zł there, and €29 from here.",
      },
    ],
  },
  {
    rule: "live-operations",
    expect: "no complete `operations` block",
    alsoRules: ["token-distinctness"],
    why: "the live state must be unreachable while no cutoff has been agreed; the copy is deliberately the guide's, which is what the distinctness rule then says. Germany, because Poland has had an `operations` block since TASK-124 (spec 009 §13 Q3) and a live Polish file is now permitted — the rule's subject is a country with no block.",
    file: "en/de-guide.md",
    as: "en/de-live.md",
    ops: [],
  },
  {
    rule: "en-gb-overrides",
    expect: "without overriding",
    why: "two English pages that differ in nothing are one page with two URLs (plan/02 §4.2).",
    file: "en/pl-guide.md",
    as: "en-gb/pl-guide.md",
    ops: [{ op: "setField", field: "extends", value: "en" }],
  },
  {
    rule: "related-targets",
    expect: "has a free slot",
    why: "spec 007 §14 A3 made reciprocity owed wherever the target can carry it, so the fixture has to be an omission rather than a full target: the Netherlands guide drops Germany and keeps only two neighbours, while Germany still names `NL`. That edge now points one way into a page with a slot going spare, which is the authoring mistake the rule exists to catch — and it is one field on one file, so nothing else moves.",
    file: "en/nl-guide.md",
    ops: [{ op: "setField", field: "relatedIso2", value: ["FR", "PL"] }],
  },
];
