/**
 * Spec 003 AC-28 (f) in the browser (spec 003 §14 A16; TASK-119, `/break 205` hole 3), moved from
 * `tests/e2e/language-popup.spec.ts` to the `consent-active` project by TASK-279: only a build
 * with an active consent source shows a sheet that could stack on the popup (spec 004 §14
 * A-founder-2026-10-19d clause 8). A first visit, so the popup opens; the GA4 fixture tag is
 * aborted (`abortGoogle`).
 */
import { type Page, expect, test } from "@playwright/test";

import { motionsSettled } from "../support/at-rest.ts";
import { abortGoogle } from "../support/consent-active.ts";
import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

const POPUP = "dialog[data-fo-language-popup]";
const OPEN = `${POPUP}[open]`;
const CLOSE = "[data-fo-language-popup-close]";
const CONSENT_SHOWN = '[data-fo-consent="shown"]';

test.use({ storageState: NO_LOCALE_CHOICE });

test.beforeEach(async ({ page }) => {
  await abortGoogle(page);
});

async function openFromRoot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(OPEN)).toBeVisible();
  await motionsSettled(page);
  expect(new URL(page.url()).pathname).toBe("/en");
}

test.describe("(f) never on screen with the consent sheet", () => {
  test("the sheet waits until the popup has closed, however long it stays open", async ({
    page,
  }) => {
    // Sample every frame from the first paint: was the sheet ever painted while the popup was
    // open? A state check at the end cannot see a sheet that came and went (`/break 205` hole 3).
    await page.addInitScript(() => {
      const store = window as unknown as { __foCoVisible?: boolean };
      store.__foCoVisible = false;
      const sample = (): void => {
        const popupOpen =
          document.querySelector("dialog[data-fo-language-popup][open]") !==
          null;
        const sheet = document.querySelector('[data-fo-consent="shown"]');
        if (popupOpen && sheet !== null && sheet.getClientRects().length > 0) {
          store.__foCoVisible = true;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await openFromRoot(page);
    await page.waitForLoadState("networkidle");
    // Past the loader's fail-open timer (`LOCALE_GATE_TIMEOUT_MS`, 4 s): a gate the open popup
    // did not hold would be released here and the sheet would paint over the popup.
    await page.waitForTimeout(5_500);
    await expect(page.locator(OPEN)).toBeVisible();
    await expect(page.locator(CONSENT_SHOWN)).toHaveCount(0);

    await page.locator(CLOSE).click();
    await expect(page.locator(CONSENT_SHOWN)).toBeVisible();
    await expect(page.locator(POPUP)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __foCoVisible?: boolean }).__foCoVisible,
      ),
    ).toBe(false);
  });
});
