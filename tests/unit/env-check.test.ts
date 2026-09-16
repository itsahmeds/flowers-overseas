/**
 * T-12 / AC-11 (TASK-005): `pnpm env:check` over the three fixtures, and over the real
 * `.env.example`, which must agree with the zod schema at merge.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ENV_KEYS } from "../../src/lib/env.schema";
import {
  checkEnvFile,
  formatEnvCheckReport,
  parseEnvFileKeys,
} from "../../scripts/env-check";

const repoRoot = resolve(__dirname, "../..");
const fixture = (name: string): string =>
  resolve(repoRoot, "tests/fixtures/env", name);

function runCli(file: string): { status: number; output: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["scripts/env-check.ts", "--file", file],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, output: stdout };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

describe("env:check (T-12)", () => {
  it("exits 0 on tests/fixtures/env/valid.env", () => {
    const result = runCli("tests/fixtures/env/valid.env");
    expect(result.status).toBe(0);
    expect(result.output).toContain(String(ENV_KEYS.length));
  });

  it("exits non-zero when a schema key is absent from the file", () => {
    const result = runCli("tests/fixtures/env/missing-key.env");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("DATABASE_URL_UNPOOLED");
  });

  it("exits non-zero when the file has a key the schema does not know", () => {
    const result = runCli("tests/fixtures/env/extra-key.env");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("FO_NOT_IN_SCHEMA");
  });

  it("exits 0 on the committed .env.example (AC-11 at merge)", () => {
    const result = runCli(".env.example");
    expect(result.status).toBe(0);
  });

  it("reports duplicate declarations", () => {
    const keys = parseEnvFileKeys("A=1\n# comment\nA=2\n\nexport B=3\n");
    expect(keys).toEqual(["A", "A", "B"]);
  });

  it("names both directions in the report", () => {
    const missing = checkEnvFile(fixture("missing-key.env"));
    expect(missing.missingKeys).toEqual(["DATABASE_URL_UNPOOLED"]);
    expect(formatEnvCheckReport("missing-key.env", missing)).toContain(
      "not in missing-key.env",
    );

    const extra = checkEnvFile(fixture("extra-key.env"));
    expect(extra.unknownKeys).toEqual(["FO_NOT_IN_SCHEMA"]);
    expect(formatEnvCheckReport("extra-key.env", extra)).toContain(
      "not in the zod schema",
    );
  });
});
