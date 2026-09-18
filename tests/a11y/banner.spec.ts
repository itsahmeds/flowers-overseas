/**
 * AC-25's rule set with the locale suggestion **popup** on screen, plus the four behaviours a
 * modal dialog owes a keyboard visitor (spec 003 §8, §14 A14; TASK-041, TASK-119).
 *
 * `tests/a11y/shell.spec.ts` audits the shipped documents; nothing in it can reach this dialog,
 * because it only appears for a visitor whose `navigator.languages` name a *different* launch
 * locale. This file forces exactly that state and re-runs axe with the same rule set and the same
 * "no exception list" contract, so the one modal surface the site has is held to the standard the
 * rest of the shell is.
 *
 * Why the dialog is the interesting case: it is inserted after hydration, opened into the top
 * layer, labelled by its own headline, and it takes focus — which is the one thing the banner it
 * replaced was forbidden to do. A modal that takes focus owes four things back (WCAG 2.1.2, 2.4.3,
 * 2.4.11): a trap that cannot be tabbed out of, a way out from the keyboard alone, focus returned
 * where it came from, and a visible focus indicator. All four are the browser's own `<dialog>`
 * behaviour here rather than hand-written ARIA, and all four are asserted below — because
 * "the browser does it" is exactly the kind of claim that stops being true after a restyle
 * (`display: contents`, a stray `inert`, a `::backdrop` that swallows the ring).
 *
 * `dir`/RTL is not asserted here — `ar-XB` (TASK-042) is where a mirrored layout becomes real.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BANNER = '[data-fo-banner="shown"]';
const CONTINUE = '[data-fo-banner-action="continue"]';
const STAY = '[data-fo-banner-action="stay"]';
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

test.use({ locale: "de-DE" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => ["de-DE", "de"],
    });
  });
});

test("/en with the suggestion dialog open has no serious or critical violations", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/en");
  expect(response?.status()).toBe(200);

  await expect(page.locator(BANNER)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach("axe-results_en_dialog.json", {
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

  expect(blocking).toEqual([]);
});

test("is a modal dialog named by its own headline, in the language it offers", async ({
  page,
}) => {
  await page.goto("/en");
  const dialog = page.locator(BANNER);
  await expect(dialog).toBeVisible();

  // `:modal` is the browser's own answer to "is this in the top layer with the rest inert" — a
  // stronger assertion than `role="dialog"`, which any `<div>` can claim.
  expect(
    await page.evaluate(() =>
      document.querySelector<HTMLDialogElement>("dialog")?.matches(":modal"),
    ),
  ).toBe(true);

  const labelledBy = await dialog.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  const headline = page.locator(`#${labelledBy!}`);
  await expect(headline).toBeVisible();
  // WCAG 3.1.2: the offer is written in German, so it is marked as German.
  await expect(headline).toHaveAttribute("lang", "de");
  await expect(page.locator(CONTINUE)).toHaveAttribute("lang", "de");
});

test("moves focus to the offer, traps it, and gives it back on close (2.1.2, 2.4.3)", async ({
  page,
}) => {
  await page.goto("/en");
  await expect(page.locator(BANNER)).toBeVisible();

  const action = (): Promise<string | null | undefined> =>
    page.evaluate(() =>
      document.activeElement?.getAttribute("data-fo-banner-action"),
    );

  // Focus starts on the primary action…
  expect(await action()).toBe("continue");

  // …and tabbing cycles between the two controls without ever leaving the dialog. Four presses
  // is twice round a two-control trap, which is what catches a trap that leaks on the second lap.
  const reached: (string | null | undefined)[] = [];
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("Tab");
    reached.push(await action());
  }
  expect(
    reached.every((value) => value === "continue" || value === "stay"),
  ).toBe(true);
  expect(new Set(reached).size).toBe(2);

  // `Esc` closes it from the keyboard alone (2.1.2's "way out"), and focus lands back in the page
  // rather than on a detached node.
  await page.keyboard.press("Escape");
  await expect(page.locator(BANNER)).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement?.tagName.toLowerCase()),
  ).not.toBe("dialog");
  expect(
    await page.evaluate(
      () =>
        document.activeElement !== null &&
        document.body.contains(document.activeElement),
    ),
  ).toBe(true);
});

test("both controls keep a visible focus indicator over the backdrop (2.4.11)", async ({
  page,
}) => {
  await page.goto("/en");
  await expect(page.locator(BANNER)).toBeVisible();

  for (const selector of [CONTINUE, STAY]) {
    await page.locator(selector).focus();
    const outline = await page.locator(selector).evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        colour: style.outlineColor,
      };
    });
    expect(outline.style, selector).not.toBe("none");
    expect(Number.parseFloat(outline.width), selector).toBeGreaterThanOrEqual(
      1,
    );
    expect(outline.colour, selector).not.toBe("rgba(0, 0, 0, 0)");
  }
});

test("leaves the page behind readable: the sheet covers at most 35 % of a phone", async ({
  page,
}) => {
  // Google's intrusive-interstitial rule for a first visit from search, which is a ranking
  // constraint and therefore priority #1 in `CLAUDE.md` — asserted as geometry, not as a class.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");

  const dialog = page.locator(BANNER);
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.height / viewport!.height).toBeLessThanOrEqual(0.35);
  // …and it sits at the bottom of the viewport, so the page's own start is what stays visible.
  expect(box!.y + box!.height).toBeGreaterThan(viewport!.height * 0.6);
});
