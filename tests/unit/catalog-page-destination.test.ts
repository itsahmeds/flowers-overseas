/**
 * `pageDestination()` (spec 043 §5.3 A "Country context", AC-1; TASK-288): which destination a
 * page is in the context of, from its URL alone. The `@header` slot reads it to build the mega
 * menu in that destination (`megaMenuModel(locale, iso2)`, TASK-383); the menu's in-context hrefs
 * and their fallbacks are `tests/unit/catalog-mega-menu.test.ts`'s (spec 043 AC-50, T-50), which
 * replaced the category row's `destinationShopLinks()` cases that used to live here.
 */
import { describe, expect, it } from "vitest";

import { pageDestination } from "../../src/modules/catalog/index.ts";

describe("pageDestination(): which pages are in a destination's context (§5.3 A)", () => {
  it.each([
    [["poland", "flowers"], "PL"],
    [["france", "flowers"], "FR"],
    [["poland", "flowers", "roses"], "PL"],
    [["poland", "flowers", "birthday-flowers"], "PL"],
    [["poland", "product", "amber-hour"], "PL"],
    [["send-flowers-to", "poland"], "PL"],
  ])("/en/%s is in %s's context", async (segments, iso2) => {
    expect(await pageDestination("en", segments)).toBe(iso2);
  });

  it.each([
    [[]],
    [["send-flowers-to"]],
    [["occasions"]],
    [["occasions", "birthday"]],
    [["flowers", "roses"]],
    [["no-such-page"]],
  ])("/en/%s is in no destination's context", async (segments) => {
    expect(await pageDestination("en", segments)).toBeUndefined();
  });
});
