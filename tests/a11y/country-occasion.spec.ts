/**
 * axe on the country occasion (spec 008 AC-26, T-26; TASK-111 — the populated state, which is the
 * page type's only state: it exists only where six deliverable products do, so the empty cell of
 * §5.3 is unreachable).
 *
 * Zero serious or critical violations, **with no exception list**, in the two locales that have
 * the page today and in the right-to-left pseudo-locale — where it is the English catalogue inside
 * pseudo chrome, which is what an RTL reading has to be audited against before the first RTL
 * launch. `de` and `pl` have no authored occasion slug yet (TASK-106), so they have no URL to
 * audit; `tests/e2e/country-occasion.spec.ts` asserts they 404.
 *
 * The new structures this file exists for: the dated line beside the `h1`, the sibling chip row as
 * a labelled `<nav>`, and the six-crumb breadcrumb whose middle crumbs are text while their link
 * ids are unpublished.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/poland/occasions/mothers-day",
  "/en-gb/poland/occasions/mothers-day",
  "/ar-XB/poland/occasions/mothers-day",
] as const;

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
  test(`${path} has no serious or critical violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(await audit(page), path).toEqual([]);
  });
}
