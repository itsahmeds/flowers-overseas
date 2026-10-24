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
import { type Page, expect, test } from "@playwright/test";

import { enhanceSentence, sentenceTrigger } from "../support/sentence.ts";

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
 * AC-49 on the home (TASK-284 item 5A): at the phone artboard's 390 × 844, Popular choices is a
 * sideways scroller, and axe finds nothing in it at any impact — in particular no
 * `scrollable-region-focusable`, which is what a scroller with no tab stop inside it would raise.
 */
test("Popular choices at 390 is a scroller axe finds nothing in (AC-49)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.goto("/en-gb"))?.status()).toBe(200);
  const row = page.locator("[data-fo-trending] ul");
  expect(await row.evaluate((node) => getComputedStyle(node).overflowX)).toBe(
    "auto",
  );
  const results = await new AxeBuilder({ page })
    .include("[data-fo-trending]")
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
  expect(
    results.passes.map((pass) => pass.id),
    "the scroller rule ran and passed",
  ).toContain("scrollable-region-focusable");
});

test("every sentence-picker control clears the 44 px tap-target floor (§5.3)", async ({
  page,
}) => {
  await page.goto("/en");

  for (const selector of [
    "#send-who",
    "#send-country",
    "#send-occasion",
    '[data-fo-sentence] button[type="submit"]',
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(44);
  }
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
    // v2: the promise band is AC-10's trust strip (TASK-177).
    "[data-fo-trust-strip]",
    "[data-fo-hero]",
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

/**
 * T-74 / AC-68 (spec 004 §14 A-founder-2026-10-21d; TASK-326): the sentence's own listbox on a
 * mouse (this project is Desktop Chrome, a fine pointer). Axe over `/en` with the country listbox
 * open, with the who listbox open, and with both closed: nothing serious or critical, and none of
 * the four rules a listbox breaks first. Then the focus rings, by keyboard.
 */
test.describe("the sentence listbox (AC-68, T-74)", () => {
  const LISTBOX_RULES = [
    "aria-hidden-focus",
    "aria-valid-attr-value",
    "aria-required-children",
    "nested-interactive",
  ];

  async function auditListbox(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    return results.violations
      .filter(
        (violation) =>
          BLOCKING.has(violation.impact ?? "") ||
          LISTBOX_RULES.includes(violation.id),
      )
      .map((violation) => `${violation.id} (${String(violation.impact)})`);
  }

  async function openByKeyboard(
    page: Page,
    field: "who" | "country",
  ): Promise<void> {
    await sentenceTrigger(page, field).focus();
    await page.keyboard.press("ArrowDown");
    await expect(sentenceTrigger(page, field)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Axe reads a panel mid-fade as low-contrast text: let motion 10 finish.
    await page.waitForTimeout(400);
  }

  test("closed, country open and who open: no serious or critical violation, none of the listbox rules", async ({
    page,
  }) => {
    await page.goto("/en");
    await enhanceSentence(page);
    expect(await auditListbox(page), "closed").toEqual([]);

    await openByKeyboard(page, "country");
    expect(await auditListbox(page), "country open").toEqual([]);
    await page.keyboard.press("Escape");

    await openByKeyboard(page, "who");
    expect(await auditListbox(page), "who open").toEqual([]);
  });

  test("the focused option and the focused trigger draw the focus ring, 2 px or more in the focus colour", async ({
    page,
  }) => {
    await page.goto("/en");
    await enhanceSentence(page);
    const focusColour = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-focus)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    const ring = (): Promise<[string, number, string]> =>
      page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return [
          style.outlineStyle,
          Number.parseFloat(style.outlineWidth),
          style.outlineColor,
        ];
      });

    await openByKeyboard(page, "country");
    const option = await ring();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("role")),
    ).toBe("option");
    expect(option[0]).not.toBe("none");
    expect(option[1]).toBeGreaterThanOrEqual(2);
    expect(option[2]).toBe(focusColour);

    await page.keyboard.press("Escape");
    await expect(sentenceTrigger(page, "country")).toBeFocused();
    const trigger = await ring();
    expect(trigger[0]).not.toBe("none");
    expect(trigger[1]).toBeGreaterThanOrEqual(2);
    expect(trigger[2]).toBe(focusColour);
  });
});
