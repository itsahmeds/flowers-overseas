/**
 * AC-26's sixth surface, early (TASK-045; the full eight-URL set and the `continue-on-error`
 * removal are TASK-056's): axe over `/dev/components`, which is every component in every state at
 * once.
 *
 * This is the reason the gallery exists rather than Storybook (§2): one axe run covers the disabled
 * button, the invalid field, the empty photo slot and the focused skip link — states no Phase-0
 * page reaches, and therefore states the four locale homes cannot audit.
 *
 * The route exists only where `ENABLE_DEV_UI=true`: locally and on the protected preview these
 * suites run against, never in production, where the env schema refuses the flag. A 404 here means
 * the target is missing the variable, which is why the status is asserted before the audit.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const GALLERY = "/dev/components";

test("/dev/components has no serious or critical accessibility violations", async ({
  page,
}, testInfo) => {
  const response = await page.goto(GALLERY);
  expect(
    response?.status(),
    `${GALLERY} must be served; is ENABLE_DEV_UI=true on the target?`,
  ).toBe(200);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach("axe-results_dev_components.json", {
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

  // No exception list, by design (spec 003 killed the last one and it stays dead).
  expect(blocking).toEqual([]);
});

/**
 * The same audit at the mobile artboard width, **scoped to spec 008's listing section**
 * (TASK-108). Those primitives change shape between the two widths — the grid is 2-up at 390 and
 * 4-up at 1440, the toolbar wraps, the pagination wraps — and a reflowed layout is where a target
 * size, a focus order or a contrast pair breaks.
 *
 * It is scoped rather than full-page because the document-wide 390 px run reports one **existing**
 * serious violation that belongs to spec 004's chrome, not to this task: the header's utility
 * strip is `overflow-x-auto` below `md` and is not keyboard-focusable
 * (`scrollable-region-focusable`). Widening this test to the whole document would make TASK-108's
 * gate fail on TASK-048's markup; the finding is carried into the PR body for the chrome's owner
 * instead of being silently allow-listed here.
 *
 * `/ar-XB` is not audited here because the gallery has no locale variant: the RTL run over these
 * components arrives with the first page that renders them (spec 008 T-26).
 */
test("/dev/components: the listing section is clean at the mobile artboard width", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(GALLERY);
  expect(response?.status()).toBe(200);

  const results = await new AxeBuilder({ page })
    .include("section:has(> #listing-and-card-blocks)")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach("axe-results_dev_components_390.json", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });

  expect(
    results.violations
      .filter(
        (violation) =>
          typeof violation.impact === "string" &&
          BLOCKING_IMPACTS.has(violation.impact),
      )
      .map((violation) => violation.id)
      .sort(),
  ).toEqual([]);
});

test("/dev/components has a non-empty title (WCAG 2.4.2)", async ({ page }) => {
  await page.goto(GALLERY);
  expect((await page.title()).trim().length).toBeGreaterThan(0);
});
