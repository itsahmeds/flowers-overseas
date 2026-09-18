/**
 * An unpublished destination contributes nothing to the existence set (spec 008 §2's table,
 * **AC-3**; T-03; TASK-107).
 *
 * §2 gives a country shop root to a destination that is **published** — `status === 'live'` or
 * `guidePublished` — and everything else country-scoped hangs off that root, so depublishing a
 * country must remove its shop root, its categories, its occasions and its contribution to a
 * hub's "≥1 product in ≥1 published country" in one data flip and with no code change (§12,
 * AC-5's half that belongs to this task).
 *
 * All seven registry rows are published today, which is why this file mocks the registry rather
 * than asserting against it: the rule has to be observable *before* a country is ever turned off,
 * not after. The mock lives in its own file because a registry mock has to be installed before
 * `countries.ts` is first imported by anything in the graph.
 */
import { describe, expect, it, vi } from "vitest";

/** The Netherlands: a `demo` destination whose guide the founder has published. */
const OFF = "NL";

vi.mock("../../src/config/countries.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/countries.ts")>();
  return {
    ...actual,
    isGuidePublished: (iso2: string) =>
      iso2 === OFF ? false : actual.isGuidePublished(iso2 as never),
    countryConfig: (iso2: string) =>
      iso2 === OFF
        ? { ...actual.countryConfig(iso2 as never), status: "disabled" }
        : actual.countryConfig(iso2 as never),
  };
});

const {
  isPublishedCountry,
  listingExists,
  listingPages,
  listingView,
  publishedCountries,
} = await import("../../src/modules/catalog/listing.ts");

describe("an unpublished destination has no listing at all (§2, AC-3)", () => {
  it("drops it from the published set", () => {
    expect(isPublishedCountry(OFF)).toBe(false);
    expect(publishedCountries()).not.toContain(OFF);
    expect(publishedCountries().length).toBeGreaterThan(0);
  });

  it("gives it no shop root, no category and no occasion", async () => {
    for (const identity of [
      { pageType: "countryShopRoot", locale: "en", countryIso: OFF },
      {
        pageType: "countryCategory",
        locale: "en",
        countryIso: OFF,
        entityKey: "bouquet",
      },
      {
        pageType: "countryOccasion",
        locale: "en",
        countryIso: OFF,
        entityKey: "mothers_day",
      },
    ]) {
      await expect(listingExists(identity)).resolves.toBe(false);
    }
  });

  it("emits no URL for it anywhere in the existence set", async () => {
    const pages = await listingPages("en");
    expect(pages.filter((page) => page.countryIso === OFF)).toHaveLength(0);
    expect(pages.some((page) => page.path.includes("netherlands"))).toBe(false);
    expect(pages.length).toBeGreaterThan(0);
  });

  it("404s its URL rather than rendering an empty grid (AC-1)", async () => {
    await expect(
      listingView({
        locale: "en",
        pageType: "countryShopRoot",
        country: "netherlands",
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps a published destination exactly as it was", async () => {
    await expect(
      listingExists({
        pageType: "countryShopRoot",
        locale: "en",
        countryIso: "PL",
      }),
    ).resolves.toBe(true);
  });
});
