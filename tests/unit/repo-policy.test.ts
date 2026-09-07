/**
 * AC-28 / T-29 (TASK-011): the three repository-policy files.
 *
 * They are pure text and nobody reads them on a normal day, which is exactly why they rot: a
 * heading renamed here silently removes a section of every future PR description, and a
 * `renovate.json` with `automerge` flipped on would merge dependency updates past the reviewer.
 * These assertions are the only thing standing between that and a merge.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

/** The seven mandatory sections of spec 001 §2 "CI", in the order the spec lists them. */
const MANDATORY_SECTIONS = [
  "Task ID",
  "Spec path",
  "AC ids covered",
  "Tests added",
  "SEO / i18n / compliance impact",
  "Docs updated",
  "Preview URL",
] as const;

describe(".github/PULL_REQUEST_TEMPLATE.md (AC-28)", () => {
  const template = read(".github/PULL_REQUEST_TEMPLATE.md");
  const headings = [...template.matchAll(/^## (.+)$/gm)].map((match) =>
    (match[1] ?? "").trim(),
  );

  it("has the seven mandatory sections as level-2 headings", () => {
    for (const section of MANDATORY_SECTIONS) {
      expect(headings).toContain(section);
    }
  });

  it("keeps them in the order the spec lists", () => {
    const ordered = headings.filter((heading) =>
      (MANDATORY_SECTIONS as readonly string[]).includes(heading),
    );
    expect(ordered).toEqual([...MANDATORY_SECTIONS]);
  });

  it("adds the `/review` verdict section and leaves it for the reviewer", () => {
    expect(headings).toContain("Review");
    // The verdict is the last thing in the template, and the implementer fills nothing in.
    expect(headings.at(-1)).toBe("Review");
    expect(template).toContain("PASS / FAIL");
  });

  it("has exactly eight sections, so nothing has been quietly appended", () => {
    expect(headings).toEqual([...MANDATORY_SECTIONS, "Review"]);
  });

  it("asks for AC ids as a checklist and tests by layer", () => {
    expect(template).toMatch(/- \[ \] AC-NN/);
    for (const layer of [
      "unit",
      "integration",
      "contract",
      "e2e",
      "visual",
      "a11y",
    ]) {
      // Prettier pads the table columns, so match the cell rather than an exact spacing.
      expect(template).toMatch(new RegExp(`^\\|\\s*${layer}\\s*\\|`, "m"));
    }
  });

  it("asks for one line each on SEO, i18n and compliance", () => {
    expect(template).toContain("**SEO**");
    expect(template).toContain("**i18n**");
    expect(template).toContain("**compliance**");
    expect(template).toContain("ropa.md");
  });
});

describe(".github/CODEOWNERS (AC-28, spec 001 §13 Q1)", () => {
  const codeowners = read(".github/CODEOWNERS");
  const rules = codeowners
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  it("is not empty", () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it("names the owner from Q1 as the owner of every path", () => {
    expect(rules).toContain("* @itsahmeds");
  });

  it("assigns every owner as a GitHub handle or team, never an email", () => {
    for (const rule of rules) {
      const owners = rule.split(/\s+/).slice(1);
      expect(owners.length).toBeGreaterThan(0);
      for (const owner of owners)
        expect(owner).toMatch(/^@[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)?$/);
    }
  });
});

interface RenovateConfig {
  $schema?: string;
  extends?: string[];
  schedule?: string[];
  labels?: string[];
  automerge?: boolean;
  rangeStrategy?: string;
  lockFileMaintenance?: { enabled?: boolean; schedule?: string[] };
  packageRules?: { groupName?: string | null; matchUpdateTypes?: string[] }[];
  vulnerabilityAlerts?: { enabled?: boolean; schedule?: string[] };
}

describe("renovate.json (AC-28, spec 001 §13 Q7)", () => {
  const raw = read("renovate.json");
  const config = JSON.parse(raw) as RenovateConfig;

  it("parses as JSON and declares the Renovate schema", () => {
    expect(config.$schema).toBe(
      "https://docs.renovatebot.com/renovate-schema.json",
    );
    expect(config.extends).toContain("config:recommended");
  });

  it("has automerge off", () => {
    // The one setting that must never drift: `plan/12` §2 and §13 Q7 both say a human reads the
    // diff. `false`, not merely absent — an inherited preset could turn it on.
    expect(config.automerge).toBe(false);
  });

  it("runs weekly, not continuously", () => {
    expect(config.schedule).toEqual(["before 6am on monday"]);
    expect(config.schedule?.join(" ")).toMatch(/monday/i);
  });

  it("labels every PR `dependencies`", () => {
    expect(config.labels).toContain("dependencies");
  });

  it("enables lockFileMaintenance on the same weekly cadence", () => {
    expect(config.lockFileMaintenance?.enabled).toBe(true);
    expect(config.lockFileMaintenance?.schedule).toEqual([
      "before 6am on monday",
    ]);
  });

  it("groups minor and patch updates into one PR", () => {
    const grouped = config.packageRules?.find(
      (rule) =>
        rule.matchUpdateTypes?.includes("minor") === true &&
        rule.matchUpdateTypes.includes("patch"),
    );
    expect(grouped?.groupName).toBe("all non-major dependencies");
  });

  it("keeps major updates ungrouped", () => {
    const majors = config.packageRules?.find(
      (rule) =>
        rule.matchUpdateTypes?.length === 1 &&
        rule.matchUpdateTypes[0] === "major",
    );
    expect(majors).toBeDefined();
    expect(majors?.groupName).toBeNull();
  });

  it("pins a range strategy instead of leaving it to the preset", () => {
    expect(config.rangeStrategy).toBe("bump");
  });

  it("lets a security advisory out of the weekly window but still not automerge", () => {
    // `pnpm audit --audit-level=high` fails the `audit` job on such an advisory, so waiting for
    // Monday would mean a week of red CI.
    expect(config.vulnerabilityAlerts?.enabled).toBe(true);
    expect(config.vulnerabilityAlerts?.schedule).toEqual(["at any time"]);
    expect(raw).not.toMatch(/"automerge"\s*:\s*true/);
  });

  it("titles its PRs so the pr-policy bot exemption is the only thing they rely on", () => {
    // Renovate cannot know a task id (spec 001 §13 Q5): `scripts/pr-policy.ts` exempts the bot by
    // author and branch prefix. This asserts the branch prefix contract still holds.
    expect(raw).toContain('"semanticCommits": "enabled"');
  });
});

describe("docs/runbooks/branch-protection.md", () => {
  const runbook = read("docs/runbooks/branch-protection.md");

  it("is listed in the runbook index", () => {
    expect(read("docs/runbooks/README.md")).toContain("branch-protection");
  });

  it("records the probe verbatim, so the 403 is not re-discovered later", () => {
    expect(runbook).toContain(
      "Upgrade to GitHub Pro or make this repository public",
    );
    expect(runbook).toContain(
      "gh api repos/itsahmeds/flowers-overseas/branches/main/protection",
    );
  });

  it("gives the three options and names the rejected one", () => {
    expect(runbook).toContain("Upgrade the account to GitHub Pro");
    expect(runbook).toContain("Rejected — §13 Q1 decided private");
    expect(runbook).toContain("recorded deviation");
  });

  it("gives the apply and verify commands", () => {
    expect(runbook).toContain("pnpm branch-protection --print-commands");
    expect(runbook).toContain("pnpm branch-protection --verify");
  });

  it("states the lighthouse exclusion rule and when it lifts", () => {
    expect(runbook).toContain("continue-on-error: true");
    expect(runbook).toContain("spec 004");
  });

  it("states the one-approving-review deviation and the gate that replaces it", () => {
    expect(runbook).toContain("required_approving_review_count: 0");
    expect(runbook).toContain("`/review` verdict");
  });
});
