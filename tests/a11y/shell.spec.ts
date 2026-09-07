/**
 * T-18 (a11y half) / AC-17, spec 001 §8 "Accessibility" (TASK-008): axe reports zero serious or
 * critical violations on `/`, with one documented Phase 0 exception.
 *
 * Moderate and minor findings are attached to the report but do not fail the run in Phase 0; the
 * shell has no content to audit. Spec 004 raises the bar to the full WCAG 2.1 AA rule set on real
 * templates (plan/07 §8).
 *
 * The exception: axe reports `document-title` (impact `serious`) on the placeholder shell,
 * because spec 001 §5.3 ships it with **no copy at all** — no `title` — and §7 states that
 * `<html lang="en">` is "the one place a locale literal exists" in 001, so an English `<title>`
 * cannot be added here without contradicting the spec. Spec 003 adds the localised title.
 * `EXPECTED_PHASE_0_VIOLATIONS` is therefore asserted *exactly*, not merely ignored: the moment
 * a title exists (or any other serious/critical finding appears) this test fails and the
 * exception has to be removed. Flagged to the reviewer in the TASK-008 PR.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

/** Removed by spec 003 when the shell gets a localised `<title>` (see the header). */
const EXPECTED_PHASE_0_VIOLATIONS = ["document-title"];

test("/ has no serious or critical accessibility violations", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach("axe-results.json", {
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

  expect(blocking).toEqual(EXPECTED_PHASE_0_VIOLATIONS);
});
