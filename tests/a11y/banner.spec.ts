/**
 * AC-25's rule set with the suggestion banner on screen (TASK-041, spec 003 §8).
 *
 * `tests/a11y/shell.spec.ts` audits the shipped documents; nothing in it can reach the banner,
 * because the banner only renders for a visitor whose `navigator.languages` name a *different*
 * launch locale. This file forces exactly that state and re-runs axe with the same rule set and
 * the same "no exception list" contract, so the one piece of interactive UI spec 003 ships is held
 * to the standard the rest of the shell is.
 *
 * Why the banner is the interesting case: it is inserted after hydration into a `fixed` container,
 * it is announced through `aria-live="polite"`, it is labelled by its own headline rather than by a
 * heading in the page, and it carries a control whose accessible name comes from `aria-label`. All
 * four are the shapes axe's `region`, `aria-*` and `button-name` rules exist for.
 *
 * `dir`/RTL is not asserted here — `ar-XB` (TASK-042) is where a mirrored layout becomes real.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BANNER = '[data-fo-banner="shown"]';
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

test.use({ locale: "de-DE" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => ["de-DE", "de"],
    });
  });
});

test("/en with the suggestion banner shown has no serious or critical violations", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/en");
  expect(response?.status()).toBe(200);

  await expect(page.locator(BANNER)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach("axe-results_en_banner.json", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });

  const blocking = results.violations
    .filter(
      (violation) =>
        typeof violation.impact === "string" &&
        BLOCKING_IMPACTS.has(violation.impact),
    )
    .map((violation) => violation.id)
    .sort();

  expect(blocking).toEqual([]);
});

test("the banner is announced politely and named by its own headline", async ({
  page,
}) => {
  await page.goto("/en");
  const banner = page.locator(BANNER);
  await expect(banner).toBeVisible();

  // TASK-055 moved the announcement to the permanently mounted `role="status"` region around the
  // banner — the design system's `LiveRegion` pattern, and spec 003's deferred `role="status"`
  // note closed. The panel itself stays the named, non-modal region it always was.
  const region = page.locator('[data-fo-live-region="locale-suggestion"]');
  await expect(region).toHaveAttribute("role", "status");
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveAttribute("aria-atomic", "true");
  await expect(banner).toHaveAttribute("role", "region");
  // Non-modal: it obscures nothing permanently and traps nothing (WCAG 2.2.2 / 1.4.13).
  await expect(banner).not.toHaveAttribute("aria-modal", "true");

  const labelledBy = await banner.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  await expect(page.locator(`#${labelledBy!}`)).toBeVisible();

  // The dismiss control has a name even though its content is a glyph.
  await expect(
    page.locator('[data-fo-banner-action="dismiss"]'),
  ).toHaveAttribute("aria-label", /\w/);
});
