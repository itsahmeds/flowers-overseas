/**
 * The phone header with its Menu open, and the phone back link, under axe (spec 004 §14 A24
 * clauses 3 and 4 (e), AC-47, AC-50; TASK-195). `./header.spec.ts` audits the chrome at this
 * project's desktop viewport, where the Menu is not drawn; this audits it at 390 × 844, closed and
 * open, in the four launch locales and the RTL pseudo-locale.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);
const AUDITED = [
  "/en/poland/flowers",
  "/en-gb/poland/flowers",
  "/de/polen/blumen",
  "/pl/polska/kwiaty",
  "/ar-XB/poland/flowers",
] as const;

for (const path of AUDITED) {
  test(`${path} at 390 px: the header, closed and with its Menu open, and the back link have no serious violation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await page.goto(path))?.status(), path).toBe(200);
    const audit = async () =>
      (
        await new AxeBuilder({ page })
          .include("[data-fo-header]")
          .include("main [data-fo-breadcrumb]")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
    expect(await audit()).toEqual([]);
    await page.locator("[data-fo-menu-summary]").click();
    await expect(page.locator("[data-fo-menu][open]")).toHaveCount(1);
    expect(await audit()).toEqual([]);
  });
}
