/**
 * AC-26 over the consent sheet (TASK-051): axe against a locale document **with the sheet shown**
 * and **with the settings panel open** — the two states no Phase-0 page reaches on its own, and
 * the two the whole-document runs in `tests/a11y/shell.spec.ts` therefore never see.
 *
 * Two locales, chosen for what they break: `pl` (diacritics and the longest labels in the
 * catalogue) and `ar-XB` (the only right-to-left document in the repository, where a sheet
 * anchored with `start`/`end` is either mirrored or wrong).
 *
 * Three structural assertions axe cannot make are added by hand, because they are the ones §8 and
 * AC-17 actually require: the sheet is a **named non-modal region** and not a dialog, focus is
 * **not** taken when it appears, and every category toggle is a labelled real checkbox.
 */
import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const AUDITED = ["/pl", "/ar-XB"] as const;

const SHOWN = '[data-fo-consent="shown"]';
const SETTINGS_OPEN = '[data-fo-consent="settings"]';
const CHOOSE = '[data-fo-consent-action="settings"]';
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

  test(`${path} with the settings panel open has no serious or critical violations`, async ({
    page,
  }, testInfo) => {
    await emptyLanguages(page);
    await page.goto(path);
    await expect(page.locator(SHOWN)).toBeVisible();
    await page.locator(CHOOSE).click();
    await expect(page.locator(SETTINGS_OPEN)).toBeVisible();

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

test("every category toggle is a labelled checkbox, and the locked group has none", async ({
  page,
}) => {
  await emptyLanguages(page);
  await page.goto("/pl");
  await expect(page.locator(SHOWN)).toBeVisible();
  await page.locator(CHOOSE).click();

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
