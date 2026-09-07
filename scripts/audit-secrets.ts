/**
 * `pnpm audit:secrets` — the gitleaks half of the dependency/secret audit gate
 * (spec 001 §8 "Logs / PII", AC-27 / T-28; TASK-011).
 *
 * `pnpm run audit` runs `pnpm audit --prod --audit-level=high` and then this script, so one
 * command answers both halves of "is anything in here dangerous": a vulnerable production
 * dependency, and a credential committed to the tree.
 *
 * `pnpm run audit`, not `pnpm audit`: pnpm has a built-in `audit` command, and a bare `pnpm audit`
 * runs the built-in and never reaches the script. The script keeps the name spec 001 §2 gives it
 * ("`audit`"), so `pnpm run audit` is the composite gate and `pnpm audit` is the dependency half
 * on its own — the CI job calls the two halves separately for that reason.
 *
 * Scan mode is `gitleaks dir` over the working tree — what you are about to commit — with
 * `.gitleaks.toml` supplying the two narrow allowlists this repository needs (documented there).
 * `--redact` is always passed and the report is read for rule ids, files and line numbers only:
 * a secret value must never reach a CI log, an artifact or a step summary, or the gate that finds
 * the leak becomes the second place it is published.
 *
 * The binary is not a dependency of this project (it is a Go binary, not an npm package). It is
 * resolved from `GITLEAKS_BIN`, then `PATH`. When it is missing:
 *
 *  - **in CI** (`CI` set) this is a hard failure. A gate that silently skips is not a gate, and
 *    the `audit` job installs the pinned binary itself, so a miss there means the install broke.
 *  - **locally** it exits 0 after printing the install command, so a clean clone can run
 *    `pnpm audit` on day one without a Go toolchain (spec 001 §2 "Documentation": the README's
 *    troubleshooting section). CI is the enforcing copy.
 *
 * Exit codes: 0 = no findings (or a documented local skip); 1 = findings, or gitleaks itself
 * failed, or the binary is missing in CI.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

/** Pinned in one place: the CI job installs this version and the runbook quotes it. */
export const GITLEAKS_VERSION = "8.28.0";

export const INSTALL_HINT = [
  `gitleaks ${GITLEAKS_VERSION} is not installed, so no secret scan ran.`,
  "Install it with one of:",
  "  brew install gitleaks",
  `  go install github.com/gitleaks/gitleaks/v8@v${GITLEAKS_VERSION}`,
  `  curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/').tar.gz | tar xz gitleaks`,
  "or point GITLEAKS_BIN at an existing binary. The `audit` CI job installs it itself, so this",
  "skip is local-only and the gate still runs on every pull request.",
].join("\n");

/**
 * A gitleaks JSON report entry, narrowed to the fields that are safe to print. `Secret` and
 * `Match` exist in the file and are deliberately not in this schema: nothing downstream can leak
 * a value it never parsed.
 */
const Finding = z
  .object({
    RuleID: z.string(),
    Description: z.string().default(""),
    File: z.string().default(""),
    StartLine: z.number().default(0),
  })
  .loose();

const Report = z.array(Finding);

export type Finding = z.infer<typeof Finding>;

/** The binary path, or `undefined` when gitleaks is not installed. */
export function resolveGitleaksBin(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const override = env["GITLEAKS_BIN"];
  if (override !== undefined && override !== "") {
    return existsSync(override) ? override : undefined;
  }
  const which = spawnSync(
    process.platform === "win32" ? "where" : "command",
    [...(process.platform === "win32" ? [] : ["-v"]), "gitleaks"],
    { encoding: "utf8", shell: process.platform !== "win32" },
  );
  const found = which.stdout.split(/\r?\n/)[0]?.trim();
  return which.status === 0 && found !== undefined && found !== ""
    ? found
    : undefined;
}

/** Parses a gitleaks JSON report; an empty file means "no leaks found". */
export function parseReport(contents: string): Finding[] {
  const trimmed = contents.trim();
  if (trimmed === "") return [];
  return Report.parse(JSON.parse(trimmed));
}

/** One line per finding: rule, file and line. Never a value (see `Finding`). */
export function formatFindings(findings: readonly Finding[]): string[] {
  return findings.map(
    (finding) =>
      `${finding.RuleID} in ${finding.File}:${String(finding.StartLine)} — ${finding.Description}`,
  );
}

/** The markdown the `audit` CI job puts in its step summary. */
export function formatSummary(
  findings: readonly Finding[],
  scanned: string,
): string {
  const lines = [
    "### audit — gitleaks (AC-27 / T-28)",
    "",
    `- target: \`${scanned}\` (working tree, \`.gitleaks.toml\` allowlists)`,
    `- findings: ${String(findings.length)}`,
  ];
  if (findings.length > 0) {
    lines.push("", "| rule | file | line |", "|---|---|---|");
    for (const finding of findings) {
      // Values are redacted by gitleaks and never parsed here, so this table is safe to publish.
      lines.push(
        `| \`${finding.RuleID}\` | \`${finding.File}\` | ${String(finding.StartLine)} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export interface ScanResult {
  readonly findings: Finding[];
  /** gitleaks exit status: 0 = clean, 1 = findings, anything else = the tool itself failed. */
  readonly status: number;
  readonly stderr: string;
}

/** Runs `gitleaks dir` over `target` with this repository's config. */
export function scanDirectory(
  bin: string,
  target: string,
  configPath: string,
): ScanResult {
  const reportDir = mkdtempSync(join(tmpdir(), "fo-gitleaks-"));
  const reportPath = join(reportDir, "gitleaks.json");
  try {
    const run = spawnSync(
      bin,
      [
        "dir",
        target,
        "--no-banner",
        // Never let a value reach stdout, a log or an artifact.
        "--redact",
        "--config",
        configPath,
        "--report-format",
        "json",
        "--report-path",
        reportPath,
      ],
      { encoding: "utf8" },
    );
    const contents = existsSync(reportPath)
      ? readFileSync(reportPath, "utf8")
      : "";
    return {
      findings: parseReport(contents),
      status: run.status ?? 1,
      stderr: run.stderr ?? "",
    };
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const target = process.argv[2] ?? repoRoot;
  const bin = resolveGitleaksBin();
  const inCi = (process.env["CI"] ?? "") !== "";

  if (bin === undefined) {
    if (inCi) {
      console.error(
        "audit:secrets: gitleaks is not installed and CI is set. The `audit` job installs the\n" +
          "pinned binary before running this script; a missing binary means that step failed.",
      );
      process.exit(1);
    }
    console.log(INSTALL_HINT);
    process.exit(0);
  }

  const version = execFileSync(bin, ["version"], { encoding: "utf8" }).trim();
  const { findings, status, stderr } = scanDirectory(
    bin,
    target,
    resolve(repoRoot, ".gitleaks.toml"),
  );

  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile !== undefined && summaryFile !== "") {
    // Appended rather than written: the `audit` job's pnpm-audit half writes its own section.
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryFile, formatSummary(findings, target));
  }

  if (status !== 0 && status !== 1) {
    console.error(
      `audit:secrets: gitleaks ${version} exited ${String(status)}`,
    );
    console.error(stderr);
    process.exit(1);
  }

  if (findings.length > 0) {
    console.error(
      `audit:secrets: gitleaks ${version} found ${String(findings.length)} finding(s):`,
    );
    for (const line of formatFindings(findings)) console.error(`  ${line}`);
    console.error(
      "Values are redacted here on purpose. Rotate the credential first, then remove it from\n" +
        "the tree and from git history; allowlist in `.gitleaks.toml` only a value that is\n" +
        "provably not a secret, with a comment saying why.",
    );
    process.exit(1);
  }

  console.log(`audit:secrets: gitleaks ${version} — no findings in ${target}`);
  process.exit(0);
}
