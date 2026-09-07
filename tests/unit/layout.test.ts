import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MODULES,
  REQUIRED_DIRS,
  REQUIRED_FILES,
  checkLayout,
  formatReport,
} from "../../scripts/check-layout";

const repoRoot = resolve(__dirname, "../..");
const tempRoots: string[] = [];

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "fo-layout-"));
  tempRoots.push(root);
  for (const dir of REQUIRED_DIRS)
    mkdirSync(join(root, dir), { recursive: true });
  for (const file of REQUIRED_FILES) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "export {};\n");
  }
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("plan/01 §5 layout manifest (T-03)", () => {
  it("names the eleven modules of plan/01 §5", () => {
    expect([...MODULES].sort()).toEqual(
      [
        "admin",
        "analytics",
        "catalog",
        "customers",
        "geo",
        "i18n",
        "notifications",
        "orders",
        "partners",
        "payments",
        "seo",
      ].sort(),
    );
  });

  it("repo tree has no missing paths and no extra top-level module dirs", () => {
    const report = checkLayout(repoRoot);
    expect(report, formatReport(report)).toEqual({
      missing: [],
      extraModules: [],
    });
  });

  it("CLI exits 0 on the repo tree", () => {
    const out = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/check-layout.ts"), repoRoot],
      {
        encoding: "utf8",
      },
    );
    expect(out).toMatch(/^layout ok/);
  });

  it("reports a missing module barrel and a missing directory", () => {
    const root = scaffold();
    rmSync(join(root, "src/modules/orders/index.ts"));
    rmSync(join(root, "supabase/migrations"), { recursive: true });
    const report = checkLayout(root);
    expect(report.missing).toEqual([
      "supabase/migrations/",
      "src/modules/orders/index.ts",
    ]);
    expect(report.extraModules).toEqual([]);
  });

  it("reports an unknown top-level module directory", () => {
    const root = scaffold();
    mkdirSync(join(root, "src/modules/loyalty"));
    const report = checkLayout(root);
    expect(report.missing).toEqual([]);
    expect(report.extraModules).toEqual(["src/modules/loyalty/"]);
  });

  it("CLI exits 1 and names the problem when the tree drifts", () => {
    const root = scaffold();
    mkdirSync(join(root, "src/modules/loyalty"));
    let status = 0;
    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [join(repoRoot, "scripts/check-layout.ts"), root],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      status = failure.status ?? -1;
      stderr = failure.stderr ?? "";
    }
    expect(status).toBe(1);
    expect(stderr).toContain("src/modules/loyalty/");
  });
});
