/**
 * The one definition of "a dash in head copy" (spec 003 §14 A-founder-2026-10-15a clause 2;
 * TASK-242), read by `i18n:check` check 13, `seed:check` `copy/dash-in-head`, `corridor:check`
 * `dash-in-head` and the built-site scan. Each value is asserted to its exact verdict.
 */
import { describe, expect, it } from "vitest";

import {
  describeHeadDashes,
  headDashesIn,
  isHeadMessageKey,
} from "../../src/modules/i18n/head-punctuation.ts";

describe("headDashesIn", () => {
  it.each([
    ["Flowers Overseas — send flowers to Europe", "an em dash (U+2014)"],
    ["Amber Hour—roses", "an em dash (U+2014)"],
    ["{entity} for {country} - one all-in price", "a spaced hyphen"],
    ["Nie znaleziono strony – Flowers Overseas", "a spaced en dash (U+2013)"],
    [
      "a — b - c – d",
      "an em dash (U+2014), a spaced hyphen, a spaced en dash (U+2013)",
    ],
  ])("refuses %j as %s", (value, marks) => {
    expect(describeHeadDashes(headDashesIn(value))).toBe(marks);
  });

  it.each([
    "Amber Hour: hand-tied, all-in",
    "Opening hours 10–12",
    "Box- und Topfgestecke ohne Vase",
    "{title} · Page {page}",
    "Flowers Overseas | Send Flowers Abroad",
    "Page not found. Flowers Overseas",
  ])("passes %j", (value) => {
    expect(headDashesIn(value)).toEqual([]);
  });
});

describe("isHeadMessageKey", () => {
  it("reads `*` as exactly one key segment", () => {
    expect(isHeadMessageKey("meta.home.title")).toBe(true);
    expect(isHeadMessageKey("meta.home.heading")).toBe(false);
    expect(isHeadMessageKey("meta.title")).toBe(false);
    expect(isHeadMessageKey("shop.root.seoTitle")).toBe(true);
    expect(isHeadMessageKey("shop.root.demoNotice")).toBe(false);
    expect(isHeadMessageKey("meta.home.title", [])).toBe(false);
  });
});
