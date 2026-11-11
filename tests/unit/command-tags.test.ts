/**
 * T-09 (spec 012b AC-9; TASK-296): every admin command's tag set equals its row of §5.4, and
 * `applyCommand()` calls `invalidate()` once with exactly it, or not at all.
 *
 * One table. TASK-297 to TASK-300 add a row per command they build (product, copy, size, price,
 * photo, review, go-live), each naming the §5.4 row it is, and assert the command returns
 * `commandTags()` of that row.
 */
import { describe, expect, it, vi } from "vitest";

import {
  type AdminCommand,
  applyCommand,
  commandOutcome,
  commandTags,
  unionTags,
} from "../../src/lib/command-tags.ts";

/** §5.4, row by row, with the tags written out as the spec spells them. */
const TABLE: readonly {
  readonly row: string;
  readonly command: AdminCommand;
  readonly tags: readonly string[];
}[] = [
  {
    row: "price change",
    command: { kind: "price", sku: "FO-BQ-001", iso2: "PL" },
    tags: ["catalog:PL", "product:FO-BQ-001"],
  },
  {
    row: "copy change of an existing product, priced in two countries",
    command: { kind: "copy", sku: "FO-BQ-001", pricedIn: ["PL", "DE"] },
    tags: ["catalog:DE", "catalog:PL", "product:FO-BQ-001", "sitemap"],
  },
  {
    row: "size change",
    command: { kind: "size", sku: "FO-BQ-002", pricedIn: ["PL"] },
    tags: ["catalog:PL", "product:FO-BQ-002", "sitemap"],
  },
  {
    row: "photo change",
    command: { kind: "photo", sku: "FO-BQ-003", pricedIn: ["NL"] },
    tags: ["catalog:NL", "product:FO-BQ-003", "sitemap"],
  },
  {
    row: "review decision on product copy or a photo (as a copy change)",
    command: { kind: "review", sku: "FO-BQ-004", pricedIn: ["PL"] },
    tags: ["catalog:PL", "product:FO-BQ-004", "sitemap"],
  },
  {
    row: "go-live fiscal fields (country facts)",
    command: { kind: "countryFacts", iso2: "PL" },
    tags: ["catalog:PL", "corridor:PL", "country:PL"],
  },
  {
    row: "country status flip",
    command: { kind: "countryStatus", iso2: "PL" },
    tags: [
      "catalog:PL",
      "corridor:PL",
      "country:PL",
      "home:de",
      "home:en",
      "home:en-gb",
      "home:pl",
      "hub:de",
      "hub:en",
      "hub:en-gb",
      "hub:pl",
      "sitemap",
    ],
  },
  {
    row: "new product, removal from a country, retirement",
    command: { kind: "structural" },
    tags: [],
  },
  {
    row: "publish verified",
    command: { kind: "publishVerified" },
    tags: ["sitemap"],
  },
  {
    row: "florist status, mapping or coverage change",
    command: {
      kind: "saleability",
      changed: [
        { sku: "FO-BQ-001", iso2: "PL" },
        { sku: "FO-BQ-009", iso2: "PL" },
      ],
    },
    tags: ["catalog:PL", "product:FO-BQ-001", "product:FO-BQ-009"],
  },
];

describe("T-09: the §5.4 table", () => {
  it.each(TABLE)("$row", ({ command, tags }) => {
    expect(commandTags(command)).toEqual(tags);
  });

  it.each(TABLE)(
    "$row: invalidate() once with exactly the tags, or never",
    async ({ command, tags }) => {
      const invalidate = vi.fn(() => Promise.resolve());
      const result = await applyCommand(
        commandOutcome("saved", command),
        invalidate,
      );
      expect(result).toBe("saved");
      if (tags.length === 0) {
        expect(invalidate).not.toHaveBeenCalled();
      } else {
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(invalidate).toHaveBeenCalledWith(tags);
      }
    },
  );

  it("a union (a deployment's boot, a bulk apply) is the de-duplicated union", () => {
    expect(
      unionTags([
        { kind: "price", sku: "FO-BQ-001", iso2: "PL" },
        { kind: "copy", sku: "FO-BQ-001", pricedIn: ["PL"] },
      ]),
    ).toEqual(["catalog:PL", "product:FO-BQ-001", "sitemap"]);
  });

  it("refuses a command that is not a row of the table", () => {
    expect(() =>
      commandTags({
        kind: "price",
        sku: "not-a-sku",
        iso2: "PL",
      } as AdminCommand),
    ).toThrow();
  });
});
