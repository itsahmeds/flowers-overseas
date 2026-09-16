/**
 * axe on the corridor page (spec 007 AC-26, T-27; TASK-091 — the half its own route can prove;
 * the hub and the full four-locale matrix are TASK-092's and TASK-095's).
 *
 * Zero serious or critical violations, **with no exception list**, on a corridor page in each
 * locale that has one, and in the right-to-left pseudo-locale, where the page is the English
 * guide inside pseudo chrome — which is exactly what an RTL reading has to be audited against
 * before the first RTL launch (§7 "RTL impact").
 *
 * The new structures this file exists for are the ones spec 007 §5.3 names: the breadcrumb's
 * `nav`/`aria-current`, the facts description list, the captioned calendar table with its column
 * and row scopes, and an FAQ of real headings in document order.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

/** The locales that have a corridor page, plus the RTL pseudo-locale. */
const AUDITED = [
  "/en/send-flowers-to/poland",
  "/en-gb/send-flowers-to/poland",
  "/ar-XB/send-flowers-to/poland",
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
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);
    await expect(
      page.locator("[data-fo-corridor-faq] h3").first(),
    ).toBeVisible();

    expect(await audit(page)).toEqual([]);
  });
}

test("the page has one h1, a named breadcrumb and a captioned calendar", async ({
  page,
}) => {
  await page.goto("/en/send-flowers-to/poland");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-fo-breadcrumb]")).toHaveCount(1);
  // Scoped to the trail: the header's locale switcher marks the current locale `aria-current`
  // too, and that is its own correct answer to a different question.
  await expect(
    page.locator("[data-fo-breadcrumb] [aria-current='page']"),
  ).toHaveCount(1);
  await expect(
    page.locator("[data-fo-corridor-calendar] table caption"),
  ).toHaveCount(1);
  await expect(
    page.locator("[data-fo-corridor-calendar] th[scope='row']").first(),
  ).toBeVisible();
});
