/**
 * axe over the product page (spec 009 §5.3 "Accessibility", AC-27's served half for the states a
 * build can reach; TASK-126, TASK-127).
 *
 * Zero serious or critical violations, with no exception list, on the `preview` picker (Poland,
 * every launch locale and the RTL pseudo-locale), the `unavailable` picker (Germany) and the
 * no-photo, single-tier page. The `live` state needs a florist no build has; its markup is the
 * same template and is asserted in the unit layer.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/poland/product/amber-hour",
  "/en-gb/poland/product/amber-hour",
  "/de/polen/produkt/amber-hour",
  "/pl/polska/produkt/amber-hour",
  "/ar-XB/poland/product/amber-hour",
  "/en/germany/product/amber-hour",
  "/en/poland/product/anthurium",
] as const;

async function audit(
  page: import("@playwright/test").Page,
): Promise<{ id: string; impact: string | null | undefined }[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map((violation) => ({ id: violation.id, impact: violation.impact }));
}

for (const path of AUDITED) {
  test(`${path} has no serious or critical violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(await audit(page), path).toEqual([]);
  });
}

test("one <h1>, and the tier and date groups are fieldsets with legends", async ({
  page,
}) => {
  await page.goto("/en/poland/product/amber-hour");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Which size?" })).toHaveCount(1);
  await expect(
    page.getByRole("group", { name: "When should it arrive?" }),
  ).toHaveCount(1);
  await expect(
    page.locator('[aria-live="polite"] [data-fo-price-total]'),
  ).toHaveCount(1);
});
