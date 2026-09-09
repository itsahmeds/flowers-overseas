/**
 * `src/config/categories.ts` (spec 004 §2 "Everything data-gated is config", §5.1, AC-14;
 * TASK-047).
 *
 * The category row is the part of the founder-approved header that looks most like navigation and
 * is least navigable in Phase 0: ten labels, no pages behind them. So the assertions are the ten
 * labels *verbatim from the canvas*, the mobile subset the smaller artboard draws, and the flag —
 * every entry unpublished, which is what makes `SiteHeader` render text instead of ten links to
 * non-200 URLs (AC-14), and what spec 008 flips without touching a template.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CATEGORY_NAV_LABEL_KEY,
  CategoryConfigSchema,
  CategoryRegistrySchema,
  categoryConfig,
  isCategoryId,
  isCategoryPublished,
  mobileCategories,
} from "../../src/config/categories.ts";

const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8"),
) as {
  nav: { category: Record<string, string>; categories: { label: string } };
};

const desktop = readFileSync(
  resolve(__dirname, "../../docs/design/homepage-v1/homepage-desktop.dc.html"),
  "utf8",
);
const mobile = readFileSync(
  resolve(__dirname, "../../docs/design/homepage-v1/homepage-mobile.dc.html"),
  "utf8",
);

/** The desktop artboard's category row, in order. */
const CANVAS_ROW = [
  "best-sellers",
  "birthday",
  "sympathy",
  "occasions",
  "bouquets",
  "roses",
  "plants",
  "add-ons",
  "same-day-delivery",
  "destinations",
] as const;

const valid = {
  id: "gift-sets",
  labelKey: "nav.category.giftSets",
  published: false,
  owningSpec: "008",
  showOnMobile: false,
};

describe("src/config/categories.ts", () => {
  it("carries the canvas's ten category row entries in order", () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual([...CANVAS_ROW]);
  });

  it("labels each entry with copy the desktop artboard prints verbatim", () => {
    for (const category of CATEGORIES) {
      const label =
        messages.nav.category[category.labelKey.split(".").pop() ?? ""];
      expect(typeof label, category.labelKey).toBe("string");
      expect(desktop, `${category.id} → ${label ?? ""}`).toContain(
        `>${label ?? ""}<`,
      );
    }
    expect(messages.nav.categories.label).toBe("Categories");
    expect(CATEGORY_NAV_LABEL_KEY).toBe("nav.categories.label");
    expect(desktop).toContain('aria-label="Categories"');
  });

  it("draws the mobile artboard's six-entry subset, with its shorter same-day label", () => {
    expect(mobileCategories.map((category) => category.id)).toEqual([
      "best-sellers",
      "occasions",
      "bouquets",
      "roses",
      "plants",
      "same-day-delivery",
    ]);
    const short = messages.nav.category.sameDayShort;
    expect(short).toBe("Same-day");
    expect(mobile).toContain(`>${short}<`);
    expect(categoryConfig("same-day-delivery").shortLabelKey).toBe(
      "nav.category.sameDayShort",
    );
  });

  it("publishes nothing in Phase 0 and names the spec that will (AC-14)", () => {
    for (const category of CATEGORIES) {
      expect(isCategoryPublished(category.id), category.id).toBe(false);
      expect(category.owningSpec, category.id).toMatch(/^0\d{2}$/);
    }
    expect(new Set(CATEGORIES.map((category) => category.owningSpec))).toEqual(
      new Set(["005", "007", "008", "009"]),
    );
  });

  it("accents exactly one entry, the canvas's `Same-day delivery`", () => {
    const accented = CATEGORIES.filter((category) => category.accent);
    expect(accented.map((category) => category.id)).toEqual([
      "same-day-delivery",
    ]);
    expect(desktop).toContain(
      'color: var(--color-accent);">Same-day delivery<',
    );
  });

  it("looks an entry up by id and rejects an unknown one", () => {
    expect(isCategoryId("roses")).toBe(true);
    expect(isCategoryId("orchids")).toBe(false);
    // @ts-expect-error — an unknown id is a type error as well as a runtime throw.
    expect(() => categoryConfig("orchids")).toThrow(/orchids/);
  });

  it("rejects a malformed row, a duplicate id and a second accent", () => {
    for (const [field, patch] of [
      ["id", { id: "Gift Sets" }],
      ["labelKey", { labelKey: "footer.link.giftSets" }],
      ["owningSpec", { owningSpec: "eight" }],
      ["showOnMobile", { showOnMobile: "yes" }],
    ] as const) {
      const result = CategoryConfigSchema.safeParse({ ...valid, ...patch });
      expect(result.success, JSON.stringify(patch)).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.map((issue) => issue.path.join(".")).join(" "),
          JSON.stringify(patch),
        ).toContain(field);
      }
    }
    expect(CategoryRegistrySchema.safeParse([valid, valid]).success).toBe(
      false,
    );
    const twoAccents = CategoryRegistrySchema.safeParse([
      { ...valid, accent: true },
      {
        ...valid,
        id: "hampers",
        labelKey: "nav.category.hampers",
        accent: true,
      },
    ]);
    expect(twoAccents.success).toBe(false);
    if (!twoAccents.success) {
      expect(
        twoAccents.error.issues.map((issue) => issue.message).join(" "),
      ).toMatch(/at most one category row entry/);
    }
  });

  it("defaults `accent` to false so a new row cannot silently take the colour", () => {
    const parsed = CategoryConfigSchema.parse(valid);
    expect(parsed.accent).toBe(false);
  });
});
