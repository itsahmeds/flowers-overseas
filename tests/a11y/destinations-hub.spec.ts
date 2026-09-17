/**
 * axe on the all-destinations hub (spec 007 AC-26, T-27; TASK-092).
 *
 * Zero serious or critical violations, **with no exception list**, at both artboard widths, in
 * all four launch locales — including the two whose hub is in its empty state, because the text
 * rows are the state a screen reader will meet there — and in the right-to-left pseudo-locale,
 * where the page is the English list inside pseudo chrome (§7 "RTL impact").
 *
 * The structures this file exists for are §5.3's: one `h1`, a labelled breadcrumb whose leaf
 * carries `aria-current`, region headings that are real `h2`s in document order, and a
 * destination without a page rendered as text — not as a disabled link with no accessible name.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/send-flowers-to",
  "/en-gb/send-flowers-to",
  "/de/blumen-verschicken",
  "/pl/wyslij-kwiaty",
  "/ar-XB/send-flowers-to",
] as const;

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
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
  for (const viewport of WIDTHS) {
    test(`${path} at ${String(viewport.width)}px has no serious or critical violations`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto(path);
      expect(
        response?.status(),
        `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
      ).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);

      expect(await audit(page)).toEqual([]);
    });
  }
}

test("the hub has one h1, a named breadcrumb and real region headings", async ({
  page,
}) => {
  await page.goto("/en/send-flowers-to");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-fo-breadcrumb]")).toHaveCount(1);
  await expect(
    page.locator("[data-fo-breadcrumb] [aria-current='page']"),
  ).toHaveCount(1);
  await expect(page.locator("main h2")).toHaveCount(3);
});
