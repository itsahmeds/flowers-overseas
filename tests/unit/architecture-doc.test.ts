/**
 * AC-3 (the "and `docs/architecture.md` lists the same set" half) and AC-30 (TASK-012).
 *
 * `docs/architecture.md` is the one document an implementer or a reviewer reads before touching a
 * module, and `plan/12` §9 makes it a deliverable that "any spec adding a module updates". A doc
 * that says eleven modules while the tree has twelve is worse than no doc, so the module table is
 * checked against the *same* manifest `pnpm check-layout` enforces (`scripts/check-layout.ts`)
 * and against the owning-spec comment in each module's public barrel. Drift in either
 * direction fails here.
 *
 * The Mermaid block and the deferred-decision list are asserted too: they are the AC-30 clauses
 * and the place §7/§8 of spec 001 send the 003/004 implementers looking for their removal items.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MODULES, REQUIRED_DIRS } from "../../scripts/check-layout.ts";
import { parseTables } from "../../scripts/tasks-open-decisions.ts";

const repoRoot = resolve(__dirname, "../..");
const doc = readFileSync(resolve(repoRoot, "docs/architecture.md"), "utf8");

/** The one table whose first column is the module name. */
const moduleTable = parseTables(doc).find(
  (table) => table.header[0] === "Module",
);
const moduleRows = moduleTable?.rows ?? [];

/** The owning-spec sentence from a module's public barrel; the doc repeats it verbatim. */
function ownedBy(module: string): string {
  const barrel = readFileSync(
    resolve(repoRoot, `src/modules/${module}/index.ts`),
    "utf8",
  );
  const match = /Owned by: ([^*]+?)\./.exec(barrel);
  if (match?.[1] === undefined) {
    throw new Error(
      `src/modules/${module}/index.ts has no "Owned by:" comment`,
    );
  }
  return match[1];
}

describe("docs/architecture.md (AC-30)", () => {
  it("contains a mermaid diagram", () => {
    expect(doc).toMatch(/```mermaid\n[\s\S]+?```/);
  });

  it("diagrams the plan/01 §1 system overview: buyer, app, and every dependency", () => {
    const mermaid = /```mermaid\n([\s\S]+?)```/.exec(doc)?.[1] ?? "";
    for (const node of [
      "Buyer",
      "Googlebot",
      "Vercel",
      "Supabase",
      "Stripe",
      "Mollie",
      "Resend",
      "pg-boss",
      "Sentry",
      "florist",
    ]) {
      expect(mermaid.toLowerCase(), node).toContain(node.toLowerCase());
    }
  });

  it("has a module table with the four documented columns", () => {
    expect(moduleTable?.header).toEqual([
      "Module",
      "Responsibility (`plan/01` §5)",
      "Owned by spec",
      "Status",
    ]);
    expect(moduleTable?.malformed).toEqual([]);
  });

  it("lists exactly the eleven modules of the check-layout manifest", () => {
    expect(moduleRows).toHaveLength(MODULES.length);
    expect(moduleRows.map((cells) => cells[0])).toEqual(
      MODULES.map((module) => `\`${module}\``),
    );
  });

  it("repeats each barrel's owning spec, so the two cannot drift", () => {
    for (const [index, module] of MODULES.entries()) {
      expect(moduleRows[index]?.[2], module).toBe(ownedBy(module));
    }
  });

  it("gives every module a responsibility and a status", () => {
    for (const cells of moduleRows) {
      expect(cells[1], cells[0]).not.toBe("");
      expect(cells[3], cells[0]).not.toBe("");
    }
  });

  it("states the rule that a spec adding a module updates the table and the manifest", () => {
    expect(doc).toContain("scripts/check-layout.ts");
    expect(doc.toLowerCase()).toContain("adds a module");
  });

  it("lists the same tree as the check-layout manifest (AC-3)", () => {
    for (const dir of REQUIRED_DIRS) expect(doc, dir).toContain(dir);
  });

  it("records the deferred decisions with the spec that lifts each", () => {
    const deferred = doc.slice(doc.indexOf("## 4."));
    for (const [item, spec] of [
      ["CSP", "spec 004"],
      ['`<html lang="en">`', "spec 003"],
      ["`proxy.ts`", "spec 003"],
      ["ALLOW_PLACEHOLDER_ENV", "spec 002"],
      ["deploymentEnvironment()", "ADR-0012"],
    ] as const) {
      const line = deferred
        .split("\n")
        .find((candidate) => candidate.includes(item));
      expect(line, item).toBeDefined();
      expect(line, item).toContain(spec);
    }
  });

  it('names the `<html lang="en">` literal as a spec 003 removal item (AC-30)', () => {
    expect(doc).toContain('<html lang="en">');
    expect(doc).toMatch(/lang="en"[\s\S]{0,400}spec 003/);
  });
});
