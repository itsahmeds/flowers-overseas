/**
 * The chooser and a product the chosen country does not sell (spec 004 §14 A-founder-2026-10-24a
 * item 3, AC-78; TASK-385). Every product is sold in every demo shop country today, so the product
 * page's existence rule is replaced here: Amber Hour is not sold in Romania.
 *
 * A choice by the form answers `303` to the path form, which the chooser renders (status 200, no
 * cookie) as the not-available page; TASK-392 draws that page. The path form itself is therefore
 * not a choice for such a product: answering it with a `303` would send it to itself.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/catalog/product", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/modules/catalog/product")>();
  return {
    ...original,
    productPageExists: (input: { sku: string; countryIso: string }) =>
      input.sku === "FO-BQ-001" && input.countryIso === "RO"
        ? Promise.resolve(false)
        : original.productPageExists(input as never),
  };
});

const { chooserChoiceResponse, decideChooser } =
  await import("../../src/modules/catalog");

describe("a product not sold in the chosen country (AC-78)", () => {
  it("answers the form's choice with a 303 to the path form and the cookie", async () => {
    expect(
      await decideChooser("en", ["product", "amber-hour"], ["ro"]),
    ).toEqual({
      kind: "choice",
      iso2: "RO",
      next: { locale: "en", kind: "product", sku: "FO-BQ-001" },
    });
    const response = await chooserChoiceResponse({
      locale: "en",
      iso2: "ro",
      next: ["product", "amber-hour"],
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/en/choose-country/ro/product/amber-hour",
    );
    expect(response.headers.getSetCookie()).toEqual([
      "fo_dest=ro; Max-Age=15552000; Path=/; SameSite=Lax; Secure",
    ]);
  });

  it("renders the path form as a page, never a 303 to itself", async () => {
    expect(
      await decideChooser("en", ["ro", "product", "amber-hour"], []),
    ).toEqual({
      kind: "page",
      next: { locale: "en", kind: "product", sku: "FO-BQ-001" },
      state: { kind: "unavailable", iso2: "RO", sku: "FO-BQ-001" },
    });
  });

  it("still chooses the country where the product is sold", async () => {
    expect(
      await decideChooser("en", ["pl", "product", "amber-hour"], []),
    ).toMatchObject({ kind: "choice", iso2: "PL" });
  });
});
