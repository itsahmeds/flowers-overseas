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

import {
  CONFIG_FILES,
  MODULES,
  REQUIRED_DIRS,
} from "../../scripts/check-layout.ts";
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

  it("lists exactly the modules of the check-layout manifest", () => {
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

  it("lists the config modules of the check-layout manifest (TASK-033)", () => {
    for (const file of CONFIG_FILES) {
      expect(doc, file).toContain(file.replace("src/config/", ""));
    }
  });

  it("records the deferred decisions with the spec that lifts each", () => {
    const deferred = doc.slice(doc.indexOf("## 4."));
    for (const [item, spec] of [
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

  /**
   * TASK-046 discharged the "CSP with nonces" row. The inverse assertion replaces it, the same way
   * TASK-034's `lang` row was replaced by the assertion of its absence: what is pinned now is that
   * the row is gone, that the decision it deferred is recorded as ADR-0016, and that the two facts
   * spec 001 left with it — the `vercel.live` allowance and `plan/01` §9's superseded "nonces"
   * sentence — are stated rather than dropped.
   */
  describe("§4 no longer defers the CSP (spec 004 AC-23)", () => {
    const deferred = doc.slice(doc.indexOf("## 4."));

    it("has no deferred row for the CSP", () => {
      const rows = deferred
        .split("\n")
        .filter((line) => line.startsWith("| **"));
      for (const row of rows) expect(row).not.toContain("CSP");
      expect(deferred).not.toContain("CSP with nonces** — no");
    });

    it("points at ADR-0016 and names the header that ships instead", () => {
      expect(deferred).toContain("ADR-0016");
      expect(deferred).toContain("Content-Security-Policy-Report-Only");
      expect(deferred).toContain("src/lib/csp.ts");
      expect(deferred).toContain("CSP_REPORT_ONLY=false");
    });

    it("keeps the vercel.live position and the superseded plan/01 §9 sentence on the record", () => {
      expect(deferred).toContain("vercel.live");
      expect(deferred).toMatch(/preview/);
      expect(deferred).toMatch(/superseded, not edited/);
      expect(deferred).toContain("'strict-dynamic'");
    });
  });

  /**
   * TASK-046: §2 must record the zod removal it performed, with the measured numbers — both
   * halves of it. `/review 26` found the first half reported as the whole, so the second (the
   * lazily fetched island chunk) is pinned here by name: a §2 that documents only the
   * `global-error` narrowing is the state the review rejected.
   */
  it("records the global-error import narrowing and the zod removal (§2)", () => {
    const section = doc.slice(
      doc.indexOf("## 2. Repository layout"),
      doc.indexOf("## 3. Modules"),
    );
    expect(section).toContain("@/modules/i18n/error-document");
    expect(section).toContain("src/config/locales.data.ts");
    // The browser-measured Brotli totals of `/` and of a locale document, in bytes.
    expect(section).toContain("116 393");
    expect(section).toContain("129 638");
    expect(section).toContain("next/dynamic");
    expect(section).toContain("i18n-hints-zod-free.test.ts");
  });

  /**
   * The inverse of the spec 001 assertion this replaces (TASK-034): spec 003 §2 required the
   * `lang` literal and its deferred-decision row to disappear together, and AC-32 (TASK-043)
   * re-checks that neither came back. The row is gone, so what is pinned now is its absence and
   * the document shape that replaced it (spec 003 §5.3's "recorded in `docs/architecture.md` §2").
   */
  it("no longer defers the locale literal, and records the chosen document shape (AC-6)", () => {
    expect(doc).not.toContain('lang="en"');
    expect(doc).toContain("src/app/(chooser)/layout.tsx");
    expect(doc).toContain("src/app/[locale]/layout.tsx");
    for (const group of ["(marketing)", "(shop)", "(checkout)", "(account)"]) {
      expect(doc, group).toContain(group);
    }
  });

  /**
   * `/review 15`: §2 must record the shape that *shipped*, not the one spec 003 §5.3 recommended
   * and the implementation rejected. The shipped shape is a pass-through `src/app/layout.tsx`
   * plus one document per leaf, the 404 among them, so all three are named here; the phrase "two
   * root layouts" is allowed only inside the paragraph that explains why that shape was rejected.
   */
  describe("§2 document shape", () => {
    const section = doc.slice(
      doc.indexOf("## 2. Repository layout"),
      doc.indexOf("## 3. Modules"),
    );

    it("names src/app/layout.tsx as the pass-through root that renders no document", () => {
      expect(section).toContain("src/app/layout.tsx");
      expect(section).toMatch(/pass-through root/i);
      expect(section).toMatch(/renders no document/i);
      expect(section).toContain("noindex,nofollow");
    });

    it("names all three documents, the 404 included", () => {
      for (const file of [
        "src/app/(chooser)/layout.tsx",
        "src/app/[locale]/layout.tsx",
        "src/app/not-found.tsx",
      ]) {
        expect(section, file).toContain(file);
      }
    });

    it("mentions the two-root-layout shape only as the rejected one", () => {
      const paragraphs = section
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.includes("two root layouts"));
      expect(paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of paragraphs) {
        expect(paragraph, paragraph.slice(0, 60)).toMatch(/rejected/i);
        expect(paragraph, paragraph.slice(0, 60)).toContain("Next 16.3.4");
      }
    });

    it("records the central dynamicParams = false gate on the [locale] layout", () => {
      // TASK-035 replaced TASK-034's per-page obligation with one export on the layout; the doc
      // must say where the gate lives, not merely that one is needed.
      expect(section).toContain("dynamicParams = false");
      expect(section).toMatch(/x-default/);
      expect(section).toMatch(/duplicate/i);
      expect(section).toMatch(/exported once/i);
      expect(section).toContain("src/app/[locale]/layout.tsx");
    });

    it("names the global 500 document and the every-document title rule (AC-25)", () => {
      expect(section).toContain("src/app/global-error.tsx");
      expect(section).toMatch(/non-empty localised `<title>`/);
    });
  });
});
