/**
 * The confirmation's add-on list and step 3's phone line (spec 010 §2 "Confirmation", AC-29,
 * AC-68; TASK-206; the confirmation and step 3 boards).
 *
 * The free printed card is part of every bouquet, so it is never listed as an add-on the buyer
 * chose; every other chosen add-on is, by name, in the catalogue's order. Step 3 prints the
 * recipient's phone in its international form (`+48 500 000 000`).
 */
import { describe, expect, it } from "vitest";

import { chosenAddonNameKeys } from "../../src/modules/checkout/confirmation.ts";
import { internationalPhone } from "../../src/modules/checkout/index.ts";

describe("chosenAddonNameKeys", () => {
  it("lists a chosen add-on by its name key", () => {
    expect(chosenAddonNameKeys(new Set(["vase"]))).toEqual([
      "catalog.addon.vase.name",
    ]);
  });

  it("never lists the free printed card, alone or beside a chosen add-on", () => {
    expect(chosenAddonNameKeys(new Set(["card"]))).toEqual([]);
    expect(chosenAddonNameKeys(new Set(["card", "balloon"]))).toEqual([
      "catalog.addon.balloon.name",
    ]);
  });

  it("follows the catalogue's order, not the order the keys arrive in", () => {
    expect(
      chosenAddonNameKeys(new Set(["balloon", "chocolates", "vase"])),
    ).toEqual([
      "catalog.addon.chocolates.name",
      "catalog.addon.vase.name",
      "catalog.addon.balloon.name",
    ]);
  });

  it("lists nothing for an order with no add-on, or a key the catalogue does not know", () => {
    expect(chosenAddonNameKeys(new Set())).toEqual([]);
    expect(chosenAddonNameKeys(new Set(["unknown"]))).toEqual([]);
  });
});

describe("internationalPhone", () => {
  it("prints a stored E.164 number in its international form", () => {
    expect(internationalPhone("+48500000000")).toBe("+48 500 000 000");
    expect(internationalPhone("+4930123456")).toBe("+49 30 123456");
  });

  it("returns the text unchanged when the library cannot read it", () => {
    expect(internationalPhone("+0")).toBe("+0");
  });
});
