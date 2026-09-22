/**
 * axe on the country category (spec 008 AC-26, T-26; TASK-110 — the populated state, which is the
 * only state this page type has: it exists only where six products do, so the empty branch has no
 * URL to be audited at).
 *
 * Zero serious or critical violations, **with no exception list**, in every locale the page exists
 * in and in the right-to-left pseudo-locale — where the page is the English catalogue inside
 * pseudo chrome, which is what an RTL reading has to be audited against before the first RTL
 * launch. `de` and `pl` are absent because the page is: no authored category slug, no URL
 * (§13 Q10), asserted as a 404 in `tests/e2e/country-category.spec.ts`.
 *
 * The structures this file exists for are the ones §5.3 names plus the one this page type adds:
 * one `<h1>`, a grid that is a `<ul>` with an accessible name carrying the count, a card that is
 * an `<article>` whose heading is the product name and whose price is adjacent text, the
 * breadcrumb's `nav`/`aria-current` at five levels, and the **sibling chip row** — a labelled
 * `<nav>` whose current chip is marked with `aria-current="page"` and is not a link to itself.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/poland/flowers/roses",
  "/en-gb/poland/flowers/roses",
  "/ar-XB/poland/flowers/roses",
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
