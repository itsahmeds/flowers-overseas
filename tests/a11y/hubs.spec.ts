/**
 * axe on the two destination-less hubs (spec 008 AC-26, T-26; TASK-112).
 *
 * Zero serious or critical violations, **with no exception list**, on both hub types and in the
 * right-to-left pseudo-locale — where the page is the English catalogue inside pseudo chrome,
 * which is what an RTL reading has to be audited against before the first RTL launch.
 *
 * `de` and `pl` are not audited **because they have no hub**: a machine-drafted copy row carries no
 * slug, so those URLs 404 (§13 Q10), and auditing a 404 would assert nothing. They join this list
 * with TASK-106's authored slugs.
 *
 * The structures this file exists for are the ones §5.3 names for a hub: one `<h1>`, a grid that is
 * a `<ul>` with an accessible name carrying the count, a card that is an `<article>` whose heading
 * is the product name, the breadcrumb's `nav`/`aria-current`, and the **captioned date table with
 * column and row scopes** — a reference a screen reader has to be able to walk (AC-11).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/flowers/roses",
  "/en-gb/flowers/roses",
  "/en/occasions/mothers-day",
  "/en-gb/occasions/mothers-day",
  // An evergreen hub: the same page with no date table at all (§14 A1).
  "/en/occasions/birthday",
  "/ar-XB/flowers/roses",
  "/ar-XB/occasions/mothers-day",
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
