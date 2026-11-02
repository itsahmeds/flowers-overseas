/**
 * Spec 006's documents and records, asserted (T-29 for **AC-29**; the document half of **AC-28**;
 * TASK-081, the Phase-0 close).
 *
 * AC-28: the style guide, the imagery runbook and the seed-catalogue runbook exist, are indexed,
 * and the imagery runbook records the review-and-reject loop as executed, with the rejected
 * generations **counted**. AC-29: the RoPA carries the "no personal data" statement and the
 * conditional row for photography of identifiable people; each generator's commercial-use terms
 * are filed; `docs/architecture.md` lists the new directories, the `ui/media` ownership and the
 * committed-bytes row; `README.md` documents the four scripts.
 *
 * T-28 itself (following the runbook end to end) is manual; what is pinned here is that its
 * outcome is written down as numbers rather than as "not recorded".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const read = (path: string): string =>
  readFileSync(resolve(repoRoot, path), "utf8");

/** The section of a markdown file from one `## ` heading to the next. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const next = markdown.indexOf("\n## ", start + 3);
  return markdown.slice(start, next === -1 ? undefined : next);
}

describe("AC-28: the three documents exist and are indexed", () => {
  const index = read("docs/runbooks/README.md");

  it("indexes the imagery and the seed-catalogue runbooks", () => {
    expect(index).toContain("[imagery](imagery.md)");
    expect(index).toContain("[seed-catalogue](seed-catalogue.md)");
  });

  it("keeps the locked style guide with its review checklist", () => {
    const guide = read("content/imagery/style-guide.md");
    expect(guide).toContain("No hands, no faces, no text");
  });

  it("covers every procedure spec 006 §2.7 names in the seed-catalogue runbook", () => {
    const runbook = read("docs/runbooks/seed-catalogue.md");
    for (const heading of [
      "## 1. Edit a product",
      "## 2. Add a country's prices",
      "## 3. Run the gate",
      "## 4. Read the diff",
      "## 5. Re-seed a database safely",
      "## 6. What \"never touch `source = 'real'`\" means in practice",
    ]) {
      expect(runbook, heading).toContain(heading);
    }
    // The two rules a re-seed must never break, stated as the runbook states them.
    expect(runbook).toContain("**In production only `--insert-only` runs.**");
    expect(runbook).toContain(
      "**The seed never updates or inserts it, in any mode.**",
    );
  });
});

describe("AC-28: the review-and-reject loop is recorded with its counts", () => {
  const record = section(
    read("docs/runbooks/imagery.md"),
    "3. The review record",
  );

  /** The count cell of the record row whose outcome starts with `outcome`. */
  function count(outcome: string): string | undefined {
    const row = record
      .split("\n")
      .find((line) => line.startsWith(`| ${outcome}`));
    return row?.split("|")[2]?.trim();
  }

  it("counts the rejected generations: one, named, with the file it left", () => {
    expect(count("Rejected at review")).toBe("**1**");
    expect(record).toContain("`fo-fn-001-hero`");
    expect(record).toContain(
      "`.local/imagery/rejected/fo-fn-001-hero.easel.2026-09-18.png`",
    );
  });

  it("counts the rest of the run: 27 delivered, 5 regenerated, 31 accepted, 0 retouched", () => {
    expect(count("Delivered for review")).toBe("**27** of 31");
    expect(count("Regenerated")).toBe("**5**");
    expect(count("Accepted by the founder")).toBe("**31**");
    expect(count("Retouched")).toBe("**0**");
  });

  it("records the loop executed end to end for one product (T-28)", () => {
    expect(record).toContain(
      "**The loop as executed, end to end, for one product (spec 006 T-28).**",
    );
    for (const step of [
      "**rejected** (easel)",
      "regenerated from the same record",
      "variants derived by `pnpm media:variants`",
      "`pnpm media:variants --check` clean",
    ]) {
      expect(record, step).toContain(step);
    }
  });

  it("agrees with the data: 31 demo assets approved by the founder on 2026-09-18, 26 + 5", () => {
    const media = JSON.parse(read("seed/data/media.json")) as {
      rows: { reviewedBy?: string; reviewedAt?: string }[];
    };
    const demo = media.rows.filter((row) =>
      row.reviewedAt?.startsWith("2026-09-18"),
    );
    expect(demo).toHaveLength(31);
    expect(demo.every((row) => row.reviewedBy === "founder")).toBe(true);
    expect(
      demo.filter((row) => row.reviewedAt === "2026-09-18T07:45:00.000Z"),
    ).toHaveLength(5);
  });
});

describe("AC-29: the compliance records", () => {
  const ropa = read("docs/compliance/ropa.md");

  it("states that spec 006 adds no personal data", () => {
    expect(ropa).toContain(
      "**Spec 006 (seed catalogue and imagery): no personal data.**",
    );
    expect(ropa).toContain("adds **no processing row**");
  });

  it("carries the conditional row for photography of identifiable people", () => {
    const row = ropa.split("\n").find((line) => line.startsWith("| 8 |"));
    expect(row).toBeDefined();
    expect(row).toContain("identifiable person");
    expect(row).toContain("shopfront");
    expect(row).toContain("**Conditional, not active**");
    expect(row).toContain("model release");
    expect(row?.trimEnd().endsWith("| 006 |")).toBe(true);
  });

  it("files each generator's commercial-use terms in docs/compliance/", () => {
    for (const file of [
      "docs/compliance/imagery-generator-terms.md",
      "docs/compliance/imagery-generator-terms-grok.md",
    ]) {
      expect(read(file), file).toMatch(/\*\*Filed \d{4}-\d{2}-\d{2}\.\*\*/u);
    }
  });
});

describe("AC-29: architecture and README", () => {
  const architecture = read("docs/architecture.md");

  it("lists spec 006's directories in §2", () => {
    const layout = section(architecture, "2. Repository layout");
    for (const directory of [
      "\ncontent/imagery/ ",
      "\npublic/media/ ",
      "\n.local/ ",
      "\nseed/data/ ",
      "\nseed/schema/ ",
    ]) {
      expect(layout, directory.trim()).toContain(directory);
    }
    expect(layout).toContain("Owned by spec 006");
  });

  it("records the `ui/media` ownership in §3 and the committed-bytes row in §4", () => {
    const modules = section(architecture, "3. Modules");
    const ui = modules.split("\n").find((line) => line.startsWith("| `ui` |"));
    expect(ui).toContain("**`media/` is spec 006's**");
    const deferred = section(
      architecture,
      "4. Deferred decisions recorded here",
    );
    expect(deferred).toContain(
      "| **Derived image bytes are committed to the repository**, now for one slot only.",
    );
  });

  it("documents the four spec 006 scripts in README.md, each a real package script", () => {
    const readme = read("README.md");
    const scripts = (
      JSON.parse(read("package.json")) as { scripts: Record<string, string> }
    ).scripts;
    for (const script of [
      "seed:check",
      "seed:diff",
      "media:variants",
      "media:upload",
    ]) {
      expect(readme, script).toContain(`| \`pnpm ${script}\` |`);
      expect(scripts[script], script).toBeDefined();
    }
  });
});
