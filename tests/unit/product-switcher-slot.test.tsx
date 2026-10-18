/**
 * The product page's `@switcher` slot (TASK-233's same-page language links, kept when spec 009
 * AC-37 moved the product page to `_product`; TASK-228). Next fills a parallel slot from the
 * mirror of the path the router serves, which for a product address is the rewritten
 * `/{locale}/_product/…`; with no mirror there the slot is `default.tsx`, whose links are the
 * locale homes. Red with the mirror deleted (the import fails).
 */
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
}));

const slot =
  await import("../../src/app/[locale]/@switcher/%5Fproduct/[segment]/[child]/[grandchild]/page.tsx");

describe("the product route keeps same-page language links (TASK-233 after AC-37)", () => {
  it("mirrors `_product` in the `@switcher` slot and asks for the product's own segments", async () => {
    const element = await slot.default({
      params: Promise.resolve({
        locale: "en",
        segment: "poland",
        child: "product",
        grandchild: "amber-hour",
      }),
    });
    expect(isValidElement(element)).toBe(true);
    expect((element.props as { segments?: string[] }).segments).toEqual([
      "poland",
      "product",
      "amber-hour",
    ]);
  });
});
