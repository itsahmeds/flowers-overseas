/**
 * `src/config/occasions.ts` (spec 004 §2 "Everything data-gated is config", §13's 2026-09-08
 * resolution note "occasion tiles", design round 6's date strip; TASK-053).
 *
 * Four things are pinned here, because each of them is a way this file could put something untrue
 * or unreachable on the home page:
 *
 *  1. **the tile set** — the artboards' six, in their order, with the message keys the catalogue
 *     actually holds and slugs that are `plan/02` §4's shape in every launch locale;
 *  2. **the tie to spec 005's taxonomy** — every `catalogueKey` is a facet value that exists, so
 *     spec 008 cannot publish a tile whose shop page has nothing to list;
 *  3. **the cutoffs are the wall clock the artboards print** — an authored UTC instant is the one
 *     field here that a daylight-saving boundary can silently move, so each one is formatted in
 *     `Europe/Warsaw` and compared with "14:00";
 *  4. **the refusals** — a tile published while spec 008 has not built the page, a date with both
 *     a cutoff and a note or neither, a cutoff after the date it is a cutoff for, a mismatched
 *     message key, a duplicate slug inside one locale, dates out of calendar order.
 *
 * Plus the maintenance alarm: the dates carry a year, and the strip must never print one that has
 * already gone.
 */
import { describe, expect, it } from "vitest";

import { occasionKeys } from "../../src/config/catalogue/schemas.ts";
import { launchLocales } from "../../src/config/locales.ts";
import {
  OCCASION_DATES,
  OCCASION_TILES,
  OccasionDateRegistrySchema,
  OccasionDateSchema,
  OccasionTileRegistrySchema,
  OccasionTileSchema,
  isOccasionPagePublished,
  occasionDates,
  occasionSlug,
  occasionTile,
} from "../../src/config/occasions.ts";
import { formatTimeInZone } from "../../src/modules/i18n";

/** The six tiles the artboards draw, in their order. */
const CANVAS_TILES = [
  "birthday",
  "nameDay",
  "anniversary",
  "sympathy",
  "justBecause",
  "newBaby",
] as const;

/** The four dates the "Coming up in Poland" strip draws, in calendar order. */
const CANVAS_DATES = [
  "allSaints",
  "andrzejki",
  "wigilia",
  "womensDay",
] as const;

const validTile = {
  id: "getWell",
  catalogueKey: "get_well",
  nameKey: "occasions.getWell.name",
  subtitleKey: "occasions.getWell.subtitle",
  slugs: Object.fromEntries(launchLocales.map((code) => [code, "get-well"])),
  published: false,
  owningSpec: "008",
};

const validDate = {
  id: "mothersDay",
  countryIso2: "PL",
  nameKey: "occasions.date.mothersDay.name",
  date: "2027-05-26",
  orderBy: "2027-05-25T12:00:00Z",
  zone: "Europe/Warsaw",
};

describe("the occasion tiles", () => {
  it("holds the artboards' six tiles, in their order", () => {
    expect(OCCASION_TILES.map((tile) => tile.id)).toEqual([...CANVAS_TILES]);
  });

  it("publishes none of them, so no tile can render a link (AC-14)", () => {
    for (const tile of OCCASION_TILES) {
      expect(tile.published, tile.id).toBe(false);
      expect(isOccasionPagePublished(tile.id), tile.id).toBe(false);
      expect(tile.owningSpec, tile.id).toBe("008");
    }
  });

  it("names an occasion spec 005's taxonomy actually has", () => {
    for (const tile of OCCASION_TILES) {
      expect(occasionKeys as readonly string[], tile.id).toContain(
        tile.catalogueKey,
      );
    }
  });

  it("carries a slug for every launch locale, in `plan/02` §4's shape", () => {
    for (const tile of OCCASION_TILES) {
      for (const locale of launchLocales) {
        const slug = occasionSlug(tile.id, locale);
        expect(slug, `${tile.id}/${locale}`).toMatch(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        );
      }
    }
    // The Polish name-day slug is the reason this section exists commercially.
    expect(occasionSlug("nameDay", "pl")).toBe("imieniny");
    expect(occasionSlug("nameDay", "de")).toBe("namenstag");
  });

  it("throws on an unknown id and on a locale with no slug", () => {
    // @ts-expect-error — the id set is closed data, which is the point of the union.
    expect(() => occasionTile("wedding")).toThrow(/unknown occasion id/);
    expect(() => occasionSlug("birthday", "fr")).toThrow(/no slug/);
  });

  it("refuses a name key that does not belong to the tile", () => {
    const parsed = OccasionTileSchema.safeParse({
      ...validTile,
      nameKey: "occasions.birthday.name",
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(
      "occasions.getWell.name",
    );
  });

  it("refuses an occasion the taxonomy does not have", () => {
    expect(
      OccasionTileSchema.safeParse({ ...validTile, catalogueKey: "nameday" })
        .success,
    ).toBe(false);
  });

  it("refuses a duplicate slug inside one locale", () => {
    const clash = {
      ...validTile,
      id: "thankYou",
      catalogueKey: "thank_you",
      nameKey: "occasions.thankYou.name",
      subtitleKey: "occasions.thankYou.subtitle",
    };
    const parsed = OccasionTileRegistrySchema.safeParse([validTile, clash]);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("already used by");
  });

  it("refuses a duplicate id", () => {
    expect(
      OccasionTileRegistrySchema.safeParse([validTile, validTile]).success,
    ).toBe(false);
  });
});

describe("the dated occasions", () => {
  it("holds the artboards' four Polish dates, in calendar order", () => {
    expect(OCCASION_DATES.map((row) => row.id)).toEqual([...CANVAS_DATES]);
    expect(occasionDates("PL")).toHaveLength(4);
    expect(occasionDates("DE")).toEqual([]);
  });

  it("states every cutoff at 14:00 in the recipient's own zone", () => {
    for (const row of OCCASION_DATES) {
      if (row.orderBy === undefined) continue;
      expect(
        formatTimeInZone(new Date(row.orderBy), "en", row.zone, {
          zoneName: "shortGeneric",
        }),
        row.id,
      ).toMatch(/^14:00 /);
    }
  });

  it("gives the last date of the strip a year that is still ahead", () => {
    const last = OCCASION_DATES.at(-1);
    expect(
      new Date(`${last?.date ?? ""}T12:00:00Z`).getTime(),
      "the occasion-date strip prints a date that has passed — roll `src/config/occasions.ts` forward",
    ).toBeGreaterThan(Date.now());
  });

  it("carries exactly one of a cutoff and a note per row", () => {
    for (const row of OCCASION_DATES) {
      expect(
        (row.orderBy === undefined) !== (row.noteKey === undefined),
        row.id,
      ).toBe(true);
    }
    // Women's Day is the one the artboard gives a fact instead of a cutoff.
    expect(OCCASION_DATES.at(-1)?.noteKey).toBe(
      "occasions.date.womensDay.note",
    );
  });

  it("refuses a row with both a cutoff and a note, and one with neither", () => {
    for (const broken of [
      { ...validDate, noteKey: "occasions.date.mothersDay.note" },
      { ...validDate, orderBy: undefined },
    ]) {
      const parsed = OccasionDateSchema.safeParse(broken);
      expect(parsed.success).toBe(false);
      expect(JSON.stringify(parsed.error?.issues)).toContain("exactly one");
    }
  });

  it("refuses a cutoff that is not before the date it is a cutoff for", () => {
    const parsed = OccasionDateSchema.safeParse({
      ...validDate,
      orderBy: "2027-05-27T12:00:00Z",
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("not before");
  });

  it("refuses dates authored out of calendar order", () => {
    const later = {
      ...validDate,
      id: "fathersDay",
      nameKey: "occasions.date.fathersDay.name",
      date: "2027-06-23",
      orderBy: "2027-06-22T12:00:00Z",
    };
    expect(
      OccasionDateRegistrySchema.safeParse([later, validDate]).success,
    ).toBe(false);
    expect(
      OccasionDateRegistrySchema.safeParse([validDate, later]).success,
    ).toBe(true);
  });
});
