/**
 * T-18 (visual half) / AC-17 (TASK-008): `/` matches the committed baseline within 0.1 %.
 *
 * Runs in two projects: `visual` (LTR) and `pseudo-rtl`, which forces `dir="rtl"` before the
 * document loads (see `./pseudo-rtl.ts`). Each project owns its own baseline directory via
 * `snapshotPathTemplate`, so the RTL stub is a real gate rather than a copy of the LTR one.
 */
import { expect, test } from "@playwright/test";

import { PSEUDO_RTL_PROJECT } from "../../playwright.config.ts";

import { forcePseudoRtl } from "./pseudo-rtl.ts";

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === PSEUDO_RTL_PROJECT) {
    await forcePseudoRtl(page);
  }
});

test("the shell matches the committed baseline", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    testInfo.project.name === PSEUDO_RTL_PROJECT ? "rtl" : "ltr",
  );

  await expect(page).toHaveScreenshot("home.png", { fullPage: true });
});
