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

import { atRest } from "../support/at-rest.ts";

const BLOCKING = new Set(["serious", "critical"]);

const AUDITED = [
  "/en/poland/occasions/mothers-day",
  "/en-gb/poland/occasions/mothers-day",
  "/ar-XB/poland/occasions/mothers-day",
] as const;

async function audit(
  page: import("@playwright/test").Page,
): Promise<{ id: string; impact: string | null | undefined }[]> {
  // axe reads the page a reader has scrolled, with the entrances played (TASK-194).
  await atRest(page);
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

/**
 * T-62's axe half (spec 004 §14 A-founder-2026-10-18c, AC-57; TASK-241): with N1 after the grid
 * below `md` and in the hero from `md` up, the three AC-57 URLs stay clean at a phone and a laptop
 * size, so the two renders of the note (one `display: none` in each band) leave no duplicate or
 * hidden-but-focusable structure behind.
 */
const NOTE_AUDITED = [
  "/en-gb/poland/occasions/mothers-day",
  "/de/polen/anlaesse/muttertag",
  "/en-gb/poland/occasions/birthday",
] as const;

for (const path of NOTE_AUDITED) {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ] as const) {
    test(`${path} at ${String(size.width)} × ${String(size.height)} has no serious or critical violations (T-62)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(await audit(page), path).toEqual([]);
    });
  }
}
