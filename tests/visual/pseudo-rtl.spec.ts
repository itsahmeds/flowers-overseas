/**
 * T-30 / AC-30 (TASK-042): the real right-to-left gate.
 *
 * TASK-008 shipped a locale-less stub — an init script that set `dir="rtl"` on a copy-less shell,
 * which `/review 8` recorded as "a gate only once content lands". Content has landed: `/ar-XB` is
 * a served document whose `dir="rtl"` comes from `src/config/locales.ts` and whose strings come
 * from the generated `ar-XB` catalogue (`src/modules/i18n/pseudo.ts`), so this project navigates a
 * URL like every other suite and `forcePseudoRtl` is deleted.
 *
 * The route exists only where `ENABLE_PSEUDO_LOCALES=true` (spec 003 §2, §8): locally and on the
 * protected preview the suites run against, never in production, where the env schema refuses the
 * flag. A 404 here therefore means the target is missing the variable, which is why the status is
 * asserted before the screenshot — a missing baseline and a missing env var must not look alike.
 */
import { expect, test } from "@playwright/test";

/** The RTL pseudo-locale (`PSEUDO_LOCALES` in `src/config/locales.ts`). */
const PSEUDO_RTL_PATH = "/ar-XB";

test(`${PSEUDO_RTL_PATH} matches the committed right-to-left baseline`, async ({
  page,
}) => {
  const response = await page.goto(PSEUDO_RTL_PATH);
  expect(
    response?.status(),
    `${PSEUDO_RTL_PATH} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
  ).toBe(200);
  // The direction is the document's own, not an init script's (AC-29, AC-30).
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-XB");

  await expect(page).toHaveScreenshot("ar-XB.png", { fullPage: true });
});
