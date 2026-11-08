/**
 * T-30 / AC-28 and T-41's runbook line / AC-40 (spec 041; TASK-184): the info and legal pages'
 * runbook exists, is indexed, and its trader-identity flip checklist carries what the spec names:
 * the page-level axe run on the three gated pages in `en` plus `/de/impressum`, the imprint's
 * visual baseline, and the five ⚖️ items of §14 A-founder-2026-10-23 clause 7. The README lists
 * `pages:check` and `pages:index`. `codebase:map --check` is its own CI step (`pnpm gates:cheap`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string): string =>
  readFileSync(resolve(ROOT, path), "utf8");

const RUNBOOK = "docs/runbooks/info-and-legal-pages.md";
const runbook = read(RUNBOOK);

/** The checklist: section 6 up to the next `## ` heading. */
function checklist(): string {
  const start = runbook.indexOf("## 6. The trader-identity flip checklist");
  expect(start, "the runbook has its flip checklist").toBeGreaterThan(-1);
  const end = runbook.indexOf("\n## ", start + 1);
  return runbook.slice(start, end === -1 ? undefined : end);
}

describe("T-30 / AC-28: the info and legal pages runbook", () => {
  it("exists and is linked from the runbook index", () => {
    expect(read("docs/runbooks/README.md")).toContain(
      "(info-and-legal-pages.md)",
    );
  });

  it("covers edit, approve, version, publish a lawyer-reviewed version, and the flip", () => {
    for (const heading of [
      "## 1. Edit a page",
      "## 2. Approve a page",
      "## 3. Version a legal document",
      "## 4. Publish a lawyer-reviewed version",
      "## 6. The trader-identity flip checklist",
      "## 7. The go-live copy batch",
    ]) {
      expect(runbook, heading).toContain(heading);
    }
  });

  it("the flip checklist names the page-level axe run on the gated pages in en plus /de/impressum", () => {
    const steps = checklist();
    expect(steps).toContain("page-level axe run");
    for (const url of [
      "/en/imprint",
      "/en/legal/terms",
      "/en/legal/privacy",
      "/de/impressum",
    ]) {
      expect(steps, url).toContain(url);
    }
  });

  it("the flip checklist names the imprint's visual baseline", () => {
    expect(checklist()).toContain("imprint's visual baseline");
  });

  it("the README lists pages:check and pages:index", () => {
    const readme = read("README.md");
    expect(readme).toContain("`pnpm pages:check`");
    expect(readme).toContain("`pnpm pages:index`");
  });
});

describe("T-41's runbook line / AC-40: the five legal risks are on the checklist", () => {
  it("lists clause 7's five ⚖️ items, (a) to (e)", () => {
    const steps = checklist();
    for (const item of [
      "⚖️ **(a) The German imprint without a named person.**",
      "⚖️ **(b) The Art. 27 GDPR representatives**",
      "⚖️ **(c) The registered agent's address as our address.**",
      "⚖️ **(d) The DPAs in the controller's name.**",
      "⚖️ **(e) The transfers wording**",
    ]) {
      expect(steps, item).toContain(item);
    }
    expect(steps.match(/⚖️ \*\*\(/gu)).toHaveLength(5);
  });
});
