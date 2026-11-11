/**
 * Spec 021's records (TASK-495): T-37 (AC-37) reads the Radar rule block of
 * `docs/runbooks/fraud-review.md` and fails on a metadata key outside spec 013's intent metadata,
 * on a `Block` rule naming `:card_country:`, `:ip_country:` or a country list, and on an EEA code
 * in `@fo_review_card_countries`; each mutation turns it red. T-34 (AC-34): the runbook, the LIA,
 * the RoPA rows, `.env.example` and the spec 041 privacy-page requirement exist and name what
 * AC-34 lists.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EEA_COUNTRIES } from "@/config/risk";
import { INTENT_METADATA_KEYS } from "@/modules/payments/stripe/params";

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (file: string): string =>
  readFileSync(join(repoRoot, file), "utf8");

const RUNBOOK = "docs/runbooks/fraud-review.md";

function between(text: string, name: string): string {
  const start = text.indexOf(`<!-- ${name}:start -->`);
  const end = text.indexOf(`<!-- ${name}:end -->`);
  if (start < 0 || end < start) throw new Error(`no ${name} block`);
  return text.slice(start + `<!-- ${name}:start -->`.length, end);
}

interface RadarRule {
  readonly id: string;
  readonly rule: string;
}

/** The rules of the block: one table row each, the rule in backticks. */
export function radarRules(runbook: string): RadarRule[] {
  return between(runbook, "radar-rules")
    .split("\n")
    .flatMap((line) => {
      const match = /^\|\s*(R\d+[a-z]?)\s*\|\s*`([^`]+)`/u.exec(line);
      return match === null
        ? []
        : [{ id: match[1] ?? "", rule: match[2] ?? "" }];
    });
}

/** Every problem AC-37 names, as text; empty when the runbook is lawful. */
export function radarRuleProblems(runbook: string): string[] {
  const problems: string[] = [];
  const allowed = new Set<string>(INTENT_METADATA_KEYS);
  for (const { id, rule } of radarRules(runbook)) {
    for (const match of rule.matchAll(/::([a-z_]+)::/gu)) {
      const key = match[1] ?? "";
      if (!allowed.has(key)) problems.push(`${id}: metadata key ${key}`);
    }
    if (/^Block\b/u.test(rule)) {
      if (/:card_country:|:ip_country:/u.test(rule)) {
        problems.push(`${id}: Block on a country attribute`);
      }
      if (/\bin\s*(\(|@)/u.test(rule) || /'[A-Z]{2}'/u.test(rule)) {
        problems.push(`${id}: Block on a country list`);
      }
    }
  }
  const eea = new Set<string>(EEA_COUNTRIES);
  for (const line of between(runbook, "fo_review_card_countries").split("\n")) {
    const code = line.trim().replace(/^[-*]\s*/u, "");
    if (code === "") continue;
    if (!/^[A-Z]{2}$/u.test(code)) problems.push(`list: not a code ${code}`);
    else if (eea.has(code)) problems.push(`list: EEA country ${code}`);
  }
  return problems;
}

describe("T-37: the Radar rules of the runbook (AC-37)", () => {
  const runbook = read(RUNBOOK);

  it("holds R1 to R10 as spec 021 §2 A writes them, and no problem", () => {
    expect(radarRules(runbook).map((rule) => rule.id)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
      "R9",
      "R10a",
      "R10b",
    ]);
    expect(radarRules(runbook)[0]?.rule).toBe(
      "Block if :declined_charges_per_ip_address_hourly: >= 5",
    );
    expect(radarRuleProblems(runbook)).toEqual([]);
  });

  it("goes red on a Block rule on card country, on an unknown metadata key and on DE in the review list", () => {
    const withRule = (row: string): string =>
      runbook.replace(
        "<!-- radar-rules:end -->",
        `${row}\n<!-- radar-rules:end -->`,
      );
    expect(
      radarRuleProblems(
        withRule("| R11 | `Block if :card_country: = 'PL'` | x |"),
      ),
    ).toEqual([
      "R11: Block on a country attribute",
      "R11: Block on a country list",
    ]);
    expect(
      radarRuleProblems(
        withRule("| R12 | `Review if ::buyer_email:: = 'x'` | x |"),
      ),
    ).toEqual(["R12: metadata key buyer_email"]);
    expect(
      radarRuleProblems(
        withRule("| R13 | `Block if :ip_country: in @some_list` | x |"),
      ),
    ).toEqual([
      "R13: Block on a country attribute",
      "R13: Block on a country list",
    ]);
    expect(
      radarRuleProblems(
        runbook.replace(
          "<!-- fo_review_card_countries:end -->",
          "DE\n<!-- fo_review_card_countries:end -->",
        ),
      ),
    ).toEqual(["list: EEA country DE"]);
    expect(
      radarRuleProblems(
        runbook.replace(
          "<!-- fo_review_card_countries:end -->",
          "NG\n<!-- fo_review_card_countries:end -->",
        ),
      ),
    ).toEqual([]);
  });
});

describe("T-34: the records exist and name AC-34's items (AC-34)", () => {
  it("the runbook: the rules, the queue, deadlines and defaults, EFW, the evidence upload, lifting a block, key rotation", () => {
    const runbook = read(RUNBOOK);
    for (const heading of [
      "## Radar rules (entered by the founder, verbatim)",
      "## The review queue (`/admin/risk`)",
      "## Early fraud warnings (EFW)",
      "### Uploading the evidence pack (by hand, §13 Q8)",
      "## Lifting a blocklist entry on a buyer's request",
      "## Key rotation",
    ]) {
      expect(runbook, heading).toContain(heading);
    }
    expect(runbook).toContain("**Default at the deadline**");
  });

  it("the LIA: purpose, necessity, balancing, the DPIA screening and the spec 041 requirement", () => {
    const lia = read("docs/compliance/lia-fraud-prevention.md");
    for (const heading of [
      "## 1. Purpose test",
      "## 2. Necessity test",
      "## 3. Balancing test",
      "## 4. DPIA screening",
      "## 5. Requirement on spec 041 (privacy page)",
    ]) {
      expect(lia, heading).toContain(heading);
    }
    expect(lia).toContain("Art. 13(2)(f)");
  });

  it("the RoPA rows of §8 and .env.example's RISK_HASH_KEY", () => {
    const ropa = read("docs/compliance/ropa.md");
    expect(ropa).toMatch(
      /^\| 23 \| \*\*Fraud prevention: pre-checks, scoring and review\*\*/mu,
    );
    expect(ropa).toMatch(/^\| 24 \| \*\*Chargeback evidence\*\*/mu);
    expect(ropa).toContain("radar.early_fraud_warning.created");
    expect(read(".env.example")).toMatch(/^RISK_HASH_KEY=/mu);
  });

  it("the spec 041 privacy-page requirement is recorded in the brief", () => {
    expect(read("docs/tasks/TASK-495.md")).toContain(
      "Requirement on spec 041 (privacy page)",
    );
  });
});
