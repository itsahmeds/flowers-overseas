/**
 * T-55 (spec 001 §14 A20, AC-51; TASK-158), which keeps T-07 (AC-6, TASK-003) as a subset.
 *
 * `pnpm check:no-literal-disable` reads comments, never strings, over every file `eslint .`
 * lints, and exits 1 on (a) a disable or enable directive that names no rule, (b) any directive
 * or `eslint` config comment that names an `fo/` rule, and (c) a `stylelint-disable` comment in
 * a `.css` file (§13 Q18). It is the lock that does not live in `eslint.config.mjs`: if someone
 * deletes `noInlineConfig` there (AC-50), these comments still go red here.
 *
 * Every directive below sits inside a string of this file, which is itself scanned on the real
 * tree: the "finds none in this repository" case is also the proof that strings never count.
 */
import { ESLint } from "eslint";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findLockedComments,
  findLockedCommentsInSource,
  scannedFiles,
} from "../../scripts/check-no-literal-disable";

const repoRoot = resolve(__dirname, "../..");
const script = join(repoRoot, "scripts/check-no-literal-disable.ts");
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

/** A scratch tree holding the given files, relative path → contents. */
function tempTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fo-locked-comment-"));
  tempRoots.push(root);
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  }
  return root;
}

function runScan(root: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [script, root], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** T-55's five forms, each with the reason AC-51 gives for it. */
const RED_FORMS = [
  ["// eslint-disable-next-line", "bare-directive"],
  ["// eslint-disable-line -- because", "bare-directive"],
  ["/* eslint-enable */", "bare-directive"],
  ["/* eslint-disable fo/no-raw-color */", "fo-rule"],
  ["/* eslint fo/no-physical-css: off */", "fo-rule"],
] as const;

/** T-55 names these three roots; each form is planted in `x.ts` of each. */
const T55_ROOTS = ["src", "scripts", "seed"] as const;

describe("AC-51 (a) and (b): the scan names a bare directive and any fo/ rule (T-55)", () => {
  for (const root of T55_ROOTS) {
    for (const [form, reason] of RED_FORMS) {
      it(`${root}/x.ts: ${form} → ${reason} on line 2`, () => {
        const hits = findLockedCommentsInSource(
          `${root}/x.ts`,
          `export const a = 1;\n${form}\nexport const b = 2;\n`,
        );
        expect(hits).toEqual([
          { file: `${root}/x.ts`, line: 2, text: form, reason },
        ]);
      });
    }
  }

  it("exits 1 as a script and prints file:line for every plant in every root", () => {
    // Form i sits on line 2 + 2i, each followed by a line of code.
    const contents = [
      "export const a = 1;",
      ...RED_FORMS.flatMap(([form], index) => [
        form,
        `export const b${String(index)} = 2;`,
      ]),
      "",
    ].join("\n");
    const { status, stderr } = runScan(
      tempTree(
        Object.fromEntries(T55_ROOTS.map((root) => [`${root}/x.ts`, contents])),
      ),
    );
    expect(status).toBe(1);
    for (const root of T55_ROOTS) {
      RED_FORMS.forEach(([form], index) => {
        expect(stderr).toContain(
          `${root}/x.ts:${String(2 + index * 2)}: ${form}`,
        );
      });
    }
    expect(stderr).toContain("names no rule");
    expect(stderr).toContain("names an fo/ rule");
  });

  it("keeps AC-6: every form of a fo/no-literal-strings disable is a hit (T-07)", () => {
    for (const form of [
      "/* eslint-disable fo/no-literal-strings */",
      "// eslint-disable-next-line fo/no-literal-strings",
      "// eslint-disable-line fo/no-literal-strings -- shipping copy",
      "/* eslint-disable @next/next/no-img-element, fo/no-literal-strings */",
      '/* eslint-disable "fo/no-literal-strings" */',
      '/* eslint "fo/no-literal-strings": 0 */',
    ]) {
      expect(
        findLockedCommentsInSource("src/app/page.tsx", `${form}\n`),
        form,
      ).toEqual([
        { file: "src/app/page.tsx", line: 1, text: form, reason: "fo-rule" },
      ]);
    }
  });

  it("sees a comment inside JSX, after JSX text a plain token scan would misread", () => {
    const source = [
      "export function P() {",
      "  return (",
      "    <p>",
      "      don't",
      "      {/* eslint-disable fo/no-literal-strings */}",
      "    </p>",
      "  );",
      "}",
      "",
    ].join("\n");
    expect(
      findLockedCommentsInSource("src/app/p.tsx", source).map((hit) => [
        hit.line,
        hit.reason,
      ]),
    ).toEqual([[5, "fo-rule"]]);
  });

  it("reports the line a multi-line block directive starts on", () => {
    expect(
      findLockedCommentsInSource(
        "src/x.ts",
        "export const a = 1;\n/*\n  eslint-disable\n*/\n",
      ).map((hit) => [hit.line, hit.reason]),
    ).toEqual([[2, "bare-directive"]]);
  });
});

describe("AC-51 (c): a stylelint-disable comment in CSS (§13 Q18, T-55)", () => {
  it.each([
    "/* stylelint-disable */",
    "/* stylelint-disable property-disallowed-list */",
    "/* stylelint-disable-next-line */",
    "/* stylelint-disable-line color-no-hex */",
  ])("%s in src/x.css → hit on line 2", (form) => {
    expect(
      findLockedCommentsInSource("src/x.css", `a { color: red; }\n${form}\n`),
    ).toEqual([
      { file: "src/x.css", line: 2, text: form, reason: "stylelint-disable" },
    ]);
  });

  it("exits 1 as a script on /* stylelint-disable */ in src/x.css", () => {
    const { status, stderr } = runScan(
      tempTree({ "src/x.css": "/* stylelint-disable */\na { margin: 0; }\n" }),
    );
    expect(status).toBe(1);
    expect(stderr).toContain("src/x.css:1: /* stylelint-disable */");
  });

  it("ignores the same text inside a CSS string", () => {
    expect(
      findLockedCommentsInSource(
        "src/x.css",
        'a::after { content: "/* stylelint-disable */"; }\n',
      ),
    ).toEqual([]);
  });
});

describe("what the scan leaves alone (T-55)", () => {
  it("exits 0 on directive text in strings and on a named non-fo disable", () => {
    const strings = [
      'export const a = "/* eslint-disable */";',
      "export const b = '// eslint-disable-next-line';",
      "export const c = `/* eslint fo/no-physical-css: off */`;",
      'export const d = "/* eslint-disable fo/no-raw-color */";',
      "",
    ].join("\n");
    const named =
      "export function f(): void {}\n// eslint-disable-next-line react-hooks/exhaustive-deps\nf();\n";
    expect(findLockedCommentsInSource("src/x.ts", strings)).toEqual([]);
    expect(findLockedCommentsInSource("seed/x.ts", named)).toEqual([]);
    const { status, stdout } = runScan(
      tempTree({
        "src/x.ts": strings,
        "scripts/x.ts": strings,
        "seed/x.ts": named,
      }),
    );
    expect(status).toBe(0);
    expect(stdout).toContain("AC-51");
  });

  it("ignores prose that mentions a directive, and JSDoc", () => {
    expect(
      findLockedCommentsInSource(
        "src/x.ts",
        [
          "/** eslint-disable is banned here */",
          "// no `eslint-disable` is needed",
          "/* see eslint-disable fo/no-raw-color in the spec */",
          "export const a = 1;",
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("does not read tests/fixtures/, which violates the rules on purpose", () => {
    const root = tempTree({
      "tests/fixtures/lint/x.ts": "/* eslint-disable */\n",
      "tests/unit/x.test.ts": "export const a = 1;\n",
    });
    expect(scannedFiles(root)).toEqual(["tests/unit/x.test.ts"]);
    expect(findLockedComments(root)).toEqual([]);
  });
});

describe("the real tree (AC-51)", () => {
  it("finds none in this repository", () => {
    expect(findLockedComments(repoRoot)).toEqual([]);
  });

  it("exits 0 as a script", () => {
    const out = execFileSync(process.execPath, [script, repoRoot], {
      encoding: "utf8",
    });
    expect(out).toContain("AC-51");
  });

  /**
   * AC-51: "It covers every file `eslint .` lints". Every tracked file ESLint would lint (a
   * lintable extension, not ignored by the real config) must be in the scan's file list, so a
   * new top-level folder that ESLint reads cannot slip past the scan.
   */
  it("covers every tracked file eslint . lints, and src/**/*.css", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter((file) => file !== "");
    const scanned = new Set(scannedFiles(repoRoot));
    const linted: string[] = [];
    for (const file of tracked) {
      if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)) continue;
      if (await eslint.isPathIgnored(resolve(repoRoot, file))) continue;
      linted.push(file);
    }
    expect(linted.length).toBeGreaterThan(500);
    expect(linted.filter((file) => !scanned.has(file))).toEqual([]);
    const css = tracked.filter(
      (file) => file.startsWith("src/") && file.endsWith(".css"),
    );
    expect(css.length).toBeGreaterThan(0);
    expect(css.filter((file) => !scanned.has(file))).toEqual([]);
  });
});
