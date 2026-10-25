/**
 * `listingHref` (spec 045 §2.3 "Pages"; TASK-401): the path of one listing page when it exists,
 * the same path `listingPages()` lists for it, and `undefined` for a page that does not exist.
 */
import { describe, expect, it } from "vitest";

import { listingHref, listingPages } from "../../src/modules/catalog/index.ts";

describe("listingHref", () => {
  it.each(["en", "en-gb", "de", "pl"] as const)(
    "answers every %s page of the existence set with the path the set lists",
    async (locale) => {
      const pages = await listingPages(locale);
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) {
        const identity = {
          pageType: page.pageType,
          locale: page.locale,
          ...(page.countryIso === undefined
            ? {}
            : { countryIso: page.countryIso }),
          ...(page.entityKey === undefined
            ? {}
            : { entityKey: page.entityKey }),
        };
        expect(await listingHref(identity), page.path).toBe(page.path);
      }
    },
  );

  it("answers undefined for a page that does not exist", async () => {
    await expect(
      listingHref({
        pageType: "countryCategory",
        locale: "en",
        countryIso: "PL",
        entityKey: "no_such_category",
      }),
    ).resolves.toBeUndefined();
    await expect(
      listingHref({
        pageType: "occasionHub",
        locale: "xx",
        entityKey: "birthday",
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses an identity that is not one", async () => {
    await expect(
      listingHref({ pageType: "nope", locale: "en" }),
    ).rejects.toThrow();
  });
});
