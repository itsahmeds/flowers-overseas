/**
 * AC-26 over the colophon (TASK-049): axe against the footer subtree of a locale document, in the
 * two locales whose scripts differ most from the source — `pl` (diacritics, longer strings) and
 * `ar-XB` (the only right-to-left document in the repository).
 *
 * The whole-document runs stay in `tests/a11y/shell.spec.ts`; this file scopes the analysis to
 * `contentinfo` so a finding names the footer rather than the page it happens to be on, and adds
 * the two structural assertions axe cannot make on its own: exactly one `contentinfo`, and every
 * navigation landmark inside it accessibly named (`plan/07` §8, §5.3's landmark rule).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const AUDITED = ["/pl", "/ar-XB"] as const;

for (const path of AUDITED) {
  test(`${path} footer has no serious or critical violations`, async ({
    page,
  }, testInfo) => {
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);

    const results = await new AxeBuilder({ page })
      .include("footer")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach(`axe-footer${path.replaceAll("/", "_")}.json`, {
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

  test(`${path} has one named contentinfo and named footer navs`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);

    const navs = page.getByRole("contentinfo").locator("nav");
    const count = await navs.count();
    // Two since TASK-173 (spec 004 §14 A20): the `Sending` column, the one with pages behind it,
    // and the language list. `Company` and the legal row have no entry with a page, so they are
    // not drawn — and an empty, named `navigation` landmark is exactly what this test forbids.
    expect(count).toBe(2);
    for (let index = 0; index < count; index += 1) {
      const nav = navs.nth(index);
      const named =
        (await nav.getAttribute("aria-label")) ??
        (await nav.getAttribute("aria-labelledby"));
      expect(named, `nav ${String(index)} is unnamed`).toBeTruthy();
    }

    // No field in the footer at all: the reminder form stored nothing and is not drawn (spec 004
    // §14 A20, A21 clause 1; TASK-176), so there is no unlabelled control to find either.
    const footer = page.getByRole("contentinfo");
    await expect(footer.locator("form")).toHaveCount(0);
    await expect(footer.locator("input, select, textarea")).toHaveCount(0);
  });
}
