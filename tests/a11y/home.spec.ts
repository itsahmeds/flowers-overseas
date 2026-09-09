/**
 * T-28 / AC-26 for the locale home's new surfaces (TASK-052): zero serious or critical axe
 * violations, with **no exception list**, on the hero, the finder and the proof row — in every
 * launch locale, in the right-to-left pseudo-locale, and in the **state no other suite reaches**:
 * the type-ahead open, with a filtered list of buttons under the country field and a live region
 * carrying the count.
 *
 * `tests/a11y/shell.spec.ts` audits these URLs in their default state and keeps doing so; what is
 * here is the interactive state, which is where a label, a name or a focus order actually breaks.
 * The finder is the first real form control on a public page (the footer's reminder signup is the
 * only other one), so it is also the first place `label`/`for`, `aria-describedby` and 44 px
 * targets are exercised on a page a buyer would see.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

/** The four launch locales plus the RTL pseudo-locale (AC-26's list, home half). */
const AUDITED = ["/en", "/en-gb", "/de", "/pl", "/ar-XB"] as const;

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
  test(`${path} home has no serious or critical violations`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);
    await expect(page.locator("[data-fo-hero]")).toHaveCount(1);

    expect(await audit(page)).toEqual([]);
  });

  test(`${path} finder with the type-ahead open has no serious or critical violations`, async ({
    page,
  }) => {
    await page.goto(path);
    // The prefix is read from the document rather than written here, because a locale's
    // destination names are its own: `de`/`pl` are machine drafts of the English names and
    // `ar-XB` wraps every string in direction marks, so a hard-coded "p" matches in some
    // locales and nothing in others.
    const first = await page
      .locator("datalist#finder-country-options option")
      .first()
      .getAttribute("value");
    await page.locator("#finder-country").fill((first ?? "").slice(0, 3));
    await expect(page.locator("[data-fo-finder-matches]")).toBeVisible();

    expect(await audit(page)).toEqual([]);
  });
}

test("every finder control clears the 44 px tap-target floor (§5.3)", async ({
  page,
}) => {
  await page.goto("/en");

  for (const selector of [
    "#finder-country",
    "#finder-town",
    "#finder-date",
    '[data-fo-finder-form] button[type="submit"]',
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(44);
  }

  await page.locator("#finder-country").fill("pol");
  const option = await page
    .locator("[data-fo-finder-matches] button")
    .first()
    .boundingBox();
  expect(option?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("the country field is described by the destination list it points at", async ({
  page,
}) => {
  await page.goto("/en");

  const describedBy = await page
    .locator("#finder-country")
    .getAttribute("aria-describedby");
  expect(describedBy).toBe("destinations");
  await expect(page.locator("#destinations")).toBeVisible();
});
