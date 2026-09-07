/**
 * T-21 (spec 001 AC-20, TASK-002): commitlint on fixture messages via the loaded repo
 * config, and the husky `commit-msg` hook exists and invokes commitlint.
 */
import lint from "@commitlint/lint";
import load from "@commitlint/load";
import type { QualifiedConfig } from "@commitlint/types";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

let config: QualifiedConfig;

async function lintMessage(message: string) {
  return lint(message, config.rules, {
    parserOpts: config.parserPreset?.parserOpts ?? {},
    plugins: config.plugins,
    helpUrl: config.helpUrl,
  });
}

beforeAll(async () => {
  config = await load({}, { cwd: repoRoot });
});

describe("commitlint config (T-21)", () => {
  it("extends @commitlint/config-conventional", () => {
    expect(config.extends).toContain("@commitlint/config-conventional");
    expect(config.rules["type-enum"]).toBeDefined();
    expect(config.rules["subject-empty"]).toBeDefined();
  });

  it("rejects `updated stuff`", async () => {
    const result = await lintMessage("updated stuff");
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.name)).toEqual(
      expect.arrayContaining(["subject-empty", "type-empty"]),
    );
  });

  it("accepts `chore(ci): add lint job (TASK-001)`", async () => {
    const result = await lintMessage("chore(ci): add lint job (TASK-001)");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a conventional message with a Co-Authored-By footer", async () => {
    const result = await lintMessage(
      "ci(repo): husky, commitlint, CI skeleton and PR policy (TASK-002)\n\n" +
        "Body line.\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown type", async () => {
    const result = await lintMessage("wip: something (TASK-002)");
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.name)).toContain("type-enum");
  });
});

describe("husky hooks (T-21)", () => {
  const tempDirs: string[] = [];
  afterAll(() => {
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  });

  it("commit-msg hook invokes commitlint on the message file", () => {
    const hook = readFileSync(join(repoRoot, ".husky/commit-msg"), "utf8");
    expect(hook).toMatch(/commitlint\s+--edit\s+"\$1"/);
  });

  it("pre-commit hook runs lint-staged and typecheck", () => {
    const hook = readFileSync(join(repoRoot, ".husky/pre-commit"), "utf8");
    expect(hook).toMatch(/lint-staged/);
    expect(hook).toMatch(/typecheck/);
  });

  it("running the commit-msg hook rejects `updated stuff` and accepts a conventional message", () => {
    const dir = mkdtempSync(join(tmpdir(), "fo-commitlint-"));
    tempDirs.push(dir);
    const bad = join(dir, "bad.txt");
    const good = join(dir, "good.txt");
    writeFileSync(bad, "updated stuff\n");
    writeFileSync(good, "chore(ci): add lint job (TASK-001)\n");

    const run = (file: string): number => {
      try {
        execFileSync("sh", [join(repoRoot, ".husky/commit-msg"), file], {
          cwd: repoRoot,
          stdio: ["ignore", "pipe", "pipe"],
        });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? -1;
      }
    };

    expect(run(bad)).not.toBe(0);
    expect(run(good)).toBe(0);
  }, 60_000);
});
