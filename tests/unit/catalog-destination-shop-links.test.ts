/**
 * `destinationShopLinks()` and `pageDestination()` (spec 043 §5.2, §5.3 A, AC-1, AC-2; T-01 and
 * T-02's unit halves; TASK-288).
 *
 * The pinned tables are the design's (`docs/design/wireframes/country-shop-desktop.dc.html`, the
 * "Spec 043 · the header in context" band), restated for `en`: each in-context href is the one the
 * matching hub's own destination list gives, and the shop root where that page does not exist.
 * Two fixtures change the committed catalogue at the read seam, so the real existence rules run:
 *
 *  - Poland's roses page missing (three roses deliverable to Poland, under the floor of six): the
 *    roses item falls back to Poland's shop root (AC-2), and every other item is unchanged;
 *  - Birthday observed in Poland: the birthday occasion hub now links Poland's country occasion
 *    page rather than its birthday-flowers category, and the header follows the hub's row, not a
 *    slug guessed from the key (T-01's "red when Birthday is mapped by slug guess").
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  /** `"{categoryKey}:{iso2}"` pairs the read seam answers with a count under the floor. */
  thinCategories: new Set<string>(),
  /** Extra `occasion_country` rows, appended to the committed calendar. */
  extraCalendar: [] as {
    occasionKey: string;
    countryIso2: string;
    observed: boolean;
  }[],
}));

vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    countProductsIn: async (
      ...args: Parameters<typeof actual.countProductsIn>
    ): Promise<number> =>
      fixture.thinCategories.has(`${args[0]}:${args[1]}`)
        ? 3
        : actual.countProductsIn(...args),
  };
});

vi.mock("../../src/modules/geo/index.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/geo/index.ts")>();
  const committed = actual.committedOccasionCalendar;
  // A live view: the committed rows, then whatever the case under test appends.
  const calendar = new Proxy(committed, {
    get(target, property, receiver) {
      if (property === "some") {
        return (
          predicate: (row: (typeof committed)[number]) => boolean,
        ): boolean =>
          target.some(predicate) ||
          fixture.extraCalendar.some((row) =>
            predicate(row as unknown as (typeof committed)[number]),
          );
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return { ...actual, committedOccasionCalendar: calendar };
});

const { destinationShopLinks, pageDestination, listingView } =
  await import("../../src/modules/catalog/index.ts");

afterEach(() => {
  fixture.thinCategories.clear();
  fixture.extraCalendar.length = 0;
});

/** The design band's table, `en`. */
function pinned(country: "poland" | "france"): Record<string, string> {
  return {
    "our-selection": `/en/${country}/flowers`,
    birthday: `/en/${country}/flowers/birthday-flowers`,
    sympathy: `/en/${country}/flowers/sympathy-flowers`,
    bouquets: `/en/${country}/flowers/hand-tied-bouquets`,
    roses: `/en/${country}/flowers/roses`,
    plants: `/en/${country}/flowers/plants`,
  };
}

describe("destinationShopLinks() over the committed catalogue (T-01)", () => {
  it("gives Poland's own page for each of the six shop items, in en", async () => {
    expect(await destinationShopLinks("en", "PL")).toEqual(pinned("poland"));
  });

  it("gives France's own page for each of the six shop items, in en", async () => {
    expect(await destinationShopLinks("en", "FR")).toEqual(pinned("france"));
  });

  it("spells the en-gb paths in en-gb", async () => {
    expect((await destinationShopLinks("en-gb", "PL"))?.roses).toBe(
      "/en-gb/poland/flowers/roses",
    );
  });

  it("leaves Occasions and Destinations out: they link the same page everywhere", async () => {
    const links = await destinationShopLinks("en", "PL");
    expect(links).not.toHaveProperty("occasions");
    expect(links).not.toHaveProperty("destinations");
  });

  it("answers undefined for a destination with no shop root, an unknown code and a pseudo-locale", async () => {
    expect(await destinationShopLinks("en", "XX")).toBeUndefined();
    expect(await destinationShopLinks("en-XA", "PL")).toBeUndefined();
  });
});

describe("the fallback to the shop root (AC-2, T-02)", () => {
  it("links Roses to Poland's shop root when Poland's roses page does not exist", async () => {
    fixture.thinCategories.add("roses:PL");
    const links = await destinationShopLinks("en", "PL");
    expect(links?.roses).toBe("/en/poland/flowers");
    // Only the missing page moves: the other five keep their own pages.
    expect({ ...links, roses: undefined }).toEqual({
      ...pinned("poland"),
      roses: undefined,
    });
  });

  it("leaves France's roses alone when only Poland's is missing", async () => {
    fixture.thinCategories.add("roses:PL");
    expect((await destinationShopLinks("en", "FR"))?.roses).toBe(
      "/en/france/flowers/roses",
    );
  });
});

describe("the occasion items follow the hub's own row, never a slug guess (T-01)", () => {
  it("links Birthday to Poland's country occasion page once the birthday hub links it", async () => {
    fixture.extraCalendar.push({
      occasionKey: "birthday",
      countryIso2: "PL",
      observed: true,
    });
    const hub = await listingView({
      pageType: "occasionHub",
      locale: "en",
      entity: "birthday",
    });
    const row = hub?.links.destinations.find(
      (destination) => destination.iso2 === "PL",
    )?.href;
    // The fixture really moved the hub's row off the category page.
    expect(row).toBeDefined();
    expect(row).not.toBe("/en/poland/flowers/birthday-flowers");
    expect((await destinationShopLinks("en", "PL"))?.birthday).toBe(row);
  });
});

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
