/**
 * AC-26 over the consent sheet **shown** (TASK-051), in the `consent-active` project (spec 004
 * §14 A-founder-2026-10-19d clause 8; TASK-279): only a build with an active consent source shows
 * the sheet on load. The settings-panel half runs on the committed build
 * (`tests/a11y/consent.spec.ts`). The fixture's GA4 tag is aborted (`abortGoogle`).
 *
 * Besides axe, the structural assertions §8 and AC-17 require: the sheet is a **named non-modal
 * region** and not a dialog, and focus is **not** taken when it appears.
 */
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { motionsSettled } from "../support/at-rest.ts";
import { abortGoogle } from "../support/consent-active.ts";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const AUDITED = ["/pl", "/ar-XB"] as const;

const SHOWN = '[data-fo-consent="shown"]';

async function emptyLanguages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
}

test.beforeEach(async ({ page }) => {
  await abortGoogle(page);
});

for (const path of AUDITED) {
  test(`${path} with the sheet shown has no serious or critical violations`, async ({
    page,
  }, testInfo) => {
    await emptyLanguages(page);
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);
    await expect(page.locator(SHOWN)).toBeVisible();
    // The sheet once its opening fade has ended: mid-fade its text reads as low contrast (TASK-194).
    await motionsSettled(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach(`axe-consent${path.replaceAll("/", "_")}.json`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });

    expect(
      results.violations
        .filter(
          (violation) =>
            typeof violation.impact === "string" &&
            BLOCKING_IMPACTS.has(violation.impact),
        )
        .map((violation) => violation.id)
        .sort(),
    ).toEqual([]);
  });
}

test("the sheet is one named, non-modal region that does not take focus", async ({
  page,
}) => {
  await emptyLanguages(page);
  await page.goto("/pl");
  const sheet = page.locator(SHOWN);
  await expect(sheet).toBeVisible();

  // Named by its own headline, announced politely, and not a dialog: it traps nothing and needs
  // no escape hatch to the page behind it (AC-17, WCAG 1.4.13).
  const labelledBy = await sheet.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  await expect(page.locator(`#${labelledBy!}`)).toBeVisible();
  expect(await page.locator('[role="dialog"]').count()).toBe(0);
  expect(await page.locator("[aria-modal]").count()).toBe(0);

  // Focus is where the document left it, not in the sheet.
  expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).toBe(
    "BODY",
  );

  // One region per document, so a screen-reader user is not told about two consent sheets.
  expect(await page.locator("[data-fo-consent]").count()).toBe(1);
});
