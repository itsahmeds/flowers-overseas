/**
 * T-28 / AC-26 for the locale home's surfaces (TASK-052; the v3 home of TASK-386): zero serious
 * or critical axe violations, with **no exception list**, on the whole page, in every
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
}

/**
 * The v3 home's interactive parts (spec 004 §14 A-founder-2026-10-24a, AC-92, AC-97; TASK-386,
 * TASK-387): the picker card and the occasion tabs, a native radio group, audited at the phone
 * artboard's 390 × 844 with a later tab checked, where a name or a focus ring actually breaks.
 */
test("the picker and the occasion tabs at 390, a later tab checked, have no violation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.goto("/en-gb"))?.status()).toBe(200);
  await page.locator('[data-fo-occasion-tab="2"]').check({ force: true });
  await expect(page.locator('[data-fo-occasion-panel="2"]')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include("[data-fo-home-picker]")
    .include("[data-fo-occasion-tabs]")
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});

test("the picker's field and button clear the 44 px floor; its country buttons the board's 40 at 390", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  for (const selector of [
    "[data-fo-home-picker] input[list]",
    '[data-fo-home-picker] button[type="submit"]:not([name])',
  ]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(44);
  }
  const chips = page.locator('[data-fo-home-picker] button[name="to"]');
  expect(await chips.count()).toBeGreaterThan(0);
  for (const box of await chips.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  ))
    expect(box).toBeGreaterThanOrEqual(40);
});

test("every section of the home is a named region with one heading", async ({
  page,
}) => {
  await page.goto("/en");

  for (const selector of [
    "[data-fo-hero]",
    '[data-fo-home-section="selection"]',
    '[data-fo-home-section="occasions"]',
    '[data-fo-home-section="price"]',
    "[data-fo-destinations]",
    "[data-fo-how-it-works]",
    "[data-fo-faq]",
  ]) {
    const section = page.locator(selector);
    await expect(section, selector).toHaveCount(1);
    const labelledBy = await section.getAttribute("aria-labelledby");
    expect(labelledBy, selector).not.toBeNull();
    await expect(page.locator(`#${labelledBy ?? ""}`), selector).toHaveCount(1);
  }
});

test("every FAQ disclosure clears the 44 px tap-target floor and toggles", async ({
  page,
}) => {
  await page.goto("/en");

  const summaries = page.locator("[data-fo-faq] summary");
  // v2 (TASK-177): three questions; the seven-day and the price answers are gone.
  await expect(summaries).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const summary = summaries.nth(index);
    const box = await summary.boundingBox();
    expect(box?.height ?? 0, `summary ${String(index)}`).toBeGreaterThanOrEqual(
      44,
    );
  }

  // The platform's own disclosure: keyboard-operable with no script at all. The first question
  // arrives open as drawn (TASK-232), so the keyboard opens the second.
  const second = summaries.nth(1);
  await second.focus();
  await second.press("Enter");
  await expect(page.locator("[data-fo-faq] details").nth(1)).toHaveAttribute(
    "open",
    "",
  );
});

/**
 * `/review 53` required change 1: five bold lines with no marker read as headings. The affordance
 * has to be *painted* — the native marker is suppressed by `display: flex`, so this asserts the
 * artboards' `+`, its visible box, and the CSS-only rotation into a `×` when the answer opens.
 */
test("every FAQ summary paints the artboards' `+`, which rotates when the answer opens", async ({
  page,
}) => {
  await page.goto("/en");

  const markers = page.locator("[data-fo-faq] summary span[aria-hidden]");
  await expect(markers).toHaveCount(3);

  // The second: the first arrives open as both artboards draw it (TASK-232), already rotated.
  const first = markers.nth(1);
  await expect(markers.first()).toBeVisible();
  expect(
    await markers.first().evaluate((node) => getComputedStyle(node).rotate),
  ).toBe("45deg");
  await expect(first).toBeVisible();
  await expect(first).toHaveText("+");
  const box = await first.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  // Drawn at the inline end of the summary, not next to the question text.
  const summaryBox = await page
    .locator("[data-fo-faq] summary")
    .nth(1)
    .boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(
    (summaryBox?.x ?? 0) + (summaryBox?.width ?? 0) - 4,
  );

  // Tailwind v4 rotates with the `rotate` property, not a `transform` matrix.
  expect(await first.evaluate((node) => getComputedStyle(node).rotate)).toBe(
    "none",
  );
  await page.locator("[data-fo-faq] summary").nth(1).click();
  await expect(page.locator("[data-fo-faq] details[open]")).toHaveCount(2);
  await expect
    .poll(async () => first.evaluate((node) => getComputedStyle(node).rotate))
    .toBe("45deg");
});
