/**
 * The titles the head-copy amendment owns, rendered by the route code that emits them (spec 003
 * §14 A-founder-2026-10-15a; TASK-243): the locale home (spec 004 AC-54 / T-59, unit half), the
 * country shop root and the country listings on pages 1 and 2 (spec 008 AC-34 / T-38, unit half)
 * and the product page with and without a descriptor (spec 009 AC-36 / T-40, unit half).
 *
 * `next-intl/server` is the one stand-in: `getTranslations` is next-intl's own `createTranslator`
 * over the **resolved committed catalogue** (`resolveCatalogue()`, the fallback chain the app
 * uses), so each title is the string a buyer's tab shows, composed by the route itself. Every
 * expectation is one exact string.
 */
import type { Metadata } from "next";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveCatalogue } from "../../src/modules/i18n/messages.ts";

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getTranslations: (
    options: string | { locale?: string; namespace?: string } = {},
  ): Promise<unknown> => {
    const { locale = "en", namespace } =
      typeof options === "string" ? { namespace: options } : options;
    return Promise.resolve(
      createTranslator({
        locale,
        messages: resolveCatalogue(locale) as never,
        ...(namespace === undefined ? {} : { namespace: namespace as never }),
      }),
    );
  },
}));

/** The products the PDP case strips of their descriptor (no seed product lacks one today). */
const noDescriptor = new Set<string>();
vi.mock("../../src/modules/catalog/index.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/index.ts")>();
  return {
    ...actual,
    productView: async (
      request: Parameters<typeof actual.productView>[0],
      options: Parameters<typeof actual.productView>[1],
    ) => {
      const view = await actual.productView(request, options);
      // `productView` parses its identity with zod, so the argument is `unknown` by signature.
      const sku = (request as { readonly sku?: string }).sku ?? "";
      if (view === undefined || !noDescriptor.has(sku)) return view;
      const h1 = { ...view.h1 };
      delete h1.formKey;
      return { ...view, h1 };
    },
  };
});

const home = await import("../../src/app/[locale]/page.tsx");
const product =
  await import("../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx");
const { countryShopRootMetadata } =
  await import("../../src/app/[locale]/country-shop-root.tsx");
const { countryListingMetadata } =
  await import("../../src/app/[locale]/country-listing.tsx");
const { listingRequest, resolveLocalePath } =
  await import("../../src/modules/catalog/index.ts");

// The canonical builder needs an absolute base; the titles do not depend on it.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://flowersoverseas.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function titleOf(metadata: Metadata): string {
  const title = metadata.title;
  if (typeof title !== "string") throw new Error("no string title");
  return title;
}

describe("spec 004 AC-54 / T-59: the locale home's `<title>`", () => {
  it("is the founder's title in `en` and `en-gb`, and its description has no dash", async () => {
    for (const locale of ["en", "en-gb"]) {
      const metadata = await home.generateMetadata({
        params: Promise.resolve({ locale }),
      });
      expect(titleOf(metadata), locale).toBe(
        "Flowers Overseas | Send Flowers Abroad",
      );
      expect(metadata.description, locale).toBe(
        "Order flowers for someone in another country. Our florist in their town makes the bouquet by hand and hands it over in person.",
      );
    }
  });
});

describe("spec 008 AC-34 / T-38: the Polish shop root and listings, pages 1 and 2", () => {
  it('the shop root reads "Send flowers to Poland: what we can make there", then " · Page 2"', async () => {
    const match = await resolveLocalePath("en", ["poland", "flowers"]);
    if (match?.kind !== "countryShopRoot") throw new Error("no shop root");
    expect(
      titleOf(await countryShopRootMetadata(match, listingRequest())),
    ).toBe("Send flowers to Poland: what we can make there");
    expect(
      titleOf(
        await countryShopRootMetadata(match, listingRequest({ page: "2" })),
      ),
    ).toBe("Send flowers to Poland: what we can make there · Page 2");
  });

  it('a country category reads "{entity} for Poland: one all-in price", then " · Page 2"', async () => {
    const match = await resolveLocalePath("en", [
      "poland",
      "flowers",
      "hand-tied-bouquets",
    ]);
    if (match?.kind !== "countryCategory") throw new Error("no category");
    expect(titleOf(await countryListingMetadata(match, listingRequest()))).toBe(
      "Hand-tied bouquets for Poland: one all-in price",
    );
    expect(
      titleOf(
        await countryListingMetadata(match, listingRequest({ page: "2" })),
      ),
    ).toBe("Hand-tied bouquets for Poland: one all-in price · Page 2");
  });

  it('a country occasion reads "{occasion} flowers for Poland: Poland\'s own date for it"', async () => {
    const match = await resolveLocalePath("en", [
      "poland",
      "occasions",
      "mothers-day",
    ]);
    if (match?.kind !== "countryOccasion") throw new Error("no occasion");
    expect(titleOf(await countryListingMetadata(match, listingRequest()))).toBe(
      "Mother's Day flowers for Poland: Poland's own date for it",
    );
  });
});

describe("spec 009 AC-36 / T-40: the product page's `<title>`", () => {
  const AMBER = {
    locale: "en",
    segment: "poland",
    child: "product",
    grandchild: "amber-hour",
  };

  it('is "{name}: {descriptor}" for a product with a descriptor', async () => {
    noDescriptor.clear();
    const metadata = await product.generateMetadata({
      params: Promise.resolve(AMBER),
    });
    expect(titleOf(metadata)).toBe("Amber Hour: hand-tied rose bouquet");
  });

  it("is the bare name for a product with no descriptor", async () => {
    noDescriptor.clear();
    noDescriptor.add("FO-BQ-001");
    try {
      const metadata = await product.generateMetadata({
        params: Promise.resolve(AMBER),
      });
      expect(titleOf(metadata)).toBe("Amber Hour");
    } finally {
      noDescriptor.clear();
    }
  });
});
