/**
 * **T-27 / AC-27** (the axe half) — spec 041's info pages (TASK-184).
 *
 * > "axe reports zero serious or critical violations on the seven `en` pages that exist before
 * > registration. The imprint, terms and privacy views pass a component-level a11y check under a
 * > `registered: true` fixture."
 *
 * Zero serious or critical violations, **with no exception list**, on the seven `en` pages, on one
 * `de` and one `pl` draft (the untranslated line is a second `role="note"` under the `<h1>`, and
 * the drafts are where a long German or Polish word first meets the layout), and on the help page
 * in the right-to-left pseudo-locale (spec 041 §7 "RTL"). The imprint, terms and privacy have no
 * URL until the trader identity is complete (AC-2), so their component-level check is axe over
 * `/dev/components/trader-identity/{doc}`: the real view model and component under a fixture
 * company that completes it. Their page-level run on the real URLs (`en` plus `/de/impressum`) is
 * a step of the flip checklist in `docs/runbooks/info-and-legal-pages.md` (AC-28).
 *
 * Both fixture surfaces exist only where `ENABLE_DEV_UI` / `ENABLE_PSEUDO_LOCALES` are on: locally
 * and on the protected preview, never in production. A 404 means the target is missing the
 * variable, which is why the status is asserted before the audit.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { atRest } from "../support/at-rest.ts";

const BLOCKING = new Set(["serious", "critical"]);

/** The seven `en` pages that exist before registration (spec 041 §2's table). */
const EN_PAGES = [
  "/en/how-it-works",
  "/en/guarantee",
  "/en/help",
  "/en/about",
  "/en/delivery",
  "/en/legal/cookies",
  "/en/legal/cancellation",
] as const;

const DRAFTS = ["/de/hilfe", "/pl/informacje-prawne/cookies"] as const;

const RTL = ["/ar-XB/help"] as const;

const GATED_VIEWS = [
  "/dev/components/trader-identity/imprint",
  "/dev/components/trader-identity/terms",
  "/dev/components/trader-identity/privacy",
] as const;

async function audit(
  page: import("@playwright/test").Page,
): Promise<{ id: string; impact: string | null | undefined }[]> {
  await atRest(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map((violation) => ({ id: violation.id, impact: violation.impact }));
}

for (const path of [...EN_PAGES, ...DRAFTS, ...RTL]) {
  test(`${path} has no serious or critical violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; for /ar-XB, is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);
    expect(await audit(page), path).toEqual([]);
  });
}

for (const path of GATED_VIEWS) {
  test(`${path} (registered fixture) has no serious or critical violations`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_DEV_UI=true on the target?`,
    ).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await audit(page), path).toEqual([]);
  });
}
