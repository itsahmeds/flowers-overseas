/**
 * T-07 (spec 001 AC-6, TASK-003): no file under `src/` disables `fo/no-literal-strings`.
 * Same check as `pnpm check:no-literal-disable`, which runs in CI via `pnpm lint`'s siblings.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DISABLE_PATTERN,
  findLiteralStringDisables,
} from "../../scripts/check-no-literal-disable";

const repoRoot = resolve(__dirname, "../..");
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

function tempSrc(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "fo-literal-disable-"));
  tempRoots.push(root);
  mkdirSync(join(root, "src/app"), { recursive: true });
  writeFileSync(join(root, "src/app/page.tsx"), contents);
  return root;
}

describe("AC-6: no fo/no-literal-strings disables under src/ (T-07)", () => {
  it("finds none in this repository", () => {
    expect(findLiteralStringDisables(repoRoot)).toEqual([]);
  });

  it("exits 0 as a script", () => {
    const out = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/check-no-literal-disable.ts"), repoRoot],
      { encoding: "utf8" },
    );
    expect(out).toContain("AC-6");
  });

  it("detects a disable comment in any of its forms", () => {
    for (const form of [
      "/* eslint-disable fo/no-literal-strings */",
      "// eslint-disable-next-line fo/no-literal-strings",
      "// eslint-disable-line fo/no-literal-strings -- shipping copy",
      "/* eslint-disable @next/next/no-img-element, fo/no-literal-strings */",
    ]) {
      expect(DISABLE_PATTERN.test(form)).toBe(true);
      const root = tempSrc(`${form}\nexport const a = 1;\n`);
      const hits = findLiteralStringDisables(root);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.file).toBe("src/app/page.tsx");
      expect(hits[0]?.line).toBe(1);
    }
  });

  it("ignores unrelated disable comments", () => {
    const root = tempSrc(
      "/* eslint-disable fo/no-physical-css */\nexport const a = 1;\n",
    );
    expect(findLiteralStringDisables(root)).toEqual([]);
  });

  it("exits non-zero as a script when a disable comment exists", () => {
    const root = tempSrc(
      "// eslint-disable-next-line fo/no-literal-strings\nexport const a = 1;\n",
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [join(repoRoot, "scripts/check-no-literal-disable.ts"), root],
        { encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow();
  });
});
