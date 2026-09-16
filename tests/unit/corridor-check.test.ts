/**
 * T-03 / AC-2 (spec 007 §9, §10; TASK-087): `pnpm corridor:check`.
 *
 * The order is the acceptance criterion's: the committed corpus passes, then **one deliberately
 * failing fixture per rule** (eighteen) fails with the file, the field and the rule named, then
 * the published-set summary, then the wiring (`package.json`, CI, `check:no-db`).
 *
 * Three assertions here are the ones worth defending in review:
 *
 *  - **every case's rule set is asserted exactly**, not "contains". A fixture that quietly trips a
 *    second rule is a fixture that could pass for the wrong reason, so a case declares `alsoRules`
 *    with a written reason and this suite holds it to that list.
 *  - **every rule has a case, and every case names a rule that exists.** A nineteenth rule added
 *    without a fixture fails here, which is what keeps AC-2's list and the implementation in step.
 *  - **the committed corpus is checked as committed** — no fixture corpus, no temp directory. The
 *    guide that ships is the guide the gate runs on, and every fixture is a one-field overlay on
 *    it, so a reworded Poland guide cannot leave a stale fixture passing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  parseCorridorContent,
  splitCorridorFile,
} from "../../src/modules/geo/content/parse.ts";
import { RELATED_MAX } from "../../src/modules/geo/content/schemas.ts";
import {
  CORRIDOR_CHECK_RULES,
  type CorridorCheckRule,
  SHINGLE_DISTINCTNESS_MIN,
  SHINGLE_SIZE,
  checkCorridorCorpus,
  corridorCheckExitCode,
  corridorSummary,
  corridorSummaryRows,
  formatCorridorProblems,
  readCorridorCheckCorpus,
  shingleDistinctness,
  shinglesOf,
} from "../../scripts/corridor-check.ts";
import {
  CORRIDOR_CHECK_CASES,
  applyCorridorCheckCase,
} from "../../scripts/corridor-check-cases.ts";
import { SCANNED_PATHS } from "../../scripts/check-no-db-imports.ts";

const repoRoot = resolve(__dirname, "../..");
const corpus = readCorridorCheckCorpus(repoRoot);

/** The rules a case's problem list actually trips, de-duplicated, in rule order. */
function rulesOf(
  problems: readonly { rule: CorridorCheckRule }[],
): CorridorCheckRule[] {
  return CORRIDOR_CHECK_RULES.filter((rule) =>
    problems.some((problem) => problem.rule === rule),
  );
}

describe("the committed corpus passes (AC-2)", () => {
  it("has no problem in any of the eighteen rules", () => {
    const problems = checkCorridorCorpus(corpus);
    expect(formatCorridorProblems(problems)).toBe("");
    expect(corridorCheckExitCode(problems)).toBe(0);
  });

  it("is not empty — a clean run over nothing would prove nothing", () => {
    expect(corpus.files.length).toBeGreaterThan(0);
  });

  it("reports one line per problem, naming file, rule and field", () => {
    const machineDrafted = CORRIDOR_CHECK_CASES.find(
      (testCase) => testCase.rule === "source-human",
    );
    if (machineDrafted === undefined) throw new Error("missing case");
    const problems = checkCorridorCorpus({
      files: applyCorridorCheckCase(corpus.files, machineDrafted),
      names: corpus.names,
    });
    const line = formatCorridorProblems(problems).split("\n")[0] ?? "";
    expect(line).toMatch(
      /^content\/corridors\/en\/pl-guide\.md: \[source-human\] `source`/u,
    );
  });
});

describe("one deliberately failing fixture per rule (T-03)", () => {
  it("covers all eighteen rules, once each", () => {
    expect(CORRIDOR_CHECK_CASES.map((testCase) => testCase.rule)).toStrictEqual(
      [...CORRIDOR_CHECK_RULES],
    );
  });

  it.each(
    CORRIDOR_CHECK_CASES.map((testCase) => [testCase.rule, testCase] as const),
  )("%s fails with its rule named", (rule, testCase) => {
    const problems = checkCorridorCorpus({
      files: applyCorridorCheckCase(corpus.files, testCase),
      names: corpus.names,
    });
    const named = problems.filter((problem) => problem.rule === rule);
    expect(
      named.length,
      `${rule} tripped nothing; the gate said: ${formatCorridorProblems(problems)}`,
    ).toBeGreaterThan(0);
    expect(named.map((problem) => problem.message).join("\n")).toContain(
      testCase.expect,
    );
    for (const problem of named) {
      expect(problem.file).toMatch(/^content\/corridors\//u);
      expect(problem.field.length).toBeGreaterThan(0);
    }
    expect(rulesOf(problems)).toStrictEqual(
      CORRIDOR_CHECK_RULES.filter(
        (candidate) =>
          candidate === rule || (testCase.alsoRules ?? []).includes(candidate),
      ),
    );
    expect(corridorCheckExitCode(problems)).toBe(1);
  });

  it("explains every second rule it trips", () => {
    for (const testCase of CORRIDOR_CHECK_CASES) {
      if ((testCase.alsoRules ?? []).length > 0) {
        expect(testCase.why.length, testCase.rule).toBeGreaterThan(40);
      }
    }
  });
});

/**
 * Rule 5 after spec 007 §14 A4, which replaced the token-multiset overlap with 5-gram shingle
 * distinctness. The metric is asserted three ways: on its arithmetic, on two real guides (which
 * must clear the floor), and on a templated page (which must not).
 */
describe("token-distinctness is 5-gram shingle distinctness (rule 5, §14 A4)", () => {
  it("is the Jaccard distance between the two 5-gram shingle sets", () => {
    expect(SHINGLE_SIZE).toBe(5);
    expect(SHINGLE_DISTINCTNESS_MIN).toBe(0.8);
    // Identical text: every shingle shared, so nothing is distinct.
    expect(shingleDistinctness("a b c d e f", "a b c d e f")).toBe(0);
    // No five-word run in common.
    expect(shingleDistinctness("a b c d e", "f g h i j")).toBe(1);
    // Under five tokens there is no shingle to share, so the union is empty.
    expect(shingleDistinctness("a b c", "a b c")).toBe(1);
    // `a b c d e f` has shingles {a b c d e, b c d e f}; `a b c d e x` has {a b c d e, b c d e x}.
    // One of three union members is shared → 1 − 1/3.
    expect(shingleDistinctness("a b c d e f", "a b c d e x")).toBeCloseTo(
      2 / 3,
      10,
    );
  });

  it("builds contiguous shingles as a set, so a repeated phrase counts once", () => {
    expect([...shinglesOf("a b c d e a b c d e")]).toStrictEqual([
      "a b c d e",
      "b c d e a",
      "c d e a b",
      "d e a b c",
      "e a b c d",
    ]);
  });

  it("scores two genuine guides above the floor and a templated page below it", () => {
    const bodyOf = (path: string): string => {
      const file = corpus.files.find((candidate) => candidate.path === path);
      if (file === undefined) throw new Error(`missing corpus file: ${path}`);
      const split = splitCorridorFile(file.path, file.source);
      if (!split.ok) throw new Error(`does not split: ${path}`);
      return split.body;
    };

    const poland = bodyOf("en/pl-guide.md");
    const germany = bodyOf("en/de-guide.md");
    expect(shingleDistinctness(poland, germany)).toBeGreaterThanOrEqual(
      SHINGLE_DISTINCTNESS_MIN,
    );

    // The templated page: the same guide with the place names swapped, which is the failure
    // plan/02 §1 catalogues. It keeps every sentence, so it shares nearly every shingle.
    const templated = poland
      .replaceAll("Poland", "the Netherlands")
      .replaceAll("Polish", "Dutch");
    expect(shingleDistinctness(poland, templated)).toBeLessThan(
      SHINGLE_DISTINCTNESS_MIN,
    );
  });

  it("measures every committed body against every sibling in its locale", () => {
    for (const locale of ["en", "en-gb"]) {
      const bodies = corpus.files
        .filter((file) => file.path.startsWith(`${locale}/`))
        .map((file) => {
          const split = splitCorridorFile(file.path, file.source);
          if (!split.ok) throw new Error(`does not split: ${file.path}`);
          return split.body;
        });
      expect(bodies).toHaveLength(7);
      for (const own of bodies) {
        for (const other of bodies) {
          if (own === other) continue;
          expect(shingleDistinctness(own, other)).toBeGreaterThanOrEqual(
            SHINGLE_DISTINCTNESS_MIN,
          );
        }
      }
    }
  });

  it("has no trace of the multiset metric it replaced — a dead metric is a second answer", () => {
    const source = readFileSync(
      resolve(repoRoot, "scripts/corridor-check.ts"),
      "utf8",
    );
    expect(source).not.toContain("tokenDistinctness");
    expect(source).not.toContain("TOKEN_DISTINCTNESS_MIN");
  });
});

describe("the rules that need the whole corpus", () => {
  /**
   * Rule 18 after spec 007 §14 A3. The failing fixture above is the free-slot half; this is the
   * other half, and it has to be asserted here because the committed corpus depends on it: `NL`
   * names `FR`, `FR` names `DE`, `ES` and `IT`, and that edge is one-way by parity, not by
   * omission. A gate that failed it would have no clean corpus to accept.
   */
  it("passes a one-way edge whose target is already full (§14 A3)", () => {
    const parsed = corpus.files.flatMap((file) => {
      const result = parseCorridorContent(file.path, file.source);
      return result.ok ? [result.content] : [];
    });
    const netherlands = parsed.find(
      (content) => content.locale === "en" && content.iso2 === "NL",
    );
    const france = parsed.find(
      (content) => content.locale === "en" && content.iso2 === "FR",
    );

    // Non-vacuous: the edge really is one-way, and the target really is full.
    expect(netherlands?.relatedIso2).toContain("FR");
    expect(france?.relatedIso2).not.toContain("NL");
    expect(france?.relatedIso2).toHaveLength(RELATED_MAX);

    expect(
      checkCorridorCorpus(corpus).filter(
        (problem) => problem.rule === "related-targets",
      ),
    ).toStrictEqual([]);
  });

  it("lets the same body under two locales through — those are alternates, not duplicates", () => {
    const problems = checkCorridorCorpus({
      files: applyCorridorCheckCase(corpus.files, {
        rule: "token-distinctness",
        expect: "-",
        why: "an en-gb file inheriting the en body is the hreflang pair of plan/02 §4.2, not a duplicate.",
        file: "en/pl-guide.md",
        as: "en-gb/pl-guide.md",
        ops: [
          {
            op: "setField",
            field: "seoTitle",
            value: "Sending flowers to Poland",
          },
          {
            op: "setField",
            field: "seoDescription",
            value:
              "What flowers mean in Poland and what we can honestly do there today.",
          },
        ],
      }),
      names: corpus.names,
    });
    expect(rulesOf(problems)).toStrictEqual([]);
  });
});

/**
 * Rule 15 in detail, because `/review 63` found it blind to the one destination that has a corpus
 * file. JS `\b` is ASCII-only, so a currency branch ending in `ł` had no trailing boundary and
 * every `129 zł` form walked through the gate; the rule now closes on `(?![\p{L}\p{N}])`. These
 * run through the gate, not against the pattern, so the assertion is the behaviour, not the source.
 */
describe("price-literal is Unicode-aware (rule 15)", () => {
  /** The `price-literal` problems the corpus raises once `sentence` is appended to the guide. */
  function priceProblemsFor(sentence: string): readonly { message: string }[] {
    return checkCorridorCorpus({
      files: applyCorridorCheckCase(corpus.files, {
        rule: "price-literal",
        expect: "price literal",
        why: "a single appended sentence, so the only thing under test is the currency pattern.",
        file: "en/pl-guide.md",
        ops: [{ op: "appendBody", text: sentence }],
      }),
      names: corpus.names,
    }).filter((problem) => problem.rule === "price-literal");
  }

  it.each([
    "Bouquets start at 129 zł.",
    "Bukiety od 129 zł",
    "od 129zł",
    "129 złotych",
    "129 PLN",
    "€29",
    "35 EUR",
    "99 lei",
  ])("catches %j", (sentence) => {
    expect(priceProblemsFor(sentence).length).toBeGreaterThan(0);
  });

  it.each(["8 March", "1 November", "2027", "We wrote this in 2027."])(
    "leaves %j alone — a date is not a price",
    (sentence) => {
      expect(priceProblemsFor(sentence)).toStrictEqual([]);
    },
  );

  it("names the literal it found, so the failure is actionable", () => {
    expect(priceProblemsFor("Bouquets start at 129 zł.")[0]?.message).toContain(
      "`129 zł`",
    );
  });
});

describe("the published-set summary (spec 007 §11)", () => {
  it("counts files, reviewed files and countries per launch locale", () => {
    const rows = corridorSummaryRows(corpus);
    const en = rows.find((row) => row.locale === "en");
    expect(en?.files).toBeGreaterThan(0);
    expect(en?.countries).toContain("PL");
    // The founder marked every `en` and `en-gb` guide reviewed on 2026-09-16 (decisions log);
    // `reviewed` therefore equals `files` in both locales. Indexability still depends on the
    // environment gate (spec 007 §6, TASK-096), not on this count alone.
    expect(en?.reviewed).toBe(en?.files);
    const enGb = rows.find((row) => row.locale === "en-gb");
    expect(enGb?.reviewed).toBe(enGb?.files);
    // `de` and `pl` have no corridor page until a human writes one (plan/02 §12, §13 Q1).
    expect(rows.find((row) => row.locale === "de")?.files).toBe(0);
    expect(rows.find((row) => row.locale === "pl")?.files).toBe(0);
  });

  it("renders a markdown table", () => {
    expect(corridorSummary(corpus)).toContain(
      "| locale | files | reviewed | countries |",
    );
  });
});

describe("the gate is wired in (AC-2, AC-28)", () => {
  it("is a `pnpm` script", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts["corridor:check"]).toBe(
      "node scripts/corridor-check.ts",
    );
  });

  it("is a CI job on `needs: typecheck`, beside the other content gates", () => {
    const workflow = parse(
      readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
    ) as {
      jobs: Record<string, { needs?: string | string[]; steps: unknown[] }>;
    };
    const job = workflow.jobs["corridor-check"];
    expect(job).toBeDefined();
    expect(job?.needs).toBe("typecheck");
    expect(JSON.stringify(job?.steps)).toContain("corridor:check");
  });

  it("is covered by `pnpm check:no-db` (AC-1, T-02)", () => {
    expect([...SCANNED_PATHS]).toContain("src/modules/geo");
    expect([...SCANNED_PATHS]).toContain("scripts/corridor-check.ts");
  });

  it("is documented in the README", () => {
    expect(readFileSync(resolve(repoRoot, "README.md"), "utf8")).toContain(
      "corridor:check",
    );
  });
});
