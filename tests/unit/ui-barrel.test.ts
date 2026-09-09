/**
 * The `ui` module's public surface (spec 004 §2 "Where the design system lives", §13 Q9;
 * TASK-045), in the shape `tests/unit/i18n-barrel.test.ts` established for spec 003.
 *
 * Two things are pinned. First, that the barrel exports **components, pure functions and the
 * contrast manifest — and no token values**: a TypeScript copy of the palette would drift from
 * `globals.css` the first time someone edited one of them, and `fo/no-raw-color` would have to
 * grant it an exception. Second, that the module is registered where the boundary system can see
 * it: `MODULES` in `scripts/check-layout.ts`, whose zones `eslint/modules.js` generates.
 */
import { describe, expect, it } from "vitest";

import { MODULES } from "../../scripts/check-layout.ts";
import * as ui from "../../src/modules/ui/index.ts";

describe("src/modules/ui barrel", () => {
  it("is registered in the module manifest, so the boundary lint covers it", () => {
    expect(MODULES).toContain("ui");
  });

  it("exports exactly the documented surface", () => {
    expect(Object.keys(ui).sort()).toEqual(
      [
        // fonts
        "bodyFont",
        "displayFont",
        "fontVariables",
        // icons
        "ICON_NAMES",
        "Icon",
        "MIRRORED_IN_RTL",
        "Mark",
        // layout primitives
        "CONTAINER_WIDTHS",
        "Cluster",
        "Container",
        "GAPS",
        "Grid",
        "Row",
        "Stack",
        // accessibility primitives
        "SkipLink",
        "VisuallyHidden",
        // type primitives
        "DISPLAY_SIZES",
        "Display",
        "Label",
        "TEXT_SIZES",
        "TEXT_TONES",
        "Text",
        // controls and content
        "BUTTON_SIZES",
        "BUTTON_STATES",
        "BUTTON_VARIANTS",
        "Button",
        "CHIP_TONES",
        "Chip",
        "PHOTO_RATIOS",
        "Photo",
        "Placeholder",
        // contrast manifest
        "CONTRAST_PAIRS",
        "CONTRAST_THRESHOLDS",
        "colorTokenNames",
        "contrastRatio",
        "evaluateContrastPairs",
        "formatContrastTable",
        "parseOklch",
        "parseThemeTokens",
        "relativeLuminance",
        "resolveColorToken",
      ].sort(),
    );
  });

  /**
   * Spec §3's non-goals, as an assertion (`/review 27` required change 2).
   *
   * "No input, select, textarea or form component ships here beyond the consent controls; the
   * design system's form layer is written against the checkout's real fields rather than guessed"
   * (§3, §13 Q10) and "no price is rendered in this spec" (§8). A `Field` and a `Price` were
   * written and removed; this is what stops them, or a differently-named equivalent, coming back
   * before the task that owns the real fields (010/013) and the real money (005/008/009).
   */
  it("exports no form control and no price block (spec §3, §8)", () => {
    const exported = Object.keys(ui);
    for (const banned of [
      "Field",
      "FIELD_STATES",
      "Form",
      "Input",
      "Select",
      "Textarea",
      "Checkbox",
      "Radio",
      "Price",
      "PRICE_SIZES",
      "Money",
    ]) {
      expect(exported, banned).not.toContain(banned);
    }
  });

  it("exports no colour, size or duration value (the tokens stay in globals.css)", () => {
    for (const [name, value] of Object.entries(ui)) {
      if (typeof value !== "string") continue;
      expect(value, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(value, name).not.toMatch(/(?<![a-z])(?:rgba?|hsla?|oklch)\s*\(/);
      // `fontVariables` is the one exported string, and it names variables rather than values.
      expect(name).toBe("fontVariables");
    }
  });

  it("exports every component as a function, so none carries state or config", () => {
    for (const name of [
      "Button",
      "Chip",
      "Cluster",
      "Container",
      "Display",
      "Grid",
      "Icon",
      "Label",
      "Mark",
      "Photo",
      "Placeholder",
      "Row",
      "SkipLink",
      "Stack",
      "Text",
      "VisuallyHidden",
    ]) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe(
        "function",
      );
    }
  });
});
