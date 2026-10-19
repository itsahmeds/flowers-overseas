/**
 * T-05 / AC-5 (spec 041; TASK-182): `pnpm pages:check` exits 0 on the committed tree and fails
 * one fixture per rule, naming the file, the field and the rule. Each fixture is a small overlay
 * on the committed files, so a case breaks exactly one thing. `corridor:check`'s own cases are
 * unchanged after the patterns moved to `src/config/honesty.ts` (`tests/unit/corridor-check.test.ts`).
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CLAIM_PATTERNS } from "../../src/config/honesty.ts";
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

  /**
   * `/break 270` hole 3: the gate reads every prose field, not only a section body. One overlay per
   * field puts the same scale claim there; dropping that field from `proseOf` turns its case red.
   */
  it.each([
    {
      field: "intro",
      path: "pages/en/about.md",
      edit: (s: string) =>
        s.replace(/^intro: "/mu, 'intro: "We work with 200+ florists. '),
    },
    {
      field: "sections.0.items.0",
      path: "pages/en/how-it-works.md",
      edit: (s: string) =>
        s.replace(
          'text: "Choose the country,',
          'text: "We work with 200+ florists. Choose the country,',
        ),
    },
    {
      field: "seoTitle",
      path: "pages/en/about.md",
      edit: (s: string) =>
        s.replace(/^seoTitle: .*$/mu, 'seoTitle: "About us: 200+ florists"'),
    },
    {
      field: "seoDescription",
      path: "pages/en/about.md",
      edit: (s: string) =>
        s.replace(
          /^seoDescription: .*$/mu,
          'seoDescription: "We work with 200+ florists across Europe."',
        ),
    },
    {
      field: "h1",
      path: "pages/en/about.md",
      edit: (s: string) =>
        s.replace(/^h1: .*$/mu, 'h1: "About our 200+ florists"'),
    },
    {
      field: "sections.0.heading",
      path: "pages/en/about.md",
      edit: (s: string) =>
        s.replace(
          'heading: "Who runs it"',
          'heading: "Who runs 200+ florists"',
        ),
    },
    {
      field: "links.0.label",
      path: "pages/en/about.md",
      edit: (s: string) =>
        s.replace(
          'label: "How it works"',
          'label: "How our 200+ florists work"',
        ),
    },
  ])(
    "reads $field: a scale claim there fails scale-claim",
    ({ field, path, edit }) => {
      const problems = checkInfoCorpus(withFile(path, edit)).filter(
        (problem) => problem.rule === "scale-claim",
      );
      expect(problems.map((problem) => problem.field)).toEqual([field]);
    },
  );

  it("fails faq-count on a help page with fifteen questions (the upper bound)", () => {
    const files = withFile("pages/en/help.md", (s) => {
      const at = s.indexOf("links:");
      const extra = [1, 2, 3]
        .map(
          (n) =>
            `  - q: "Extra question ${String(n)}?"\n    a: "An extra answer."\n`,
        )
        .join("");
      return s.slice(0, at) + extra + s.slice(at);
    });
    const counts = files
      .filter((file) => file.path === "pages/en/help.md")
      .map((file) => (file.source.match(/^ {2}- q: /gmu) ?? []).length);
    expect(counts).toEqual([15]);
    expect(
      checkInfoCorpus(files).filter((problem) => problem.rule === "faq-count"),
    ).toHaveLength(1);
  });

  it("fails source-human on an en-gb file with source: machine", () => {
    const en = FILES.find((file) => file.path === "pages/en/about.md");
    const files = FILES.map((file) =>
      file.path === "pages/en-gb/about.md"
        ? {
            path: file.path,
            source: (en?.source ?? "").replace(
              "source: human",
              "source: machine",
            ),
          }
        : file,
    );
    const problems = checkInfoCorpus(files).filter(
      (problem) => problem.rule === "source-human",
    );
    expect(problems.map((problem) => problem.file)).toEqual([
      "content/pages/en-gb/about.md",
    ]);
  });

  it("fails honesty-allow-unused on an entry whose sentence is there but trips no claim", () => {
    const files = withFile("pages/en/about.md", (s) =>
      s.replace(
        "honestyAllow: []",
        'honestyAllow:\n  - sentence: "We are not taking orders yet."\n    rule: "delivery timing"\n    reason: "it trips nothing"',
      ),
    );
    expect(
      checkInfoCorpus(files)
        .filter((problem) => problem.rule === "honesty-allow-unused")
        .map((problem) => problem.field),
    ).toEqual(["honestyAllow.0"]);
  });

  /**
   * `/break 270` hole 4: the gate reads `src/config/freshness-claim.ts`, the one matcher spec 009
   * §14 A11 built, so every form it catches fails `pages:check` on any trust page, not only on the
   * guarantee. Each line is put in help.md's first answer.
   */
  it.each([
    "They stay fresh for 7 full days.",
    "They stay fresh for 5 or more days.",
    "Fresh days: 5.",
    "They stay fresh for 7&nbsp;days.",
    "Siedmiodniowa świeżość.",
    "Our seven\u2011day guarantee covers it.",
    "Ask about our 7-day guarantee.",
  ])("fails freshness-days on help.md: %s", (line) => {
    const files = withFile("pages/en/help.md", (s) =>
      s.replace(/(\n {2}- q: "[^"]*"\n {4}a: ")/u, `$1${line} `),
    );
    expect(
      checkInfoCorpus(files)
        .filter((problem) => problem.rule === "freshness-days")
        .map((problem) => problem.field),
    ).toContain("faq.0.a");
  });
});

/**
 * `/break 270` hole 2: one must-match and one must-not-match sentence per shared claim pattern,
 * label by label, and the gate's own `trust-claims` failure for each. Deleting any entry of
 * `CLAIM_PATTERNS` turns its row red (`corridor:check` reads the same list).
 */
const CLAIM_CASES = [
  {
    label: "delivery timing",
    hit: "We offer next-day delivery.",
    miss: "We deliver flowers.",
  },
  {
    label: "cutoff",
    hit: "Order before the cut-off.",
    miss: "We cut the stems.",
  },
  {
    label: "delivery date",
    hit: "It comes on the day you chose.",
    miss: "It comes on a weekday.",
  },
  {
    label: "florist count",
    hit: "We work with hundreds of florists.",
    miss: "We work with a florist.",
  },
  {
    label: "rating",
    hit: "Our shop is star-rated.",
    miss: "Our shop is small.",
  },
  {
    label: "review",
    hit: "Read our testimonials.",
    miss: "Read our guarantee.",
  },
  {
    label: "delivery photo",
    hit: "Our florist photographs them at the door.",
    miss: "Our florist photographs the bouquet for the website.",
  },
] as const;

describe("the shared claim patterns, one case per label (AC-5, AC-8)", () => {
  it("covers every pattern in CLAIM_PATTERNS", () => {
    expect(CLAIM_CASES.map((c) => c.label)).toEqual(
      CLAIM_PATTERNS.map((c) => c.label),
    );
  });

  it.each(CLAIM_CASES)(
    '$label matches "$hit" alone and not "$miss"',
    ({ label, hit, miss }) => {
      expect(
        CLAIM_PATTERNS.filter((c) => c.pattern.test(hit)).map((c) => c.label),
      ).toEqual([label]);
      expect(
        CLAIM_PATTERNS.filter((c) => c.pattern.test(miss)).map((c) => c.label),
      ).toEqual([]);
    },
  );

  it.each(CLAIM_CASES)(
    "pages:check fails trust-claims for a $label claim",
    ({ label, hit }) => {
      const files = sectionBody(
        "pages/en/about.md",
        "We are not taking orders yet.",
        hit,
      );
      expect(
        checkInfoCorpus(files)
          .filter((problem) => problem.rule === "trust-claims")
          .map((problem) => problem.message.split(" claim ")[0]),
      ).toEqual([`makes a ${label}`]);
    },
  );

  it("the guarantee's committed photo and missed-day sentences trip their patterns and are allowed", () => {
    const guarantee = FILES.find(
      (file) => file.path === "pages/en/guarantee.md",
    );
    for (const [label, sentence] of [
      [
        "delivery photo",
        "When the flowers are handed over, our florist photographs them at the door and we email you the picture.",
      ],
      [
        "delivery date",
        "If our florist cannot deliver on the day you chose, for a reason that is ours and not the recipient's, we refund you in full.",
      ],
    ] as const) {
      expect(guarantee?.source, sentence).toContain(sentence);
      expect(
        CLAIM_PATTERNS.filter((c) => c.pattern.test(sentence)).map(
          (c) => c.label,
        ),
        sentence,
      ).toEqual([label]);
    }
    const stripped = withFile("pages/en/guarantee.md", (s) =>
      s.replace(
        / {2}- sentence: "When the flowers[\s\S]*?\(spec 041 §13 Q4, Appendix A\.3\)\.['"]\n/u,
        "",
      ),
    );
    expect(
      checkInfoCorpus(stripped)
        .filter((problem) => problem.rule === "trust-claims")
        .map((problem) => problem.field),
    ).toEqual(["sections.4.body"]);
  });
});

describe("pages:check, continued", () => {
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
