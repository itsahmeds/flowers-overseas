/**
 * axe on the country shop root (spec 008 AC-26, T-26; TASK-109 — the populated state of the one
 * page type this task ships; the empty state is audited on `/dev/components` by
 * `tests/a11y/dev-components.spec.ts`, where TASK-108's `ListingEmpty` renders).
 *
 * Zero serious or critical violations, **with no exception list**, in every launch locale and in
 * the right-to-left pseudo-locale — where the page is the English catalogue inside pseudo chrome,
 * which is what an RTL reading has to be audited against before the first RTL launch.
 *
 * The new structures this file exists for are the ones spec 008 §5.3 names: one `<h1>`, a grid
 * that is a `<ul>` with an accessible name carrying the count, a card that is an `<article>` whose
 * heading is the product name and whose price is adjacent text, the breadcrumb's
 * `nav`/`aria-current`, and a captioned occasion table with column and row scopes.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/poland/flowers",
  "/en-gb/poland/flowers",
  "/de/polen/blumen",
  "/pl/polska/kwiaty",
  "/ar-XB/poland/flowers",
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
