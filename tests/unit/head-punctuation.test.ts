/**
 * The one definition of "a dash in head copy" (spec 003 §14 A-founder-2026-10-15a clause 2;
 * TASK-242), read by `i18n:check` check 13, `seed:check` `copy/dash-in-head`, `corridor:check`
 * `dash-in-head` and the built-site scan. Each value is asserted to its exact verdict, so the line
 * between a dash and a joined hyphen is pinned on both sides (breaker r1 on PR 266, holes 1, 2;
 * review r1 nit 2).
 */
import { describe, expect, it } from "vitest";

import {
  HEAD_MESSAGE_KEYS,
  describeHeadDashes,
  headDashesIn,
  isHeadMessageKey,
} from "../../src/modules/i18n/head-punctuation.ts";

describe("headDashesIn refuses", () => {
  it.each([
    // The spec's three marks.
    ["Flowers Overseas \u2014 send flowers to Europe", "an em dash (U+2014)"],
    ["Amber Hour\u2014roses", "an em dash (U+2014)"],
    ["{entity} for {country} - one all-in price", "a spaced hyphen"],
    [
      "Nie znaleziono strony \u2013 Flowers Overseas",
      "a spaced en dash (U+2013)",
    ],
    [
      "a \u2014 b - c \u2013 d",
      "an em dash (U+2014), a spaced hyphen, a spaced en dash (U+2013)",
    ],
    // Every other dash character, wherever it stands (hole 1).
    ["Flowers Overseas \u2015 Send", "a horizontal bar (U+2015)"],
    ["Flowers Overseas\u2012Send", "a figure dash (U+2012)"],
    ["Flowers Overseas \u2212 Send", "a minus sign (U+2212)"],
    ["Flowers Overseas \u2e3a Send", "a two-em dash (U+2E3A)"],
    ["Flowers Overseas \u2e3b Send", "a three-em dash (U+2E3B)"],
    ["Flowers Overseas \ufe58 Send", "a small em dash (U+FE58)"],
    ["Flowers Overseas \ufe63 Send", "a small hyphen-minus (U+FE63)"],
    ["Flowers Overseas \uff0d Send", "a fullwidth hyphen-minus (U+FF0D)"],
    ["Flowers Overseas -- Send", "a double hyphen (--)"],
    ["Flowers Overseas--Send", "a double hyphen (--)"],
    ["Flowers Overseas \u2010 Send", "a spaced hyphen (U+2010)"],
    ["Flowers Overseas \u2011 Send", "a spaced non-breaking hyphen (U+2011)"],
    // Whitespace of any kind counts as a space (review nit 2): no-break, narrow no-break, tab.
    ["Flowers Overseas\u00a0-\u00a0Send", "a spaced hyphen"],
    ["Flowers Overseas\u202f\u2013\u202fSend", "a spaced en dash (U+2013)"],
    ["Flowers Overseas\t-\tSend", "a spaced hyphen"],
    // One-sided and edge dashes (hole 2).
    ["Flowers Overseas -Send", "a one-sided hyphen"],
    ["Flowers Overseas- Send", "a one-sided hyphen"],
    ["Box -und Topfgestecke", "a one-sided hyphen"],
    ["Flowers Overseas \u2013Send", "a one-sided en dash (U+2013)"],
    ["Flowers Overseas\u2013 Send", "a one-sided en dash (U+2013)"],
    ["Box \u2013und", "a one-sided en dash (U+2013)"],
    ["- Flowers Overseas", "a one-sided hyphen"],
    ["Flowers Overseas -", "a one-sided hyphen"],
    ["Send Flowers Abroad \u2013", "a one-sided en dash (U+2013)"],
    ["\u2013Send", "a one-sided en dash (U+2013)"],
    // The suspended-hyphen exception is for hyphens only, and only before a conjunction.
    ["Box\u2013 und Topfgestecke", "a one-sided en dash (U+2013)"],
    ["Box- Topfgestecke", "a one-sided hyphen"],
  ])("%j as %s", (value, marks) => {
    expect(describeHeadDashes(headDashesIn(value))).toBe(marks);
  });
});

describe("headDashesIn passes", () => {
  it.each([
    "Amber Hour: hand-tied, all-in",
    "Amber Hour: hand\u2010tied",
    "Opening hours 10\u201312",
    "Box- und Topfgestecke ohne Vase",
    "Box-, Topf- und Vasengestecke",
    "dwu- i trzypokojowe",
    "Ein- oder Ausgang",
    "{title} \u00b7 Page {page}",
    "Flowers Overseas | Send Flowers Abroad",
    "Page not found. Flowers Overseas",
    "",
  ])("%j", (value) => {
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

  it("covers the `BreadcrumbList` names: the trail labels, the home crumb, the country names (hole 7)", () => {
    for (const key of [
      "breadcrumb.destinations",
      "breadcrumb.shopRoot",
      "breadcrumb.occasions",
      "breadcrumb.entity",
      "common.homeLink",
      "destinations.pl.name",
    ]) {
      expect(isHeadMessageKey(key), key).toBe(true);
    }
    expect(isHeadMessageKey("destinations.pl.cities")).toBe(false);
    expect(HEAD_MESSAGE_KEYS).toContain("breadcrumb.*");
  });
});
