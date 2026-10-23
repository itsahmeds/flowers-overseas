/**
 * AC-26 over the consent layer (TASK-051; restated for spec 004 §14 A-founder-2026-10-19d by
 * TASK-279): axe against a locale document **with the settings panel open**, opened from the
 * footer's "Cookie settings" — on the committed build nothing asks on load, so the panel is the
 * one consent state a page reaches. The **sheet shown** state runs in the `consent-active` project
 * (`tests/consent-active/consent-a11y.spec.ts`).
 *
 * Two locales, chosen for what they break: `pl` (diacritics and the longest labels in the
 * catalogue) and `ar-XB` (the only right-to-left document in the repository, where a sheet
 * anchored with `start`/`end` is either mirrored or wrong).
 *
 * The structural assertion axe cannot make is added by hand: every category toggle is a labelled
 * real checkbox, and the locked group has none.
 */
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { motionsSettled } from "../support/at-rest.ts";
import { openConsentSettings } from "../support/consent.ts";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const AUDITED = ["/pl", "/ar-XB"] as const;

const SETTINGS_OPEN = '[data-fo-consent="settings"]';
const PANEL = "[data-fo-consent-panel]";

async function emptyLanguages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
}

for (const path of AUDITED) {
  test(`${path} with the settings panel open has no serious or critical violations`, async ({
    page,
  }, testInfo) => {
    await emptyLanguages(page);
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);
    await openConsentSettings(page);
    await expect(page.locator(SETTINGS_OPEN)).toBeVisible();
    await motionsSettled(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach(
      `axe-consent-settings${path.replaceAll("/", "_")}.json`,
      {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      },
    );

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

test("every category toggle is a labelled checkbox, and the locked group has none", async ({
  page,
}) => {
  await emptyLanguages(page);
  await page.goto("/pl");
  await openConsentSettings(page);

  const panel = page.locator(PANEL);
  const toggles = panel.locator('input[type="checkbox"]');
  await expect(toggles).toHaveCount(2);

  for (const category of ["analytics", "marketing"] as const) {
    const toggle = panel.locator(`[data-fo-consent-category="${category}"]`);
    // A real checkbox, accessibly named, operable, and off until the visitor says otherwise.
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    const name = await toggle.evaluate((element) => {
      const id = element.getAttribute("id") ?? "";
      const label = document.querySelector(`label[for="${id}"]`);
      return label?.textContent ?? "";
    });
    expect(name.trim().length, `${category} label`).toBeGreaterThan(0);
  }

  // The essential group is stated, not offered: no disabled control to mislead anyone.
  expect(
    await panel.locator('[data-fo-consent-category="essential"]').count(),
  ).toBe(0);
  expect(await panel.locator("input[disabled]").count()).toBe(0);
  await expect(panel.locator("[data-fo-consent-locked]")).toBeVisible();
});
