/**
 * T-05 / AC-5 (spec 041; TASK-182): `pnpm pages:check` exits 0 on the committed tree and fails
 * one fixture per rule, naming the file, the field and the rule. Each fixture is a small overlay
 * on the committed files, so a case breaks exactly one thing. `corridor:check`'s own cases are
 * unchanged after the patterns moved to `src/config/honesty.ts` (`tests/unit/corridor-check.test.ts`).
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { staticInfoContentProvider } from "../../src/modules/content/index.ts";
import {
  PAGES_CHECK_RULES,
  type PagesCheckRule,
  checkInfoCorpus,
  summaryTable,
} from "../../scripts/pages-check.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FILES = staticInfoContentProvider.files();

function withFile(path: string, edit: (source: string) => string) {
  return FILES.map((file) =>
    file.path === path ? { path, source: edit(file.source) } : file,
  );
}

function sectionBody(path: string, from: string, to: string) {
  return withFile(path, (source) => {
    expect(source, `${path} holds the text the case edits`).toContain(from);
    return source.replace(from, to);
  });
}

const CASES: readonly {
  readonly rule: PagesCheckRule;
  readonly what: string;
  readonly files: () => ReturnType<typeof withFile>;
  readonly file: string;
  readonly field?: string;
}[] = [
  {
    rule: "parses",
    what: "a file with no h1",
    files: () =>
      withFile("pages/en/about.md", (s) => s.replace(/^h1: .*\n/mu, "")),
    file: "content/pages/en/about.md",
    field: "h1",
  },
  {
    rule: "seo-title",
    what: "a 61-character title",
    files: () =>
      withFile("pages/en/about.md", (s) =>
        s.replace(/^seoTitle: .*$/mu, `seoTitle: "${"x".repeat(61)}"`),
      ),
    file: "content/pages/en/about.md",
    field: "seoTitle",
  },
  {
    rule: "seo-description",
    what: "a 156-character description",
    files: () =>
      withFile("pages/en/about.md", (s) =>
        s.replace(
          /^seoDescription: .*$/mu,
          `seoDescription: "${"x".repeat(156)}"`,
        ),
      ),
    file: "content/pages/en/about.md",
    field: "seoDescription",
  },
  {
    rule: "reviewed-meta",
    what: "reviewed: true with no reviewedBy",
    files: () =>
      withFile("pages/en/about.md", (s) =>
        s.replace("reviewed: false", "reviewed: true"),
      ),
    file: "content/pages/en/about.md",
    field: "reviewedBy",
  },
  {
    rule: "source-human",
    what: "an en file with source: machine",
    files: () =>
      withFile("pages/en/about.md", (s) =>
        s.replace("source: human", "source: machine"),
      ),
    file: "content/pages/en/about.md",
    field: "source",
  },
  {
    rule: "faq-count",
    what: "a help page with nine questions",
    files: () =>
      withFile("pages/en/help.md", (s) => {
        const start = s.indexOf('  - q: "What if something goes wrong?"');
        const end = s.indexOf("links:");
        return s.slice(0, start) + s.slice(end);
      }),
    file: "content/pages/en/help.md",
    field: "faq",
  },
  {
    rule: "banned-words",
    what: "a banned word",
    files: () =>
      sectionBody(
        "pages/en/about.md",
        "We think both are the wrong way round.",
        "We think both are the wrong way round, and our partners agree.",
      ),
    file: "content/pages/en/about.md",
  },
  {
    rule: "relay-language",
    what: "a trust page that says 'until a florist accepts your order'",
    files: () =>
      sectionBody(
        "pages/en/guarantee.md",
        "until we start preparing your order",
        "until a florist accepts your order",
      ),
    file: "content/pages/en/guarantee.md",
  },
  {
    rule: "scale-claim",
    what: "a digit-bearing claim of scale",
    files: () =>
      sectionBody(
        "pages/en/about.md",
        "We are not taking orders yet.",
        "We work with 200+ florists.",
      ),
    file: "content/pages/en/about.md",
  },
  {
    rule: "price-literal",
    what: "a price literal",
    files: () =>
      sectionBody(
        "pages/en/about.md",
        "We are not taking orders yet.",
        "Bouquets start at €39.",
      ),
    file: "content/pages/en/about.md",
  },
  {
    rule: "trust-claims",
    what: "a trust page that says 'next-day delivery' without an honestyAllow entry",
    files: () =>
      sectionBody(
        "pages/en/about.md",
        "We are not taking orders yet.",
        "We offer next-day delivery.",
      ),
    file: "content/pages/en/about.md",
  },
  {
    rule: "honesty-allow-unused",
    what: "an honestyAllow entry that matches no sentence",
    files: () =>
      withFile("pages/en/about.md", (s) =>
        s.replace(
          "honestyAllow: []",
          'honestyAllow:\n  - sentence: "We deliver next day."\n    rule: "delivery timing"\n    reason: "a stale entry"',
        ),
      ),
    file: "content/pages/en/about.md",
    field: "honestyAllow.0",
  },
  {
    rule: "freshness-days",
    what: "a guarantee that promises a number of days",
    files: () =>
      sectionBody(
        "pages/en/guarantee.md",
        "so we do not promise a number of days.",
        "so they stay fresh for 7 days.",
      ),
    file: "content/pages/en/guarantee.md",
  },
];

describe("pages:check (T-05 / AC-5)", () => {
  it("is clean on the committed tree", () => {
    expect(checkInfoCorpus(FILES)).toEqual([]);
  });

  it("has a failing fixture for every rule", () => {
    expect(new Set(CASES.map((testCase) => testCase.rule))).toEqual(
      new Set(PAGES_CHECK_RULES),
    );
  });

  it.each(CASES)("fails $rule: $what", ({ rule, files, file, field }) => {
    const problems = checkInfoCorpus(files()).filter(
      (problem) => problem.rule === rule,
    );
    expect(problems.length, rule).toBeGreaterThan(0);
    expect(problems[0]?.file).toBe(file);
    if (field !== undefined)
      expect(problems.map((problem) => problem.field)).toContain(field);
  });

  it("a legal page that says 'our partner florist' fails the relay rule; claims are exempt there", () => {
    const legal = {
      path: "legal/en/cookies.md",
      source: `---
seoTitle: "Cookies"
seoDescription: "The cookies this website sets."
h1: "Cookies"
version: "0.1.0"
effectiveFrom: "2026-10-19"
inForce: true
lawyerReviewed: false
regime: eu
changeLog:
  - version: "0.1.0"
    date: "2026-10-19"
    summary: "First draft."
source: human
reviewed: false
updatedAt: "2026-10-19"
---
## Delivery

We deliver on the delivery date you choose. Our partner florist makes it.
`,
    };
    const rules = checkInfoCorpus([...FILES, legal]).map(
      (problem) => problem.rule,
    );
    expect(rules).toContain("relay-language");
    // "the delivery date you choose" is a contract's business: no claim rule reads a legal page.
    expect(rules).not.toContain("trust-claims");
  });

  it("an honestyAllow entry never silences a relay match (AC-30)", () => {
    const files = withFile("pages/en/about.md", (s) =>
      s
        .replace(
          "We are not taking orders yet.",
          "Our partner florist makes it.",
        )
        .replace(
          "honestyAllow: []",
          'honestyAllow:\n  - sentence: "Our partner florist makes it."\n    rule: "relay"\n    reason: "no"',
        ),
    );
    const rules = checkInfoCorpus(files).map((problem) => problem.rule);
    expect(rules).toContain("relay-language");
  });

  it("prints the §11 summary table, one row per file", () => {
    const table = summaryTable(FILES);
    expect(table).toContain(
      "| page | locale | reviewed | in force | lawyer reviewed |",
    );
    expect(table).toContain("| guarantee | en | false |  |  |");
    expect(table).toContain("| guarantee | en-gb | extends en | | |");
  });

  it("the CLI exits 0 on the tree", () => {
    const result = spawnSync(process.execPath, ["scripts/pages-check.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("all 13 rules clean");
  });
});
