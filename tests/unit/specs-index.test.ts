/**
 * AC-35 / T-36 (TASK-086): every spec carries a current `## 0. Index`.
 *
 * The index is what makes "read only the sections the ACs name" possible: without it an agent
 * loads 99 KB of spec to find AC-18. A stale index is a wrong line number, which is worse than a
 * missing one, so `pnpm specs:index --check` is asserted to bite on a moved line, on a renumbered
 * criterion and on a spec with no block at all.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  anchorsIn,
  checkSpecIndexes,
  INDEX_END,
  INDEX_HEADING,
  sectionLabel,
  specFiles,
  withIndex,
  withoutIndex,
} from "../../scripts/specs-index.ts";

const repoRoot = resolve(__dirname, "../..");

const FIXTURE = [
  "# SPEC-099 — fixture",
  "",
  "| Field | Value |",
  "|---|---|",
  "| Status | approved |",
  "",
  "## 1. Problem",
  "",
  "AC-2 is mentioned here before it is defined.",
  "",
  "## 9. Acceptance criteria",
  "",
  "- **AC-1** the first thing.",
  "- **AC-2** the second thing.",
  "",
  "## 10. Test cases",
  "",
  "| ID | Layer | Given / When / Then | Covers AC |",
  "|---|---|---|---|",
  "| T-01 | unit | given / when / then | AC-1 |",
  "",
].join("\n");

function fixtureRepo(spec: string): string {
  const root = mkdtempSync(join(tmpdir(), "fo-specs-"));
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs/099-fixture.md"), spec, "utf8");
  writeFileSync(
    join(root, "specs/_template.md"),
    readFileSync(join(repoRoot, "specs/_template.md"), "utf8"),
    "utf8",
  );
  return root;
}

describe("anchoring (AC-35)", () => {
  it("anchors an id to the line that defines it, not the first mention", () => {
    const anchors = anchorsIn(FIXTURE);
    const ac2 = anchors.find((anchor) => anchor.id === "AC-2");
    expect(ac2?.section).toBe("§9");
    expect(ac2?.line).toBe(14);
  });

  it("anchors a test id to its row in the test-case table", () => {
    const t1 = anchorsIn(FIXTURE).find((anchor) => anchor.id === "T-01");
    expect(t1?.section).toBe("§10");
    expect(t1?.line).toBe(20);
  });

  it("orders acceptance criteria before test cases, each numerically", () => {
    expect(anchorsIn(FIXTURE).map((anchor) => anchor.id)).toEqual([
      "AC-1",
      "AC-2",
      "T-01",
    ]);
  });

  it("labels a section by its number", () => {
    expect(sectionLabel("## 14. Amendments")).toBe("§14");
    expect(sectionLabel("## Appendix")).toBe("§Appendix");
  });
});

describe("the index block", () => {
  it("goes in after the header table and reports post-insertion line numbers", () => {
    const indexed = withIndex(FIXTURE);
    const lines = indexed.split("\n");
    expect(lines[6]).toBe(INDEX_HEADING);
    const acLine = /`AC-1` §9 L(\d+)/.exec(indexed)?.[1];
    expect(acLine).toBeDefined();
    expect(lines[Number(acLine) - 1]).toContain("**AC-1**");
  });

  it("never indexes itself", () => {
    expect(withIndex(FIXTURE)).not.toMatch(/`AC-1` §0/);
  });

  it("is idempotent and removable", () => {
    const once = withIndex(FIXTURE);
    expect(withIndex(once)).toBe(once);
    expect(withoutIndex(once)).toBe(FIXTURE);
  });

  it("closes with the end marker", () => {
    expect(withIndex(FIXTURE)).toContain(INDEX_END);
  });
});

describe("`--check` bites (T-36)", () => {
  it("accepts a freshly generated set", () => {
    const root = fixtureRepo(withIndex(FIXTURE));
    expect(checkSpecIndexes(root)).toEqual([]);
  });

  it("reports a stale index after a line moves", () => {
    const root = fixtureRepo(
      withIndex(FIXTURE).replace(
        "## 1. Problem",
        "Another paragraph.\n\n## 1. Problem",
      ),
    );
    expect(checkSpecIndexes(root).join("\n")).toContain("index is stale");
  });

  it("reports a stale index after a criterion is added", () => {
    const root = fixtureRepo(
      withIndex(FIXTURE).replace(
        "- **AC-2** the second thing.",
        "- **AC-2** the second thing.\n- **AC-3** a new one.",
      ),
    );
    expect(checkSpecIndexes(root).join("\n")).toContain("index is stale");
  });

  it("reports a spec with no index block at all", () => {
    const root = fixtureRepo(FIXTURE);
    expect(checkSpecIndexes(root).join("\n")).toContain(
      'no "## 0. Index" block',
    );
  });

  it("reports a template that lost the block", () => {
    const root = fixtureRepo(withIndex(FIXTURE));
    writeFileSync(join(root, "specs/_template.md"), "# SPEC-NNN\n", "utf8");
    expect(checkSpecIndexes(root).join("\n")).toContain("_template.md");
  });
});

describe("the committed specs", () => {
  it("all carry a current index", () => {
    expect(checkSpecIndexes(repoRoot).join("\n")).toBe("");
  });

  it("index every AC and T id the spec defines", () => {
    for (const file of specFiles(repoRoot)) {
      const markdown = readFileSync(join(repoRoot, file), "utf8");
      const block = markdown.slice(
        markdown.indexOf(INDEX_HEADING),
        markdown.indexOf(INDEX_END),
      );
      for (const anchor of anchorsIn(withoutIndex(markdown))) {
        expect(block, `${file} ${anchor.id}`).toContain(`\`${anchor.id}\``);
      }
    }
  });

  it("points spec 001's AC-33…AC-36 at §14 and T-34…T-37 at their amendment", () => {
    const markdown = readFileSync(
      join(repoRoot, "specs/001-repo-dev-os-bootstrap.md"),
      "utf8",
    );
    for (const id of ["AC-33", "AC-34", "AC-35", "AC-36", "T-34", "T-37"]) {
      expect(markdown, id).toMatch(new RegExp(`\`${id}\` §14 L\\d+`));
    }
  });
});
