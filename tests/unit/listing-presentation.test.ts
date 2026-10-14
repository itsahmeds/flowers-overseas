/**
 * The listing presentation registry (spec 004 §14 A23 **R1**, **R2**, AC-33, T-35; spec 008 §14
 * A15 (b); TASK-187): `src/config/catalogue/listing-presentation.ts`.
 *
 * The schema half: an out-of-set register, an out-of-set noun, a missing row, a duplicate row and
 * a `leadSku` outside its hub's product set each fail the parse, **naming the key**. The render
 * half: the register the page draws is the registry's, carried on `listingView()`, so flipping a
 * row changes the band with no component change (`listingView()` is mocked nowhere; the registry
 * module is, and only for that case).
 */
import { describe, expect, it, vi } from "vitest";

import { CATEGORIES } from "../../src/config/catalogue/categories.data";
import {
  LISTING_PRESENTATION,
  LISTING_REGISTERS,
  ListingPresentationRegistrySchema,
  categoryPresentation,
  occasionPresentation,
} from "../../src/config/catalogue/listing-presentation";
import { OCCASIONS } from "../../src/config/catalogue/occasions.data";

/** The committed rows, as plain data a case can edit one field of. */
const rows = () => ({
  categories: LISTING_PRESENTATION.categories.map((row) => ({ ...row })),
  occasions: LISTING_PRESENTATION.occasions.map((row) => ({ ...row })),
});

/** The parse failure's messages, joined, so a case can assert the key is named. */
function failure(input: unknown): string {
  const result = ListingPresentationRegistrySchema.safeParse(input);
  if (result.success) return "";
  return result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

describe("the registry's rows (AC-33)", () => {
  it("parses the committed rows: one per category and one per occasion of the dataset", () => {
    expect(failure(rows())).toBe("");
    expect(
      LISTING_PRESENTATION.categories.map((row) => row.key).sort(),
    ).toStrictEqual(CATEGORIES.map((row) => row.key).sort());
    expect(
      LISTING_PRESENTATION.occasions.map((row) => row.key).sort(),
    ).toStrictEqual(OCCASIONS.map((row) => row.key).sort());
  });

  it("holds R1's defaults and the six leads the artboards fix", () => {
    expect(LISTING_REGISTERS).toStrictEqual([
      "warm",
      "quiet",
      "dated",
      "cream",
      "leaf",
      "sky",
      "ink",
    ]);
    for (const occasion of OCCASIONS) {
      const expected =
        occasion.kind === "seasonal"
          ? "dated"
          : occasion.key === "sympathy"
            ? "quiet"
            : "warm";
      expect(occasionPresentation(occasion.key).register, occasion.key).toBe(
        expected,
      );
    }
    expect(categoryPresentation("roses").register).toBe("ink");
    expect(categoryPresentation("bouquet").register).toBe("cream");
    expect(categoryPresentation("plant").register).toBe("leaf");
    expect(categoryPresentation("funeral").register).toBe("quiet");
    expect(occasionPresentation("birthday").leadSku).toBe("FO-BQ-023");
    expect(occasionPresentation("sympathy").leadSku).toBe("FO-BQ-016");
    expect(occasionPresentation("mothers_day").leadSku).toBe("FO-BQ-007");
    expect(categoryPresentation("roses").leadSku).toBe("FO-BQ-002");
    expect(categoryPresentation("bouquet").leadSku).toBe("FO-BQ-009");
    expect(categoryPresentation("plant").leadSku).toBe("FO-PT-002");
    expect(categoryPresentation("plant").countNoun).toBe("plant");
    expect(categoryPresentation("arrangement").countNoun).toBe("arrangement");
  });

  it("refuses a register outside R1's set, naming the key", () => {
    const input = rows();
    (input.occasions[0] as { register: string }).register = "neon";
    expect(failure(input)).toMatch(/occasions\.0\.register/u);
  });

  it("refuses a noun outside the founder's three, naming the key", () => {
    const input = rows();
    const plant = input.categories.findIndex((row) => row.key === "plant");
    (input.categories[plant] as { countNoun: string }).countNoun = "stem";
    expect(failure(input)).toMatch(
      new RegExp(`categories\\.${String(plant)}\\.countNoun`, "u"),
    );
  });

  it("refuses a missing row, naming the key", () => {
    const input = rows();
    input.occasions = input.occasions.filter((row) => row.key !== "christmas");
    expect(failure(input)).toContain(
      "occasion `christmas` has no presentation row",
    );
    const categories = rows();
    categories.categories = categories.categories.filter(
      (row) => row.key !== "roses",
    );
    expect(failure(categories)).toContain(
      "category `roses` has no presentation row",
    );
  });

  it("refuses a duplicate row and an unknown key, naming each", () => {
    const input = rows();
    input.occasions.push({ ...input.occasions[0]! });
    expect(failure(input)).toContain(
      "occasion `birthday` has two presentation rows",
    );
    const unknown = rows();
    unknown.categories.push({
      key: "cacti",
      register: "leaf",
      countNoun: "plant",
    });
    expect(failure(unknown)).toContain(
      "category `cacti` is not in the catalogue",
    );
  });

  it("refuses a `leadSku` outside its hub's own product set, naming the key", () => {
    const input = rows();
    const birthday = input.occasions.findIndex((row) => row.key === "birthday");
    // FO-BQ-002 (Vistula Red) is a roses bouquet for romance, never sold for a birthday.
    input.occasions[birthday] = {
      ...input.occasions[birthday]!,
      leadSku: "FO-BQ-002",
    };
    expect(failure(input)).toContain(
      "occasion `birthday`: leadSku FO-BQ-002 is not in its hub's product set",
    );
    const roses = rows();
    const at = roses.categories.findIndex((row) => row.key === "roses");
    roses.categories[at] = { ...roses.categories[at]!, leadSku: "FO-PT-002" };
    expect(failure(roses)).toContain(
      "category `roses`: leadSku FO-PT-002 is not in its hub's product set",
    );
  });
});

describe("the page draws the registry's register, not one of its own (T-35's render half)", () => {
  it("changes the country occasion band when the occasion's row flips, with no component change", async () => {
    vi.resetModules();
    vi.doMock(
      "../../src/config/catalogue/listing-presentation",
      async (original) => {
        const real =
          await original<
            typeof import("../../src/config/catalogue/listing-presentation")
          >();
        return {
          ...real,
          occasionPresentation: (key: string) =>
            key === "mothers_day"
              ? {
                  ...real.occasionPresentation(key),
                  register: "quiet" as const,
                }
              : real.occasionPresentation(key),
        };
      },
    );
    try {
      const { listingView } = await import("../../src/modules/catalog");
      const view = await listingView(
        {
          locale: "en-gb",
          pageType: "countryOccasion",
          country: "poland",
          entity: "mothers-day",
        },
        { from: "2026-10-14" },
      );
      expect(view?.entity?.register).toBe("quiet");
    } finally {
      vi.doUnmock("../../src/config/catalogue/listing-presentation");
      vi.resetModules();
    }
    const { listingView } = await import("../../src/modules/catalog");
    const real = await listingView(
      {
        locale: "en-gb",
        pageType: "countryOccasion",
        country: "poland",
        entity: "mothers-day",
      },
      { from: "2026-10-14" },
    );
    expect(real?.entity?.register).toBe("dated");
  });
});
