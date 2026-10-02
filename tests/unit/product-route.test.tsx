/**
 * The product route — `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`'s product branch
 * (spec 009 §2, §5.4, AC-1, AC-8's "zero template edits"; T-01 unit half; TASK-127).
 *
 * The route is called as Next calls it — a `params` promise in, an element or a thrown
 * `notFound()` out — so every AC-1 shape is asserted against the file that serves it, not only
 * against the resolver underneath. `notFound()` is the real one; `next-intl/server` is replaced
 * by a minimal stand-in because there is no request context in a unit test.
 *
 * What a 200 means here: the branch returns `ProductPage` over the `productView()` of exactly the
 * resolved (locale, destination, SKU). What a 404 means: `NEXT_HTTP_ERROR_FALLBACK;404` is thrown
 * — never a redirect, and never a substitute page.
 */
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * Every committed product is priced in every destination, so "no active price here" has no
 * corpus example. The one term is made switchable — the `catalog-product-routes.test.ts` seam —
 * and the rest of the existence rule stays real.
 */
const reads: { unpriced?: string } = {};
vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    hasActivePrice: async (sku: string, iso2: string) =>
      reads.unpriced === `${sku}|${iso2}`
        ? false
        : await actual.hasActivePrice(sku, iso2 as never),
  };
});

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getTranslations: (): Promise<(key: string) => string> =>
    Promise.resolve((key: string) => key),
}));

const route =
  await import("../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx");
const { ProductPage } = await import("../../src/modules/ui");
const { listProductPages, productPrebuildPages } =
  await import("../../src/modules/catalog");

type Params = {
  locale: string;
  segment: string;
  child: string;
  grandchild: string;
};

function call(params: Params): Promise<ReactElement> {
  return route.default({ params: Promise.resolve(params) });
}

async function notFoundFor(params: Params): Promise<boolean> {
  try {
    await call(params);
    return false;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return true;
    throw error;
  }
}

const AMBER = {
  locale: "en",
  segment: "poland",
  child: "product",
  grandchild: "amber-hour",
} as const;

describe("AC-1: the product route answers the existence set and 404s everything else", () => {
  it("is the one depth with on-demand params, and prebuilds the top-24 product pages", async () => {
    expect(route.dynamicParams).toBe(true);
    expect(route.revalidate).toBe(3600);
    const params = await route.generateStaticParams();
    const prebuilt = await productPrebuildPages();
    for (const page of prebuilt) {
      expect(
        params.some(
          (entry) =>
            entry.locale === page.locale &&
            entry.segment === page.countrySlug &&
            entry.grandchild === page.slug,
        ),
        page.path,
      ).toBe(true);
    }
  });

  it("renders `ProductPage` over the resolved product, in every launch locale", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const [page] = (await listProductPages(locale)).filter(
        (record) => record.countryIso === "PL",
      );
      expect(page, locale).toBeDefined();
      const [, , countrySlug, child, slug] = (page?.path ?? "").split("/");
      const element = await call({
        locale,
        segment: countrySlug ?? "",
        child: child ?? "",
        grandchild: slug ?? "",
      });
      expect(isValidElement(element), locale).toBe(true);
      expect(element.type, locale).toBe(ProductPage);
      const props = element.props as { view: { product: { sku: string } } };
      expect(props.view.product.sku, locale).toBe(page?.sku);
    }
  });

  it("404s an unknown slug, an uppercase variant, another locale's segment and an unknown locale", async () => {
    expect(await notFoundFor(AMBER)).toBe(false);
    expect(await notFoundFor({ ...AMBER, grandchild: "no-such-bouquet" })).toBe(
      true,
    );
    expect(await notFoundFor({ ...AMBER, grandchild: "Amber-Hour" })).toBe(
      true,
    );
    expect(await notFoundFor({ ...AMBER, segment: "Poland" })).toBe(true);
    expect(await notFoundFor({ ...AMBER, child: "produkt" })).toBe(true);
    expect(await notFoundFor({ ...AMBER, locale: "fr" })).toBe(true);
    expect(await notFoundFor({ ...AMBER, segment: "atlantis" })).toBe(true);
  });

  it("404s a product with no active price in that destination", async () => {
    expect(await notFoundFor(AMBER)).toBe(false);
    reads.unpriced = "FO-BQ-001|PL";
    try {
      expect(await notFoundFor(AMBER)).toBe(true);
    } finally {
      delete reads.unpriced;
    }
    expect(await notFoundFor(AMBER)).toBe(false);
  });
});
