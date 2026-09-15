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
  CORRIDOR_CHECK_RULES,
  type CorridorCheckRule,
  checkCorridorCorpus,
  corridorCheckExitCode,
  corridorSummary,
  corridorSummaryRows,
  formatCorridorProblems,
  readCorridorCheckCorpus,
  tokenDistinctness,
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

describe("the rules that need the whole corpus", () => {
  it("measures token distinctness as a multiset difference", () => {
    expect(tokenDistinctness("one two three", "one two three")).toBe(0);
    expect(tokenDistinctness("one two three", "four five six")).toBe(1);
    expect(tokenDistinctness("one two three four", "one two")).toBeCloseTo(
      0.5,
      5,
    );
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
    // Nothing is reviewed yet: the founder's skim and the native reviewers of plan/13 B12 are
    // what turn `reviewed` true, and indexability depends on it (spec 007 §6).
    expect(en?.reviewed).toBe(0);
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
