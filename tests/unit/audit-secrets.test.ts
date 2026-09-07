/**
 * AC-27 / T-28 (TASK-011): the audit gate.
 *
 * Two halves, both asserted here:
 *  - **gitleaks finds a planted secret.** A gate nobody has watched fail is not known to work, so
 *    the test writes a fake `sk_live_…` key into a temp directory and asserts gitleaks reports it,
 *    using this repository's `.gitleaks.toml` — proving the allowlists in that file did not widen
 *    into "ignore everything".
 *  - **this repository is clean**, with the documented placeholders (`.env.example`,
 *    `tests/fixtures/env/*.env`) not producing a false positive.
 *
 * gitleaks is a Go binary, not an npm dependency. When it is absent the two scanning tests skip
 * with the reason printed; the `audit` CI job installs the pinned version, so the enforcing copy
 * of this test always runs. Everything that does not need the binary — report parsing, the
 * missing-binary policy, the step summary, the config's own contents — is asserted unconditionally.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  formatFindings,
  formatSummary,
  GITLEAKS_VERSION,
  INSTALL_HINT,
  parseReport,
  resolveGitleaksBin,
  scanDirectory,
} from "../../scripts/audit-secrets.ts";

const repoRoot = resolve(__dirname, "../..");
const configPath = resolve(repoRoot, ".gitleaks.toml");
const bin = resolveGitleaksBin();
const temps: string[] = [];

/**
 * A fake Stripe live key in the shape Stripe's own documentation uses, assembled at runtime.
 * It is not a credential and it never reaches a commit as one token, so the repository's own
 * gitleaks scan stays clean without an allowlist entry for this file.
 */
const FAKE_STRIPE_KEY = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "fo-gitleaks-test-"));
  temps.push(dir);
  return dir;
}

// `describe.skipIf` with the reason in the title, so a skipped run says *why* in the report
// instead of quietly reporting one test fewer.
const reason = `gitleaks binary not found (install v${GITLEAKS_VERSION} or set GITLEAKS_BIN; the audit CI job always has it)`;

describe.skipIf(bin === undefined)(
  "gitleaks scans (AC-27 / T-28)",
  { timeout: 60_000 },
  () => {
    it("detects a planted fake Stripe live key", () => {
      const dir = temp();
      // Written to a temp directory outside the repository and removed in `afterAll`. Assembled
      // from parts rather than written as one literal so that *this* file does not carry a
      // `sk_live_…` token: the repository scan below has to be clean on its own merits, not because
      // `.gitleaks.toml` was widened to forgive the test that proves the scanner works.
      writeFileSync(
        join(dir, "leak.ts"),
        `export const key = "${FAKE_STRIPE_KEY}";\n`,
      );

      const result = scanDirectory(bin ?? "", dir, configPath);

      expect(result.status).toBe(1);
      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.findings.map((finding) => finding.RuleID)).toContain(
        "stripe-access-token",
      );
      expect(formatFindings(result.findings).join("\n")).toContain("leak.ts");
    });

    it("does not treat a documented `placeholder-` value as a secret", () => {
      const dir = temp();
      writeFileSync(
        join(dir, "sample.env"),
        "SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key\n",
      );

      const result = scanDirectory(bin ?? "", dir, configPath);

      expect(result.findings).toEqual([]);
      expect(result.status).toBe(0);
    });

    it("still catches a real-looking key sitting next to a placeholder", () => {
      // The allowlist is on the value, not the file: the exemption must not shelter its neighbours.
      const dir = temp();
      writeFileSync(
        join(dir, "mixed.env"),
        `SUPABASE_ANON_KEY=placeholder-anon-key\nSTRIPE_SECRET_KEY=${FAKE_STRIPE_KEY}\n`,
      );

      const result = scanDirectory(bin ?? "", dir, configPath);

      expect(result.findings.map((finding) => finding.RuleID)).toContain(
        "stripe-access-token",
      );
    });

    it("reports zero findings for this repository", () => {
      const result = scanDirectory(bin ?? "", repoRoot, configPath);

      expect(formatFindings(result.findings)).toEqual([]);
      expect(result.status).toBe(0);
    });

    it("runs the pinned version through `pnpm audit:secrets`", () => {
      const stdout = execFileSync(
        process.execPath,
        ["scripts/audit-secrets.ts"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: { ...process.env, GITLEAKS_BIN: bin ?? "" },
        },
      );
      expect(stdout).toContain("no findings");
    });
  },
);

if (bin === undefined) {
  // Tests are exempt from `no-console` (spec 001 §2); this is the "skip with an explicit reason"
  // half of T-28 — a skipped scan must say why in the run output, not only in the report.
  console.log(
    `tests/unit/audit-secrets.test.ts: skipping the scans — ${reason}`,
  );
}

describe("report parsing never handles secret values", () => {
  it("reads an empty report as no findings", () => {
    expect(parseReport("")).toEqual([]);
    expect(parseReport("[]")).toEqual([]);
  });

  it("keeps rule, file and line and drops `Secret` and `Match`", () => {
    const [finding] = parseReport(
      JSON.stringify([
        {
          RuleID: "stripe-access-token",
          Description: "Stripe Access Token",
          File: "src/x.ts",
          StartLine: 3,
          Secret: "sk_live_REAL",
          Match: 'key = "sk_live_REAL"',
        },
      ]),
    );
    expect(finding).toBeDefined();
    expect(
      formatFindings(parseReport(JSON.stringify([finding]))).join(),
    ).not.toContain("sk_live_REAL");
    expect(
      formatSummary(parseReport(JSON.stringify([finding])), "src"),
    ).not.toContain("sk_live_REAL");
  });

  it("throws on a report that is not an array of findings", () => {
    expect(() => parseReport('{"RuleID":"x"}')).toThrow();
  });
});

describe("the step summary", () => {
  it("states the finding count even when it is zero", () => {
    const summary = formatSummary([], "/repo");
    expect(summary).toContain("### audit — gitleaks (AC-27 / T-28)");
    expect(summary).toContain("- findings: 0");
    expect(summary).not.toContain("| rule |");
  });

  it("tabulates rule, file and line when there are findings", () => {
    const summary = formatSummary(
      [
        {
          RuleID: "generic-api-key",
          Description: "d",
          File: "a/b.ts",
          StartLine: 9,
        },
      ],
      "/repo",
    );
    expect(summary).toContain("- findings: 1");
    expect(summary).toContain("| `generic-api-key` | `a/b.ts` | 9 |");
  });
});

describe("the missing-binary policy", () => {
  it("resolves nothing when GITLEAKS_BIN points at a path that does not exist", () => {
    expect(
      resolveGitleaksBin({ GITLEAKS_BIN: "/nonexistent/gitleaks" }),
    ).toBeUndefined();
  });

  it("uses GITLEAKS_BIN when it does exist", () => {
    expect(resolveGitleaksBin({ GITLEAKS_BIN: process.execPath })).toBe(
      process.execPath,
    );
  });

  it("names the pinned version and an install command in the local skip message", () => {
    expect(INSTALL_HINT).toContain(GITLEAKS_VERSION);
    expect(INSTALL_HINT).toContain("brew install gitleaks");
  });

  it("fails instead of skipping when CI is set", () => {
    let status = 0;
    try {
      execFileSync(process.execPath, ["scripts/audit-secrets.ts"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "true",
          GITLEAKS_BIN: "/nonexistent/gitleaks",
          PATH: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      status = failure.status ?? 1;
      expect(failure.stderr ?? "").toContain("CI is set");
    }
    expect(status).toBe(1);
  });
});

describe(".gitleaks.toml", () => {
  const config = readFileSync(configPath, "utf8");

  it("extends the default rule set instead of replacing it", () => {
    expect(config).toContain("useDefault = true");
  });

  it("allowlists placeholder values by value, not by file path", () => {
    expect(config).toContain('regexTarget = "match"');
    expect(config).toContain("placeholder-");
  });

  it("allowlists only git-ignored directories by path", () => {
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
    const paths = [
      ...config.matchAll(/'''\(\^\|\/\)\\?\.?([a-z-]+)\/'''/g),
    ].map((match) => match[1]);
    expect(paths.length).toBeGreaterThan(5);
    for (const dir of paths) {
      if (dir === "git") continue; // `.git/` is not in `.gitignore`; it is never committable.
      expect(gitignore).toContain(`${dir}/`);
    }
  });

  it("is wired into `pnpm run audit` alongside the dependency audit", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["audit"]).toBe(
      "pnpm audit --prod --audit-level=high && pnpm audit:secrets",
    );
    expect(pkg.scripts["audit:secrets"]).toBe("node scripts/audit-secrets.ts");
    // `pnpm run audit`, not `pnpm audit`: pnpm's built-in `audit` command shadows the script, so
    // the composite gate has to be invoked with `run`. The script's own first half calls the
    // built-in deliberately.
    expect(pkg.scripts["audit"]).toContain("pnpm audit --prod");
  });
});
