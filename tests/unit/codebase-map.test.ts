/**
 * AC-33 / T-34 (TASK-086): the codebase map is generated, current and complete.
 *
 * The map is the first file an agent reads, so a stale one is worse than none: it would send the
 * reader to a module that moved. Two failure paths are proven here rather than assumed — a
 * committed file that no longer matches the tree, and a source file with no doc comment (which
 * renders as `TODO purpose`) — both against a throwaway repository built in a temp directory, so
 * the assertions do not depend on the real tree staying broken.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkMap,
  collect,
  concisePurpose,
  HAND_MAINTAINED_HEADING,
  MAP_PATH,
  MISSING_PURPOSE,
  PURPOSE_LIMIT,
  purposeOf,
  renderMap,
  specCell,
  specOf,
  TESTS_LISTED,
  testCell,
  truncate,
} from "../../scripts/codebase-map.ts";

const repoRoot = resolve(__dirname, "../..");
const committed = readFileSync(join(repoRoot, MAP_PATH), "utf8");

/** A minimal repository: one module barrel, one script, one map. */
function fixtureRepo(barrel: string): string {
  const root = mkdtempSync(join(tmpdir(), "fo-map-"));
  mkdirSync(join(root, "src/modules/demo"), { recursive: true });
  mkdirSync(join(root, "src/config"), { recursive: true });
  mkdirSync(join(root, "src/app"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "tests/unit"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "src/modules/demo/index.ts"), barrel, "utf8");
  writeFileSync(
    join(root, "scripts/demo.ts"),
    "/** Does the demo thing (spec 001). */\nexport {};\n",
    "utf8",
  );
  writeFileSync(
    join(root, "tests/unit/demo.test.ts"),
    'import { x } from "../../src/modules/demo/index.ts";\nexport { x };\n',
    "utf8",
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { "demo:run": "node scripts/demo.ts" } }),
    "utf8",
  );
  writeFileSync(
    join(root, MAP_PATH),
    `${HAND_MAINTAINED_HEADING}\n\n| Question | Where |\n|---|---|\n| Demo | \`src/modules/demo/\` |\n`,
    "utf8",
  );
  // The first write seeds the hand-maintained tail; generate once so the file is current.
  writeFileSync(
    join(root, MAP_PATH),
    renderMap(collect(root), readFileSync(join(root, MAP_PATH), "utf8")),
    "utf8",
  );
  return root;
}

/**
 * The hard cap on the map, in bytes. Spec 001 §14 A21 (founder, "map 20"): 20 × 1024. It is a guard
 * against an unbounded map, not a budget the growth must fit under; the ≤ 12 KB *target* (A16) and
 * TASK-095's compression stand, and compression may lower this again.
 */
const MAP_HARD_CAP_BYTES = 20 * 1024;

/** The predicate the committed-map assertion and the boundary fixtures share. */
const withinHardCap = (text: string): boolean =>
  Buffer.byteLength(text, "utf8") <= MAP_HARD_CAP_BYTES;

describe("the committed docs/codebase-map.md (AC-33)", () => {
  it("is current — `pnpm codebase:map --check` finds nothing", () => {
    expect(checkMap(repoRoot).join("\n")).toBe("");
  });

  /**
   * Spec 001 AC-33 words this as a **target** ("Target size ≤ 12 KB"), and the map grows with the
   * codebase: TASK-087's four rows (the `geo` barrel's tests, `src/config/voice.ts` and the two
   * corridor-gate scripts) put the generated file at ~12.7 KB with every purpose line already
   * shortened to the generator's truncation width. Raising the hard assertion to 16 KB keeps the
   * gate meaningful — a runaway map still fails — while leaving the 12 KB *target* in spec 001
   * where it belongs. Recorded as **spec 001 §14 A16** (`/review 63`); compressing the
   * generator's tests column, which could lower this again, is TASK-095's docs close.
   *
   * TASK-200 raised the cap from 16 KB to 17 KB: main stood at 16 239 B, 145 B under the cap, and
   * spec 010's new `checkout` module plus its two config files need ~320 B even with the shortest
   * purpose lines. Flagged in PR 201 for the reviewer; TASK-095's compression is still the remedy.
   *
   * Spec 001 §14 A21 raised it to 20 KB: PRs 180, 224 and 225 each need 50 to 300 bytes the 17 KB
   * cap no longer had.
   */
  it("stays inside the size budget the spec sets", () => {
    expect(withinHardCap(committed)).toBe(true);
  });

  it("holds the hard cap at exactly 20 480 bytes", () => {
    expect(MAP_HARD_CAP_BYTES).toBe(20480);
  });

  it("passes a 20 480-byte map and fails a 20 481-byte one (boundary fixtures)", () => {
    expect(withinHardCap("a".repeat(20480))).toBe(true);
    expect(withinHardCap("a".repeat(20481))).toBe(false);
  });

  it("counts bytes, not characters: 20 480 characters of 2 bytes each is over the cap", () => {
    // 20 479 ASCII characters plus one “é” (2 bytes) is 20 480 characters but 20 481 bytes.
    const fixture = `${"a".repeat(20479)}é`;
    expect(fixture.length).toBe(20480);
    expect(withinHardCap(fixture)).toBe(false);
  });

  it("keeps the hand-maintained “Where does X live?” table with every named row", () => {
    const tail = committed.slice(committed.indexOf(HAND_MAINTAINED_HEADING));
    for (const anchor of [
      "src/modules/catalog/pricing/",
      "tests/unit/home-honesty.test.ts",
      "tests/e2e/honesty.spec.ts",
      "scripts/client-js-budget.ts",
      "src/modules/ui/consent/",
      "src/modules/i18n/format.ts",
      "src/modules/ui/media/",
      "scripts/tasks-open-decisions.ts",
      "docs/design/",
      "docs/tasks/",
    ]) {
      expect(tail, anchor).toContain(anchor);
    }
  });

  it("lists every module barrel, config module, route file and script", () => {
    const map = collect(repoRoot);
    expect(map.modules.length).toBeGreaterThanOrEqual(12);
    for (const entry of [
      ...map.modules,
      ...map.config,
      ...map.routes,
      ...map.scripts,
    ]) {
      expect(committed, entry.path).toContain(`\`${entry.label}\``);
      expect(entry.purpose, entry.path).not.toBe(MISSING_PURPOSE);
    }
  });

  it("names the test files that import a module", () => {
    const catalog = collect(repoRoot).modules.find(
      (entry) => entry.label === "catalog",
    );
    expect(catalog?.tests.length ?? 0).toBeGreaterThan(0);
    expect(catalog?.tests).toContain("tests/unit/catalog-barrel.test.ts");
  });

  it("names the `pnpm` script that runs each script file", () => {
    const layout = collect(repoRoot).scripts.find(
      (entry) => entry.label === "check-layout.ts",
    );
    expect(layout?.script).toBe("check-layout");
  });
});

describe("purpose and spec extraction", () => {
  it("takes the first content line of the first doc comment", () => {
    expect(purposeOf('"use client";\n\n/**\n * Does a thing.\n */\n')).toBe(
      "Does a thing",
    );
  });

  it("prefers an explicit @purpose tag", () => {
    expect(
      purposeOf("/**\n * Something.\n * @purpose The real one.\n */"),
    ).toBe("The real one");
  });

  it("returns nothing for a file with no doc comment", () => {
    expect(purposeOf("export const x = 1;\n")).toBe("");
  });

  it("reads the owning spec from a tag, an `Owned by:` sentence or a mention", () => {
    expect(specOf("/** x. @spec 007 */")).toBe("spec 007");
    expect(specOf("/** x. Owned by: spec 015 (+ spec 016 routing). */")).toBe(
      "spec 015, 016",
    );
    expect(specOf("/** Built for spec 003 §5. */")).toBe("spec 003");
    expect(specOf("/** nothing here */")).toBe("—");
  });
});

describe("the compact index the generator writes (TASK-275)", () => {
  it("cuts purposes at 56 characters and names two test files per entry", () => {
    expect(PURPOSE_LIMIT).toBe(56);
    expect(TESTS_LISTED).toBe(2);
  });

  it("cuts a long purpose at a word inside the limit and marks the cut", () => {
    const long = `${"word ".repeat(20)}end`;
    const cut = truncate(long);
    expect(cut).toBe(`${"word ".repeat(11).trimEnd()}…`);
    expect(cut.length).toBeLessThanOrEqual(PURPOSE_LIMIT + 1);
    expect(truncate("short enough")).toBe("short enough");
  });

  it("names two test files without the `tests/` prefix, then counts the rest", () => {
    expect(
      testCell([
        "tests/unit/a.test.ts",
        "tests/unit/b.test.ts",
        "tests/unit/c.test.ts",
        "tests/e2e/d.spec.ts",
      ]),
    ).toBe("`unit/a.test.ts`, `unit/b.test.ts` +2");
    expect(testCell(["tests/unit/a.test.ts", "tests/unit/b.test.ts"])).toBe(
      "`unit/a.test.ts`, `unit/b.test.ts`",
    );
    expect(testCell([])).toBe("—");
  });

  it("prints the spec column as the number alone", () => {
    expect(specCell("spec 005")).toBe("005");
    expect(specCell("spec 015, 016")).toBe("015, 016");
    expect(specCell("—")).toBe("—");
  });

  it("drops a parenthetical that cites a spec or a task, and bold markup", () => {
    expect(
      concisePurpose(
        "The only import path into the geo module (spec 007 §5.2; TASK-087)",
      ),
    ).toBe("The only import path into the geo module");
    expect(
      concisePurpose(
        "The gallery's live error state (TASK-201; spec 010 AC-14, T-14 component half)",
      ),
    ).toBe("The gallery's live error state");
    expect(
      concisePurpose(
        "`/{locale}/{segment}` — **one route file for one URL depth** (spec 008 §14)",
      ),
    ).toBe("`/{locale}/{segment}` — one route file for one URL depth");
    expect(
      concisePurpose(
        "The gallery (spec 004), its fixtures (TASK-045), and more",
      ),
    ).toBe("The gallery, its fixtures, and more");
  });

  it("keeps a parenthetical that says what the file is for", () => {
    expect(
      concisePurpose("Public barrel for `admin` (admin queries and actions)"),
    ).toBe("Public barrel for `admin` (admin queries and actions)");
    expect(concisePurpose("Formats (see spec)")).toBe("Formats (see spec)");
  });

  it("keeps a purpose that is nothing but a citation, so it never renders as TODO", () => {
    expect(concisePurpose("(spec 001; TASK-001)")).toBe("(spec 001; TASK-001)");
  });

  it("still strips the barrel's `Owned by:` sentence", () => {
    expect(concisePurpose("Public barrel for `demo`. Owned by: spec 001")).toBe(
      "Public barrel for `demo`",
    );
  });
});

describe("`--check` bites (T-34)", () => {
  it("reports a stale committed file", () => {
    const root = fixtureRepo(
      "/** Public barrel for `demo`. Owned by: spec 001. */\n",
    );
    expect(checkMap(root)).toEqual([]);
    writeFileSync(
      join(root, "src/config/thing.ts"),
      "/** A new config module (spec 002). */\nexport {};\n",
      "utf8",
    );
    expect(checkMap(root).join("\n")).toContain("is stale");
  });

  it("reports a file with no purpose and refuses to call the map healthy", () => {
    const root = fixtureRepo("export {};\n");
    const problems = checkMap(root);
    expect(problems.join("\n")).toContain("src/modules/demo/index.ts");
    expect(problems.join("\n")).toContain("no doc comment");
  });

  it("reports a map whose hand-maintained section was deleted", () => {
    const root = fixtureRepo(
      "/** Public barrel for `demo`. Owned by: spec 001. */\n",
    );
    const generated = readFileSync(join(root, MAP_PATH), "utf8");
    writeFileSync(
      join(root, MAP_PATH),
      generated.slice(0, generated.indexOf(HAND_MAINTAINED_HEADING)),
      "utf8",
    );
    expect(checkMap(root).join("\n")).toContain(HAND_MAINTAINED_HEADING);
  });

  it("copies the hand-maintained tail through verbatim", () => {
    const root = fixtureRepo(
      "/** Public barrel for `demo`. Owned by: spec 001. */\n",
    );
    const tail = `${HAND_MAINTAINED_HEADING}\n\n| Question | Where |\n|---|---|\n| Anything | somewhere hand-written |\n`;
    writeFileSync(
      join(root, MAP_PATH),
      `${readFileSync(join(root, MAP_PATH), "utf8").split(HAND_MAINTAINED_HEADING)[0] ?? ""}${tail}`,
      "utf8",
    );
    const regenerated = renderMap(
      collect(root),
      readFileSync(join(root, MAP_PATH), "utf8"),
    );
    expect(regenerated).toContain("somewhere hand-written");
    expect(checkMap(root)).toEqual([]);
  });
});
