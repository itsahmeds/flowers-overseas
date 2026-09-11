/**
 * T-28 / AC-26 for the locale home's new surfaces (TASK-052): zero serious or critical axe
 * violations, with **no exception list**, on the hero, the finder and the proof row — in every
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

  test(`${path} finder with the type-ahead open has no serious or critical violations`, async ({
    page,
  }) => {
    await page.goto(path);
    // The prefix is read from the document rather than written here, because a locale's
    // destination names are its own: `de`/`pl` are machine drafts of the English names and
    // `ar-XB` wraps every string in direction marks, so a hard-coded "p" matches in some
    // locales and nothing in others.
    const first = await page
      .locator("datalist#finder-country-options option")
      .first()
      .getAttribute("value");
    await page.locator("#finder-country").fill((first ?? "").slice(0, 3));
    await expect(page.locator("[data-fo-finder-matches]")).toBeVisible();

    expect(await audit(page)).toEqual([]);
  });
}

test("every finder control clears the 44 px tap-target floor (§5.3)", async ({
  page,
}) => {
  await page.goto("/en");

  for (const selector of [
    "#finder-country",
    "#finder-town",
    "#finder-date",
    '[data-fo-finder-form] button[type="submit"]',
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(44);
  }

  await page.locator("#finder-country").fill("pol");
  const option = await page
    .locator("[data-fo-finder-matches] button")
    .first()
    .boundingBox();
  expect(option?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("the country field is described by one sentence, not by the whole section", async ({
  page,
}) => {
  await page.goto("/en");

  // `/review 40`, inherited by TASK-053: the description used to be the destination section, so
  // every focus of the field read seven names, seven state words and the onboarding line — about
  // 200 words. It is now a purpose-written `sr-only` summary built from the same registry.
  const describedBy = await page
    .locator("#finder-country")
    .getAttribute("aria-describedby");
  expect(describedBy).toBe("finder-destinations-summary");

  const summary = page.locator("#finder-destinations-summary");
  await expect(summary).toHaveCount(1);
  const sentence = await summary.textContent();
  expect((sentence ?? "").split(" ").length).toBeLessThan(40);
  expect(sentence).toContain("Poland");
  // The section itself is still on the page and still the `Continue` target.
  await expect(page.locator("#destinations")).toBeVisible();
});

test("every section of the home is a named region with one heading", async ({
  page,
}) => {
  await page.goto("/en");

  for (const selector of [
    "[data-fo-occasion-dates]",
    "[data-fo-occasions]",
    "[data-fo-how-it-works]",
    "[data-fo-faq]",
    "[data-fo-trust-strip]",
    // TASK-054's two rendered gated sections. (`ReviewsSection` renders nothing in Phase 0, so
    // there is no region to name — `tests/e2e/home.spec.ts` asserts its absence.)
    "[data-fo-trending]",
    "[data-fo-destinations]",
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
  await expect(summaries).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const summary = summaries.nth(index);
    const box = await summary.boundingBox();
    expect(box?.height ?? 0, `summary ${String(index)}`).toBeGreaterThanOrEqual(
      44,
    );
  }

  // The platform's own disclosure: keyboard-operable with no script at all.
  const first = summaries.first();
  await first.focus();
  await first.press("Enter");
  await expect(page.locator("[data-fo-faq] details").first()).toHaveAttribute(
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
  await expect(markers).toHaveCount(5);

  const first = markers.first();
  await expect(first).toBeVisible();
  await expect(first).toHaveText("+");
  const box = await first.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  // Drawn at the inline end of the summary, not next to the question text.
  const summaryBox = await page
    .locator("[data-fo-faq] summary")
    .first()
    .boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(
    (summaryBox?.x ?? 0) + (summaryBox?.width ?? 0) - 4,
  );

  // Tailwind v4 rotates with the `rotate` property, not a `transform` matrix.
  expect(await first.evaluate((node) => getComputedStyle(node).rotate)).toBe(
    "none",
  );
  await page.locator("[data-fo-faq] summary").first().click();
  await expect(page.locator("[data-fo-faq] details[open]")).toHaveCount(1);
  await expect
    .poll(async () => first.evaluate((node) => getComputedStyle(node).rotate))
    .toBe("45deg");
});
