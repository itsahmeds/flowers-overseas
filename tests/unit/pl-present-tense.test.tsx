/**
 * Polish copy speaks of our florist in the present tense (spec 004 §14 A22 clause 1; founder,
 * 2026-10-04: "yes use present tense"; TASK-179, `/review` round 1 on PR 170).
 *
 * The live crawl found two Polish future forms: `shop.category.lede` ("nasz florysta ułoży", will
 * arrange) and the bouquet category's intro ("zostanie wykonany", will be made). Both now read in
 * the present tense. This renders every `pl` category page — each category hub and each country
 * category — and every `pl` product page for Poland, and looks for the future forms in the text a
 * buyer reads.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type ListingView,
  listProductPages,
  listingPages,
  listingView,
  productView,
} from "../../src/modules/catalog";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import { ProductPage } from "../../src/modules/ui/product/ProductPage.tsx";
import { textOf } from "../support/listing-honesty";

/** "will arrange", "will be made", "will be delivered" — the forms A22 retires for our florist. */
const FUTURE = /ułoży|zostanie wykonan|zostanie doręczon/iu;

const FRESH = new Date("2026-09-09T12:00:00Z");

const NAMESPACES = [
  "shop",
  "categoryHub",
  "occasionHub",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
  "product",
  "delivery",
  "corridor",
] as const;

function render(node: ReactElement): string {
  return textOf(
    renderToStaticMarkup(
      <NextIntlClientProvider
        locale="pl"
        messages={loadMessages("pl", [...NAMESPACES])}
        timeZone="UTC"
      >
        {node}
      </NextIntlClientProvider>,
    ),
  );
}

describe("A22: no future tense for our florist in rendered Polish", () => {
  it("the pattern finds the retired forms (the check's own subject)", () => {
    expect(FUTURE.test("nasz florysta ułoży w mieście odbiorcy")).toBe(true);
    expect(FUTURE.test("rozmiar, który zostanie wykonany")).toBe(true);
    expect(FUTURE.test("zostanie doręczone osobiście")).toBe(true);
    expect(FUTURE.test("nasz florysta układa w mieście odbiorcy")).toBe(false);
  });

  it("renders every pl category hub and country category without one", async () => {
    const pages = (await listingPages("pl")).filter(
      (page) =>
        page.pageType === "categoryHub" || page.pageType === "countryCategory",
    );
    expect(pages.some((page) => page.pageType === "categoryHub")).toBe(true);
    expect(pages.some((page) => page.pageType === "countryCategory")).toBe(
      true,
    );
    for (const page of pages) {
      const view: ListingView | undefined = await listingView(
        {
          locale: "pl",
          pageType: page.pageType,
          ...(page.countrySlug === undefined
            ? {}
            : { country: page.countrySlug }),
          ...(page.slug === undefined ? {} : { entity: page.slug }),
        },
        { from: "2026-09-09", now: FRESH },
      );
      expect(view, page.path).toBeDefined();
      const text = render(
        page.pageType === "categoryHub" ? (
          <CategoryHubPage view={view!} />
        ) : (
          <CountryCategoryPage view={view!} />
        ),
      );
      expect(FUTURE.exec(text)?.[0], page.path).toBe(undefined);
    }
  });

  it("renders every pl product page for Poland without one", async () => {
    const pages = (await listProductPages("pl")).filter(
      (page) => page.countryIso === "PL",
    );
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const view = await productView(
        { locale: "pl", countryIso: "PL", sku: page.sku },
        { parameterised: false, now: FRESH },
      );
      expect(view, page.path).toBeDefined();
      const text = render(
        <ProductPage breadcrumb={null} facts={null} view={view!} />,
      );
      expect(FUTURE.exec(text)?.[0], page.path).toBe(undefined);
    }
    // Eighty-four product pages, each a full `productView()` and render.
  }, 60_000);
});
