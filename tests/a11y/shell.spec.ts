/**
 * T-25 / AC-25 (TASK-035; replaces the single-URL run of T-18 / AC-17, TASK-008): axe reports
 * **zero** serious or critical violations, with **no exception list**, and every document has a
 * non-empty localised `<title>`.
 *
 * The exception that used to live here is the point of this file. TASK-008 shipped
 * `EXPECTED_PHASE_0_VIOLATIONS = ["document-title"]` as an *equality* assertion — the shell had no
 * copy at all, so it had no title, and spec 001 §7 forbade adding an English one. That made the
 * exception self-clearing: the moment a document got a title, the equality failed and the list had
 * to go. TASK-035 gives every document a localised title (WCAG 2.4.2 Page Titled), so the list is
 * deleted and the assertion is now simply "nothing serious or critical".
 *
 * Moderate and minor findings are attached to the report but do not fail the run while the
 * templates are unstyled placeholders; spec 004 raises the bar to the full WCAG 2.1 AA rule set on
 * real templates (`plan/07` §8).
 *
 * URL set: `/` (x-default chooser), `/en`, `/pl` and `/ar-XB` per AC-25, plus `/en-XA` and the two
 * 404 documents, which are the ones most likely to lose their title when the routing changes.
 *
 * The two pseudo-locale URLs arrive with TASK-042, and they are audited for a reason beyond
 * completing AC-25's list: `/ar-XB` is the only right-to-left document in the repository, so it is
 * the only place axe can check that reading order, `lang`/`dir` agreement and the switcher's
 * `lang`-annotated links survive `dir="rtl"` (§8 "`dir` is correct so RTL reading order is
 * announced correctly"); and `/en-XA`'s expanded strings are what catch a name that only fits
 * because English is short. Both exist only where `ENABLE_PSEUDO_LOCALES=true` — locally and on
 * the protected preview these suites run against (§13 Q6) — so a 404 on either means the target is
 * missing the variable, not that the document regressed.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

/** `{ path, expected status }` — a 404 document is audited exactly like a 200 one. */
const AUDITED = [
  { path: "/", status: 200 },
  { path: "/en", status: 200 },
  { path: "/pl", status: 200 },
  { path: "/ar-XB", status: 200 },
  { path: "/en-XA", status: 200 },
  { path: "/en/does-not-exist", status: 404 },
  { path: "/nope", status: 404 },
] as const;

for (const { path, status } of AUDITED) {
  test(`${path} has no serious or critical accessibility violations`, async ({
    page,
  }, testInfo) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(status);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach(`axe-results${path.replaceAll("/", "_")}.json`, {
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

    // No exception list, by design: see the header.
    expect(blocking).toEqual([]);
  });

  test(`${path} has a non-empty title (WCAG 2.4.2)`, async ({ page }) => {
    await page.goto(path);

    expect((await page.title()).trim().length).toBeGreaterThan(0);
  });
}
