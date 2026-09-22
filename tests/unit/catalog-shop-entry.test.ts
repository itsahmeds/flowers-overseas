/**
 * `corridorShopEntry()` — the corridor page's shop entry (spec 007 §2 "Internal links", spec 008
 * §2 "Links", **AC-20**; TASK-113).
 *
 * The bug this function fixes was measured on production on 2026-09-22:
 * `/en/send-flowers-to/poland` rendered four internal links and none of them reached
 * `/en/poland/flowers`, which had been live since PR #89. The corridor's shop-entry slot existed
 * and nothing filled it, so 294 shop URLs were orphans on a site whose first priority is organic
 * ranking.
 *
 * Two properties, and the second is the one that matters:
 *
 *  1. **It returns the URL the router serves** — for every destination and every launch locale,
 *     the href is a member of `listingPages()`, the same set `generateStaticParams` emits. A href
 *     this function invented would be a link to a 404 (spec 004 AC-14).
 *  2. **Both gates are load-bearing.** Withdrawing the `country-shop-root` publication empties
 *     every answer, and a destination with no shop root gets nothing. A test that only asserted
 *     the happy path would pass with the flag removed, which is the "passes with its subject
 *     removed" shape this repository has found seven times.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COUNTRY_CODES } from "../../src/config/countries.ts";
import { isPublished } from "../../src/config/site-links.ts";

vi.mock("../../src/config/site-links.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/site-links.ts")>();
  return {
    ...actual,
    isPublished: vi.fn(actual.isPublished),
  };
});

const { corridorShopEntry } =
  await import("../../src/modules/catalog/shop-entry.ts");
const { listingPages } = await import("../../src/modules/catalog/listing.ts");
const { listingLocales } = await import("../../src/modules/catalog/listing.ts");

const publishedMock = vi.mocked(isPublished);

beforeEach(() => {
  publishedMock.mockClear();
});

describe("corridorShopEntry() (AC-20)", () => {
  it("hands every destination with a shop root the URL the router serves", async () => {
    const roots = new Set(
      (await listingPages())
        .filter((page) => page.pageType === "countryShopRoot")
        .map((page) => page.path),
    );
    expect(
      roots.size,
      "the shop-root existence set is not empty",
    ).toBeGreaterThan(0);

    let linked = 0;
    for (const locale of listingLocales()) {
      for (const iso2 of COUNTRY_CODES) {
        const { shopEntryHref } = await corridorShopEntry(locale, iso2);
        if (shopEntryHref === undefined) continue;
        expect(roots.has(shopEntryHref), `${locale}/${iso2}`).toBe(true);
        linked += 1;
      }
    }
    // Every member of the existence set is reachable from its corridor page, and nothing else is.
    expect(linked).toBe(roots.size);
  });

  it("asks `isPublished()` for the `country-shop-root` id and honours the answer", async () => {
    expect((await corridorShopEntry("en", "PL")).shopEntryHref).toBe(
      "/en/poland/flowers",
    );
    expect(publishedMock).toHaveBeenCalledWith("country-shop-root");

    // Withdraw the publication: the section disappears everywhere, which is the AC-20 data flip
    // run backwards. Without this the first test would pass with the flag deleted.
    publishedMock.mockReturnValue(false);
    for (const locale of listingLocales()) {
      for (const iso2 of COUNTRY_CODES) {
        expect(
          (await corridorShopEntry(locale, iso2)).shopEntryHref,
          `${locale}/${iso2}`,
        ).toBeUndefined();
      }
    }
    publishedMock.mockImplementation(
      (
        await vi.importActual<typeof import("../../src/config/site-links.ts")>(
          "../../src/config/site-links.ts",
        )
      ).isPublished,
    );
  });

  it("gives nothing for a country the registry does not know", async () => {
    expect(await corridorShopEntry("en", "PT")).toEqual({});
    expect(await corridorShopEntry("en", "")).toEqual({});
  });

  it("gives nothing for a locale with no shop root", async () => {
    expect(await corridorShopEntry("fr", "PL")).toEqual({});
  });
});
