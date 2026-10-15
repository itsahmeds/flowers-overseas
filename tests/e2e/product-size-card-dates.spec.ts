/**
 * The product page after the 2026-10-14 site test: the size the buyer picks is the price shown
 * everywhere, the card section as the artboards draw it, and date chips that cannot be chosen look
 * it (TASK-228, TASK-229, TASK-230). On `/{locale}/poland/product/amber-hour`.
 *
 *  - **T-34, the JS-on case (spec 009 §14 A12, AC-31; spec 004 AC-48).** For every size, after a
 *    client-side change, the buy price, "The price" tier row, the total, the docked bar's price and
 *    caption equal the chosen segment's own printed price and label, and the equivalents line is
 *    the chosen size's own (it moves when the size does). At 1440 and at 390. Watched red: the bar
 *    price pinned to the default tier; the tier row reading another tier; the equivalents line left
 *    on the old size.
 *  - **T-56, browser half (spec 004 AC-51).** At 390: 199 letters and a family emoji read
 *    "200 / 200" and are kept; one more grapheme is refused. Watched red: the limit back at 400.
 *  - **AC-49 on the card (TASK-229).** A 90-letter word and a long link wrap inside the field and
 *    the card at 320, 360 and 390: `scrollWidth` equals the viewport. The card is upright, beside
 *    the field from `md`, grows with the message and shows all of it; the counter sits under the
 *    field, end-aligned with it. Watched red: the card rotated; `overflow-wrap` removed; the
 *    counter moved out of the field's column; a long message cut with no sign.
 *  - **T-39, browser half (spec 009 AC-35).** No delivery-facts block at 390, 768 and 1440.
 *  - **TASK-230 (spec 009 AC-7, AC-28; spec 004 AC-49).** Every disabled chip is muted (another
 *    ground than a selectable chip, a dashed edge) and never struck through; at 390 the date row's
 *    visible end never cuts a chip's words. Watched red: a disabled chip at full colour with the
 *    normal edge; the last chip's words cut at 390.
 *
 * No assertion pins a stem count, a tier key or the picker's notice wording (TASK-240, TASK-239).
 */
import { type Page, expect, test } from "@playwright/test";

const PDP = "/en-gb/poland/product/amber-hour";
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
const BAR = "[data-fo-action-bar]";
const SEGMENT = "[data-fo-pdp-buy] [data-fo-segment]";

test.beforeEach(({}, testInfo) => {
  // Every case sets its own viewport: measured once, in e2e-desktop.
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

async function open(page: Page, url: string = PDP): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

/** The visible text of the first match, trimmed, with every run of space as one. */
async function text(page: Page, selector: string): Promise<string> {
  const value = await page.locator(selector).first().textContent();
  return (value ?? "").replaceAll(/\s+/gu, " ").trim();
}

/** Wait until the page's one island has mounted (it fills the card counter's live count). */
async function hydrated(page: Page): Promise<void> {
  await page.locator("#pdp-card-message").focus();
  await page.keyboard.type("x");
  await expect(page.locator("#pdp-card-message-count")).toContainText("1");
  await page.keyboard.press("Backspace");
}

test.describe("T-34 (JS on): every figure of the size follows the size the buyer picks", () => {
  for (const viewport of [DESKTOP, PHONE]) {
    test(`at ${String(viewport.width)}: buy price, tier row, total, bar and equivalents line show the chosen size`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page);
      await hydrated(page);
      const segments = page.locator(SEGMENT);
      const count = await segments.count();
      expect(count).toBeGreaterThan(1);
      const lines = new Set<string>();
      // Every size in turn, then back to the first, so a figure that only moved once goes red.
      for (const index of [...Array(count).keys(), 0]) {
        const segment = segments.nth(index);
        await segment.click();
        await expect(segment.locator("input")).toBeChecked();
        const own = (await segment.locator("bdi").textContent())?.trim() ?? "";
        const label =
          (
            await segment.locator("[data-fo-tier-label]").textContent()
          )?.trim() ?? "";
        expect(own).toMatch(/\d/u);
        const where = `${String(viewport.width)} size ${String(index)}`;
        await expect(page.locator("[data-fo-pdp-price] bdi"), where).toHaveText(
          own,
        );
        await expect(
          page.locator('[data-fo-summary-row="tier"] dd bdi'),
          where,
        ).toHaveText(own);
        await expect(
          page.locator('[data-fo-summary-row="tier"] dt'),
          where,
        ).toHaveText(label);
        // Phase 0 selects no date, so the total is the size's own all-in price.
        await expect(page.locator("[data-fo-price-total]"), where).toHaveText(
          own,
        );
        await expect(
          page.locator(`${BAR} [data-fo-action-bar-price] strong`),
          where,
        ).toHaveText(own);
        await expect(
          page.locator(`${BAR} [data-fo-action-bar-price] small`),
          where,
        ).toHaveText(label);
        // Exactly one all-in amount in the buy price element, and the total is the polite live
        // region that announces it.
        await expect(page.locator("[data-fo-pdp-price] bdi")).toHaveCount(1);
        await expect(
          page.locator("[data-fo-price-total]").locator("xpath=.."),
        ).toHaveAttribute("aria-live", "polite");
        const line = await text(page, "[data-fo-price-equivalents]");
        expect(line, where).toMatch(/\d/u);
        expect(line, where).toBe(
          (
            (await segment
              .locator("input")
              .getAttribute("data-fo-say-equivalents")) ?? ""
          )
            .replaceAll(/\s+/gu, " ")
            .trim(),
        );
        lines.add(line);
      }
      // Each size converts its own price: as many lines as sizes.
      expect(lines.size).toBe(count);
    });
  }
});

test.describe("T-56 (browser half): one 200-grapheme card limit", () => {
  test("at 390: 199 letters and a family emoji read 200 of 200 and are kept; one more grapheme is refused", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page);
    const field = page.locator("#pdp-card-message");
    const counter = page.locator("#pdp-card-message-count");
    await expect(counter).toHaveText(/^0 \/ 200$/u);
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
    await field.fill(`${"a".repeat(199)}${family}`);
    await expect(counter).toHaveText(/^200 \/ 200$/u);
    await expect(field).toHaveValue(`${"a".repeat(199)}${family}`);
    await field.focus();
    await page.keyboard.press("End");
    await page.keyboard.type("b");
    await expect(field).toHaveValue(`${"a".repeat(199)}${family}`);
    await expect(counter).toHaveText(/^200 \/ 200$/u);
    // "ł" is one grapheme too.
    await field.fill("ł".repeat(200));
    await expect(counter).toHaveText(/^200 \/ 200$/u);
  });
});

test.describe("AC-49 and the artboards' card section (TASK-229)", () => {
  for (const width of [320, 360, 390]) {
    test(`at ${String(width)}: a 90-letter word and a long link wrap inside the field and the card, and nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      await hydrated(page);
      for (const message of [
        "W".repeat(90),
        "https://example.com/a-very-long-path/with-no-break-at-all/and-even-more-of-it/0123456789",
      ]) {
        await page.locator("#pdp-card-message").fill(message);
        await expect(page.locator("[data-fo-card-text]")).toHaveText(message);
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(widths.scroll, message).toBe(widths.viewport);
        const card = await page
          .locator("[data-fo-card-preview]")
          .evaluate((node) => node.getBoundingClientRect().right);
        expect(card, message).toBeLessThanOrEqual(width);
      }
    });
  }

  test("at 1440: the card is upright beside the field, grows with the message and shows all of it; the counter sits under the field, end-aligned", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await open(page);
    await hydrated(page);
    const box = (selector: string) =>
      page.locator(selector).evaluate((node) => {
        const b = node.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      });
    const field = await box("#pdp-card-message");
    const counter = await box("#pdp-card-message-count");
    const card = await box("[data-fo-card-preview]");
    // Upright: no rotation on the card or anything inside it.
    const transforms = await page
      .locator("[data-fo-card-preview], [data-fo-card-preview] *")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return `${style.transform}|${style.rotate}`;
        }),
      );
    for (const value of transforms) expect(value).toBe("none|none");
    // Beside the field, its top level with the field's, 200 px wide (`.pv-card`).
    expect(card.left).toBeGreaterThanOrEqual(field.right);
    expect(Math.abs(card.top - field.top)).toBeLessThanOrEqual(1);
    expect(Math.round(card.right - card.left)).toBe(200);
    // The counter is under the field, its end edge on the field's end edge.
    expect(counter.top).toBeGreaterThanOrEqual(field.bottom);
    expect(counter.top - field.bottom).toBeLessThanOrEqual(12);
    expect(Math.abs(counter.right - field.right)).toBeLessThanOrEqual(1);
    // A long message: the card grows and every line of it is visible.
    const before = card.bottom - card.top;
    const words = Array.from({ length: 40 }, (_, i) => `word${String(i)}`).join(
      " ",
    );
    await page.locator("#pdp-card-message").fill(words);
    await expect(page.locator("#pdp-card-message-count")).toContainText(
      String(words.length),
    );
    const grown = await box("[data-fo-card-preview]");
    expect(grown.bottom - grown.top).toBeGreaterThan(before);
    const clipped = await page
      .locator("[data-fo-card-text]")
      .evaluate((node) => {
        const own = node.getBoundingClientRect();
        let parent = node.parentElement;
        while (parent !== null) {
          const style = getComputedStyle(parent);
          if (style.overflow !== "visible" || style.overflowY !== "visible") {
            const b = parent.getBoundingClientRect();
            if (own.bottom > b.bottom + 0.5) return true;
          }
          parent = parent.parentElement;
        }
        return node.scrollHeight > node.clientHeight + 1;
      });
    expect(clipped).toBe(false);
  });
});

test.describe("T-39 (browser half): no delivery-facts block on the product page", () => {
  for (const width of [390, 768, 1440]) {
    test(`at ${String(width)}: no facts block and no facts heading`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await expect(page.locator("[data-fo-facts]")).toHaveCount(0);
      await expect(page.locator("[data-fo-pdp-facts]")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("Delivery facts");
    });
  }
});

test.describe("TASK-230: a date chip that cannot be chosen looks it", () => {
  test("every disabled chip is muted with a dashed edge and never struck through, beside its worded reason", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await open(page);
    const chips = page.locator("[data-fo-date-grid] label[data-fo-date]");
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
    const looks = await chips.evaluateAll((labels) =>
      labels.map((label) => {
        const style = getComputedStyle(label);
        const input = label.querySelector("input");
        const date = label.querySelector("b");
        return {
          disabled: input?.disabled ?? false,
          background: style.backgroundColor,
          border: style.borderTopStyle,
          strike:
            date === null ? "" : getComputedStyle(date).textDecorationLine,
        };
      }),
    );
    // The preview state closes every date (AC-8).
    expect(looks.every((look) => look.disabled)).toBe(true);
    const white = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--color-card)";
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    for (const look of looks) {
      expect(look.background).not.toBe(white);
      expect(look.border).toBe("dashed");
      expect(look.strike).not.toContain("line-through");
    }
    // The words stay: the Sunday rule is in a closed radio's name (AC-7, the existing case in
    // `product-page.spec.ts` asserts the rest).
    expect(
      await page
        .getByRole("radio", { name: /Sundays/u, disabled: true })
        .count(),
    ).toBeGreaterThan(0);
  });

  test("at 390: the date row's visible end never cuts a chip's words, and the page does not scroll sideways", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page);
    const cut = await page
      .locator("[data-fo-date-grid] [data-fo-scroller]")
      .evaluate((row) => {
        const edge = Math.min(
          row.getBoundingClientRect().right,
          window.innerWidth,
        );
        const found: string[] = [];
        for (const word of row.querySelectorAll("label[data-fo-date] b")) {
          const b = word.getBoundingClientRect();
          if (b.left < edge - 0.5 && b.right > edge + 0.5) {
            found.push(word.textContent ?? "");
          }
        }
        return found;
      });
    expect(cut).toEqual([]);
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.scroll).toBe(widths.viewport);
  });
});
