/**
 * AC-30 (TASK-012): the documentation deliverables of spec 001 §2 "Documentation and ledger".
 *
 * T-31 (a reviewer following the README on a clean machine, timed) cannot be automated. What can
 * be automated is everything that makes T-31 fail for a stupid reason: a setup section that grew
 * past eight commands, a script added to `package.json` and never documented, a runbook that
 * exists but is not in the index, a troubleshooting section that lost the entry for the one error
 * a newcomer *will* hit, and a `.claude/settings.json` that is no longer valid JSON after the
 * permission allow-list was extended (spec 001 §2, last bullet).
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

const readme = read("README.md");
const runbookIndex = read("docs/runbooks/README.md");
const localSetup = read("docs/runbooks/local-setup.md");

/** The section of a markdown document under a given `##` heading. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const rest = markdown.slice(start + 3);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("README.md (AC-30)", () => {
  it("has the sections spec 001 §2 asks for", () => {
    for (const heading of [
      "What this is",
      "Prerequisites",
      "Local setup",
      "Scripts",
      "How work happens here",
      "Quality gates",
      "Troubleshooting",
      "Where to look next",
    ]) {
      expect(readme, heading).toContain(`## ${heading}`);
    }
  });

  it("opens with what this is and links to the plan and CLAUDE.md", () => {
    expect(section(readme, "What this is")).toContain("plan/00-summary.md");
    expect(section(readme, "How work happens here")).toContain("CLAUDE.md");
  });

  it("sets up a clean clone in at most eight numbered commands", () => {
    const steps = section(readme, "Local setup")
      .split("\n")
      .filter((line) => /^\d+\. /.test(line));
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(8);
  });

  it("walks clone → install → env → build/dev → /api/health", () => {
    const setup = section(readme, "Local setup");
    for (const command of [
      "git clone",
      "pnpm install",
      "cp .env.example .env.local",
      "pnpm dev",
      "/api/health",
    ]) {
      expect(setup, command).toContain(command);
    }
  });

  it("names the pinned Node and pnpm and the optional tools", () => {
    const prerequisites = section(readme, "Prerequisites");
    expect(prerequisites).toContain(".node-version");
    expect(prerequisites).toContain("Corepack");
    expect(prerequisites).toContain("gitleaks");
    expect(prerequisites).toMatch(/\bgh\b/);
  });

  it("documents every package.json script exactly once", () => {
    const manifest = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const table = section(readme, "Scripts");
    for (const name of Object.keys(manifest.scripts)) {
      const occurrences = table.split(`\`pnpm ${name}\``).length - 1;
      expect(occurrences, `pnpm ${name}`).toBe(1);
    }
  });

  it("keeps a troubleshooting entry for every failure a newcomer hits first", () => {
    const troubleshooting = section(readme, "Troubleshooting");
    for (const [what, needle] of [
      ["Corepack on Node >= 25", "Corepack"],
      ["Homebrew pnpm fallback", "brew install pnpm"],
      ["env validation names the key", ".env.local"],
      ["guard denial", "task.sh set"],
      ["gitleaks-absent skips", "5 skipped"],
      ["middleware deprecation", "proxy.ts"],
      ["lighthouse NO_FCP", "NO_FCP"],
    ] as const) {
      expect(troubleshooting, what).toContain(needle);
    }
  });

  it("says the env error names the key and never the value", () => {
    expect(section(readme, "Troubleshooting")).toMatch(
      /names? the (variable|key)[\s\S]{0,120}never (the )?value/i,
    );
  });

  it("points at the runbooks and the architecture doc", () => {
    const next = section(readme, "Where to look next");
    expect(next).toContain("docs/architecture.md");
    expect(next).toContain("docs/runbooks/local-setup.md");
    expect(next).toContain("TASKS.md");
  });
});

describe("docs/runbooks (AC-30)", () => {
  it("indexes every runbook that exists", () => {
    const files = readdirSync(resolve(repoRoot, "docs/runbooks"))
      .filter((name) => name.endsWith(".md") && name !== "README.md")
      .map((name) => name.replace(/\.md$/, ""));
    expect(files).toContain("local-setup");
    for (const name of files) expect(runbookIndex, name).toContain(name);
  });

  it("has a local-setup runbook that goes from clone to a running app", () => {
    for (const needle of [
      "git clone",
      "pnpm install",
      "cp .env.example .env.local",
      "pnpm dev",
      "/api/health",
      "vercel env pull",
      "task.sh show",
    ]) {
      expect(localSetup, needle).toContain(needle);
    }
  });

  it("shows the expected output of each step and a common-failures section", () => {
    expect(localSetup).toContain("## 6. Common failures");
    expect(localSetup.match(/```/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("records the branch-protection founder decision as decided (GitHub Free, accepted deviation)", () => {
    const runbook = read("docs/runbooks/branch-protection.md");
    expect(runbook).toContain("decided 2026-09-08");
    expect(runbook).toContain("stay on GitHub Free");
    expect(runbook).toContain("accepted deviation");
  });
});

describe(".claude/settings.json (spec 001 §2)", () => {
  const settings = JSON.parse(read(".claude/settings.json")) as {
    hooks?: Record<string, unknown>;
    permissions?: { allow?: string[] };
  };

  it("is valid JSON that still wires both hooks", () => {
    expect(Object.keys(settings.hooks ?? {})).toEqual(["PreToolUse", "Stop"]);
  });

  it("allows the four commands spec 001 §2 adds, and keeps the earlier ones", () => {
    const allow = settings.permissions?.allow ?? [];
    for (const entry of [
      "Bash(.claude/bin/task.sh *)",
      "Bash(./.claude/bin/task.sh *)",
      "Bash(pnpm lint*)",
      "Bash(pnpm typecheck*)",
      "Bash(pnpm test*)",
      "Bash(pnpm build*)",
      "Bash(pnpm format*)",
      "Bash(pnpm env:check*)",
      "Bash(pnpm dev-os:check*)",
    ]) {
      expect(allow, entry).toContain(entry);
    }
  });

  it("has no duplicate allow entry", () => {
    const allow = settings.permissions?.allow ?? [];
    expect(new Set(allow).size).toBe(allow.length);
  });
});
