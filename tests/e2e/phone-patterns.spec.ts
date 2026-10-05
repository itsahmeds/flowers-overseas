/**
 * T-54 (AC-49): segmented controls and horizontal scrollers, on the gallery's "Phone patterns"
 * section (spec 004 §14 A24 clause 4 (b), (c); TASK-195). The pages that use them (TASK-187,
 * TASK-188, TASK-197) run the same assertions on their own rows.
 *
 * Watched red: a scroller set to `overflow: hidden` fails the overflow case and the "last item
 * reachable" case; a segmented control without `checked`/`aria-current` fails the selection case.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";
const SECTION = "#phone-patterns";
const PHONE = { width: 390, height: 844 } as const;

test.describe("T-54: segmented controls and horizontal scrollers (AC-49)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    expect((await page.goto(GALLERY))?.status()).toBe(200);
    await page.locator(SECTION).scrollIntoViewIfNeeded();
  });

  test("a segmented control is a fieldset with a legend and native radios or links, the selection exposed, each segment ≥ 44 px", async ({
    page,
  }) => {
    const radios = page.locator(`${SECTION} [data-fo-segmented="radios"]`);
    await expect(radios).toHaveCount(1);
    expect(await radios.evaluate((node) => node.tagName)).toBe("FIELDSET");
    await expect(radios.locator("> legend")).toHaveCount(1);
    await expect(radios.locator('input[type="radio"]')).toHaveCount(3);
    await expect(radios.locator('input[type="radio"]:checked')).toHaveCount(1);
    await expect(radios.locator('input[value="medium"]')).toBeChecked();

    const links = page.locator(`${SECTION} [data-fo-segmented="links"]`);
    await expect(links.locator("a")).toHaveCount(3);
    await expect(links.locator('a[aria-current="true"]')).toHaveCount(1);
    await expect(links.locator('a[aria-current="true"]')).toHaveAttribute(
      "href",
      "#seg-medium",
    );

    for (const segment of await page
      .locator(`${SECTION} [data-fo-segment]`)
      .all()) {
      expect(
        Math.round((await segment.boundingBox())?.height ?? 0),
      ).toBeGreaterThanOrEqual(44);
    }

    // It works without script: choosing another segment checks its radio.
    await radios.locator('[data-fo-segment="large"]').click();
    await expect(radios.locator('input[value="large"]')).toBeChecked();
    await expect(radios.locator('input[type="radio"]:checked')).toHaveCount(1);
  });

  test("every scroller scrolls, its last item comes into view by keyboard and by touch, and one with no focusable item is focusable and named", async ({
    page,
  }) => {
    const scrollers = page.locator(`${SECTION} [data-fo-scroller]`);
    await expect(scrollers).toHaveCount(2);
    for (const scroller of await scrollers.all()) {
      const state = await scroller.evaluate((node) => ({
        overflowX: getComputedStyle(node).overflowX,
        scrolls: node.scrollWidth > node.clientWidth,
        name: node.getAttribute("aria-label") ?? "",
        focusableChild:
          node.querySelector("a[href], button, input, [tabindex]") !== null,
        tabindex: node.getAttribute("tabindex"),
        roledescription: node.querySelector("[aria-roledescription]") !== null,
      }));
      expect(["auto", "scroll"]).toContain(state.overflowX);
      expect(state.scrolls, state.name).toBe(true);
      expect(state.name).not.toBe("");
      expect(state.roledescription).toBe(false);
      if (!state.focusableChild) expect(state.tabindex).toBe("0");

      const last = scroller.locator(":scope > li").last();
      await expect(last).not.toBeInViewport({ ratio: 1 });
      if (state.focusableChild) {
        // Keyboard: Tab to the last item's link scrolls it into view.
        await scroller.locator(":scope > li:last-child a").focus();
      } else {
        // Keyboard: the row takes focus, and End scrolls it to its last item.
        await scroller.focus();
        await page.keyboard.press("End");
      }
      await expect(last).toBeInViewport({ ratio: 1 });

      // Touch: a swipe is a scroll of the row; scrolling it back and to its end shows the item.
      await scroller.evaluate((node) => {
        node.scrollLeft = 0;
      });
      await expect(last).not.toBeInViewport({ ratio: 1 });
      await scroller.evaluate((node) => {
        node.scrollBy({ left: node.scrollWidth, behavior: "instant" });
      });
      await expect(last).toBeInViewport({ ratio: 1 });
    }
  });

  test("the page never scrolls sideways, and gallery dots are in-page links with 24 × 24 targets", async ({
    page,
  }) => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBe(0);
    const dots = page.locator(`${SECTION} [data-fo-gallery-dots] a`);
    await expect(dots).toHaveCount(3);
    for (const dot of await dots.all()) {
      expect(await dot.getAttribute("href")).toMatch(/^#./u);
      const box = await dot.boundingBox();
      expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(24);
      expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(24);
    }
  });

  test("axe reports no `scrollable-region-focusable` violation, and nothing serious", async ({
    page,
  }) => {
    const results = await new AxeBuilder({ page })
      .include(SECTION)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();
    expect(
      results.violations.filter(
        (violation) =>
          violation.id === "scrollable-region-focusable" ||
          violation.impact === "serious" ||
          violation.impact === "critical",
      ),
    ).toEqual([]);
  });
});
