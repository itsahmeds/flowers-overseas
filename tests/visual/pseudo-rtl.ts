/**
 * Pseudo-RTL hook for the `visual` Playwright projects (spec 001 §7, TASK-008).
 *
 * spec 001 §7 asks for "a `pseudo-rtl` device stub (locale-less in 001) so 003 only adds URLs".
 * There is no locale routing and no copy yet, so the stub cannot navigate to an RTL locale: it
 * forces `dir="rtl"` on `<html>` in the browser before the document's own scripts run, which is
 * exactly the surface `fo/no-physical-css` protects (a physical utility is what breaks under
 * `dir=rtl`).
 *
 * Spec 003 keeps the project and replaces this init script with a real RTL/pseudo-locale URL
 * (`/ar-…`), plus the URL list the project screenshots. Nothing else in the harness changes.
 */
import type { Page } from "@playwright/test";

export async function forcePseudoRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const apply = (): void => {
      document.documentElement.setAttribute("dir", "rtl");
    };
    // `addInitScript` runs before the document exists on the first navigation, so apply on both
    // edges: now (subsequent navigations) and at DOMContentLoaded (first paint).
    if (document.documentElement !== null) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
}
