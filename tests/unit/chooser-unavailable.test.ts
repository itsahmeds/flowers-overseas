/**
 * The chooser and a product the chosen country does not sell (spec 004 §14 A-founder-2026-10-24a
 * item 3, AC-78; TASK-385). Every product is sold in every demo shop country today, so the product
 * page's existence rule is replaced here: Amber Hour is not sold in Romania.
 *
 * A choice of that country (by the form or by the path form) answers `303` with the cookie to the
 * chooser page with the country in `to`, which renders the not-available state (status 200, no
 * cookie); TASK-392 draws that state.
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

const { chooserChoiceResponse, chooserPageState, decideChooser } =
  await import("../../src/modules/catalog");

describe("a product not sold in the chosen country (AC-78)", () => {
  it("answers the form's choice with a 303 to the chooser's not-available state and the cookie", async () => {
    const response = await chooserChoiceResponse({
      locale: "en",
      segments: ["product", "amber-hour"],
      to: ["ro"],
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/en/choose-country/product/amber-hour?to=ro",
    );
    expect(response.headers.getSetCookie()).toEqual([
      "fo_dest=ro; Max-Age=15552000; Path=/; SameSite=Lax; Secure",
    ]);
  });

  it("answers the path form the same way, never a 303 to itself", async () => {
    const response = await chooserChoiceResponse({
      locale: "en",
      segments: ["ro", "product", "amber-hour"],
      to: [],
    });
    expect(response.headers.get("location")).toBe(
      "/en/choose-country/product/amber-hour?to=ro",
    );
  });

  it("shows the not-available state on the page that 303 lands on", async () => {
    expect(
      chooserPageState(
        await decideChooser("en", ["product", "amber-hour"], ["ro"]),
      ),
    ).toEqual({ kind: "unavailable", iso2: "RO", sku: "FO-BQ-001" });
  });

  it("still lands on the product page where it is sold", async () => {
    const response = await chooserChoiceResponse({
      locale: "en",
      segments: ["pl", "product", "amber-hour"],
      to: [],
    });
    expect(response.headers.get("location")).toBe(
      "/en/poland/product/amber-hour",
    );
  });
});
