/**
 * T-05 (spec 001 AC-4, TASK-003): Stylelint over the CSS fixtures via the Node API.
 *
 * Spec §5 names `declaration-property-disallowed-list`, which Stylelint (17.x) does not ship.
 * The equivalent pair is asserted instead: `property-disallowed-list` for physical properties and
 * `declaration-property-value-disallowed-list` for `text-align: left|right`.
 */
import { join, resolve } from "node:path";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import { DISALLOWED_PROPERTIES } from "../../stylelint.config.mjs";

const repoRoot = resolve(__dirname, "../..");
const configFile = join(repoRoot, "stylelint.config.mjs");
const fixture = (name: string): string =>
  join(repoRoot, "tests/fixtures/lint", name);

async function warningsFor(
  file: string,
): Promise<{ rule: string; text: string }[]> {
  const result = await stylelint.lint({
    files: file,
    configFile,
    cwd: repoRoot,
  });
  return result.results.flatMap((r) =>
    r.warnings.map((w) => ({ rule: w.rule, text: w.text })),
  );
}

describe("stylelint direction bans (T-05)", () => {
  it("reports a property violation for every physical declaration in physical.css", async () => {
    const warnings = await warningsFor(fixture("physical.css"));
    const properties = warnings
      .filter((w) => w.rule === "property-disallowed-list")
      .map((w) => w.text);

    expect(properties.some((t) => t.includes("margin-left"))).toBe(true);
    expect(properties.some((t) => t.includes("padding-right"))).toBe(true);
    expect(properties.some((t) => t.includes("border-left-width"))).toBe(true);
    expect(properties.some((t) => t.includes('"left"'))).toBe(true);
    expect(
      warnings.some(
        (w) =>
          w.rule === "declaration-property-value-disallowed-list" &&
          w.text.includes("text-align"),
      ),
    ).toBe(true);
  });

  it("passes on the logical counterpart", async () => {
    expect(await warningsFor(fixture("logical.css"))).toEqual([]);
  });

  it("passes on the Tailwind v4 entry stylesheet", async () => {
    expect(await warningsFor(join(repoRoot, "src/app/globals.css"))).toEqual(
      [],
    );
  });

  it("bans both margins, both paddings, both insets, borders and corner radii", () => {
    for (const property of [
      "margin-left",
      "margin-right",
      "padding-left",
      "padding-right",
      "left",
      "right",
      "border-top-left-radius",
      "border-bottom-right-radius",
      "scroll-margin-left",
    ]) {
      expect(DISALLOWED_PROPERTIES).toContain(property);
    }
    expect(DISALLOWED_PROPERTIES).toContain("/^border-left/");
    expect(DISALLOWED_PROPERTIES).toContain("/^border-right/");
  });
});
