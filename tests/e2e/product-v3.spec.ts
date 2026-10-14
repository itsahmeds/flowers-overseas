/**
 * Product v3 (TASK-197): the two-column desktop and the phone sheet, on
 * `/en-gb/poland/product/amber-hour` (spec 004 §14 A24 clauses 1, 4 and 5; spec 009 §14 A12).
 *
 *  - **T-51, the product half (AC-46).** At 1280 × 800, 1440 × 900 and 1512 × 945 the hero is
 *    1.25 × its width (± 1 px), no taller than the viewport, its top in view, and the H1, the
 *    price, the size control and the primary action (the status pill) lie fully inside the
 *    viewport. At 390 × 844 the photograph is `min(470, 844 − 300)` px, the H1, the price and the
 *    size control lie above the bar's top edge, the sheet draws no grip, and N2 renders under the
 *    status. Watched red: the action pushed below 800 at 1280 × 800, a grip drawn, N2 removed.
 *  - **T-53 on the product page (AC-48).** The bar is not shown over the first screen (the
 *    orchestrator's sticky-bar ruling) and shows once the buy section has scrolled out; it is
 *    opaque; its price equals the sheet's price; its action links to the status in the flow;
 *    scrolled to the bottom no text sits under it; the language popup (a top sheet) never
 *    intersects its action, at 390 × 844 and at 390 × 600 (PR 208 round 3). Watched red: the bar's
 *    price taken from another tier.
 *  - **T-54 on the sizes, the dates and the gallery (AC-49).** Watched red: the date row at
 *    `overflow: hidden`.
 *  - **T-55 on the product page (AC-50).** At 390 the trail is displayed below the buy section and
 *    above the sections after it; at 1440 it leads the page. Watched red: the trail
 *    `display: none` at 390.
 *  - **Spec 009 A12 (T-33, T-35).** The buy section holds the seven elements in order, the sections
 *    after it follow one DOM order whose boxes read in the same order at both widths, no CSS
 *    `order`; the description is whole in the HTML, three lines closed, and "Read more" opens it
 *    with JavaScript off.
 */
import { type Page, expect, test } from "@playwright/test";

import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

const PDP = "/en-gb/poland/product/amber-hour";
const PHONE = { width: 390, height: 844 } as const;
const BAR = "[data-fo-action-bar]";

/** The demo sentence (N2), restated from `messages/en.json`, not read from it. */
const N2 =
  "When ordering opens, this is the price you will pay. Nothing is added at a later step.";

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const locator = page.locator(selector).first();
  await expect(locator, selector).toBeAttached();
  return locator.evaluate((node) => {
    const b = node.getBoundingClientRect();
    return {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
    };
  });
}

const inside = (
  box: Box,
  viewport: { readonly width: number; readonly height: number },
): boolean =>
  box.top >= 0 &&
  box.left >= 0 &&
  box.bottom <= viewport.height &&
  box.right <= viewport.width;

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function open(page: Page): Promise<void> {
  const response = await page.goto(PDP);
  expect(response?.status(), PDP).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

/** Whether the bar is painted: visible, and its box on the screen. */
async function barShown(page: Page): Promise<boolean> {
  return page.locator(BAR).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return (
      getComputedStyle(node).visibility === "visible" &&
      box.top < window.innerHeight - 1
    );
  });
}

/** Scroll until the buy section's bottom edge is above the viewport, and let the bar settle. */
async function scrollPastBuy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const buy = document.querySelector("[data-fo-pdp-buy]");
    if (buy === null) throw new Error("no buy section");
    window.scrollBy({
      top: buy.getBoundingClientRect().bottom + 40,
      behavior: "instant",
    });
  });
  await expect.poll(() => barShown(page)).toBe(true);
}

test.beforeEach(({}, testInfo) => {
  // Every case sets its own viewport: measured once, in e2e-desktop.
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

test.describe("T-51: the product first screens (AC-46, product half)", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1512, height: 945 },
  ] as const) {
    test(`at ${String(viewport.width)} × ${String(viewport.height)}: the 4∶5 hero, and the H1, price, sizes and action in view`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page);
      const hero = await boxOf(
        page,
        '[data-fo-gallery-image="hero"] [data-fo-media-slot]',
      );
      expect(
        Math.abs(hero.height - 1.25 * hero.width),
        "4∶5",
      ).toBeLessThanOrEqual(1);
      expect(hero.height, "never taller than the viewport").toBeLessThanOrEqual(
        viewport.height,
      );
      expect(hero.top >= 0 && hero.top < viewport.height, "top in view").toBe(
        true,
      );
      // Columns 2–7 of the 12-column frame: right of the thumbnails, left of the buy column.
      const buy = await boxOf(page, "[data-fo-pdp-buy]");
      expect(hero.right).toBeLessThan(buy.left);
      for (const selector of [
        "[data-fo-pdp-buy] h1",
        "[data-fo-pdp-price]",
        "[data-fo-pdp-buy] [data-fo-tier-selector]",
        "[data-fo-pdp-status]",
      ]) {
        const box = await boxOf(page, selector);
        expect(
          inside(box, viewport),
          `${selector} ${JSON.stringify(box)}`,
        ).toBe(true);
      }
    });
  }

  test("at 390 × 844: the photograph, the sheet's name, price and sizes above the bar, no grip, N2 under the status", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page);
    const photo = await boxOf(
      page,
      '[data-fo-gallery-image="hero"] [data-fo-media-slot]',
    );
    expect(
      Math.abs(photo.height - Math.min(470, PHONE.height - 300)),
    ).toBeLessThanOrEqual(1);
    expect(photo.width, "full-bleed").toBe(PHONE.width);
    // The sheet rises over the photograph's foot.
    const sheet = await boxOf(page, "[data-fo-pdp-buy]");
    expect(photo.bottom - sheet.top).toBeGreaterThanOrEqual(24);
    expect(photo.bottom - sheet.top).toBeLessThanOrEqual(28);
    const barTop = PHONE.height - 76;
    for (const selector of [
      "[data-fo-pdp-buy] h1",
      "[data-fo-pdp-price]",
      "[data-fo-pdp-buy] [data-fo-tier-selector]",
    ]) {
      const box = await boxOf(page, selector);
      expect(
        box.top >= 0 && box.bottom <= barTop,
        `${selector} ${JSON.stringify(box)} above the bar's top ${String(barTop)}`,
      ).toBe(true);
    }
    // Name and price side by side.
    const h1 = await boxOf(page, "[data-fo-pdp-buy] h1");
    const price = await boxOf(page, "[data-fo-pdp-price]");
    expect(price.left).toBeGreaterThanOrEqual(h1.right);
    // No grip: nothing drawn in the sheet's top band but its first line of text.
    const grips = await page.locator("[data-fo-pdp-buy] *").evaluateAll(
      (nodes, top) =>
        nodes
          .filter((node) => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            const painted =
              style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
              style.borderTopWidth !== "0px";
            return (
              box.top < top + 24 &&
              box.height > 0 &&
              box.height <= 8 &&
              box.width <= 80 &&
              painted
            );
          })
          .map((node) => node.outerHTML.slice(0, 80)),
      sheet.top,
    );
    expect(grips, "a grip handle").toEqual([]);
    // N2 under the status pill, in the sheet.
    const status = await boxOf(page, "[data-fo-pdp-status]");
    const demo = page.locator("[data-fo-pdp-buy] [data-fo-pdp-demo]");
    await expect(demo).toBeVisible();
    await expect(demo).toHaveText(N2);
    expect(
      (await boxOf(page, "[data-fo-pdp-buy] [data-fo-pdp-demo]")).top,
    ).toBeGreaterThanOrEqual(status.bottom);
  });
});

test.describe("T-53: the docked bar on the product page (AC-48)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test("is not over the first screen, and shows once the buy section has scrolled out", async ({
    page,
  }) => {
    await open(page);
    expect(await barShown(page), "over the first screen").toBe(false);
    await scrollPastBuy(page);
    const style = await page.locator(BAR).evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      position: getComputedStyle(node).position,
    }));
    expect(style.position).toBe("fixed");
    expect(style.background).not.toMatch(
      /rgba\([^)]*,\s*0?\.\d+\)|\/\s*0?\.\d/u,
    );
    // Scrolling back to the top hides it again.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => barShown(page)).toBe(false);
  });

  test("its price is the sheet's selected price, and its action an in-page link to the status", async ({
    page,
  }) => {
    await open(page);
    const sheetPrice = (
      await page.locator("[data-fo-pdp-price] bdi").textContent()
    )?.trim();
    const checked = (
      await page
        .locator(
          "[data-fo-pdp-buy] [data-fo-segment]:has(input:checked) [data-fo-tier-label]",
        )
        .textContent()
    )?.trim();
    await scrollPastBuy(page);
    const barPrice = (
      await page
        .locator(`${BAR} [data-fo-action-bar-price] strong`)
        .textContent()
    )?.trim();
    expect(barPrice).toBeTruthy();
    expect(barPrice).toBe(sheetPrice);
    // The checked size's own segment prints the same amount, and the bar's caption names it.
    const segmentPrice = (
      await page
        .locator("[data-fo-pdp-buy] [data-fo-segment]:has(input:checked) bdi")
        .textContent()
    )?.trim();
    expect(segmentPrice).toBe(barPrice);
    await expect(
      page.locator(`${BAR} [data-fo-action-bar-price] small`),
    ).toHaveText(checked ?? "");
    const href = await page.locator(`${BAR} a`).getAttribute("href");
    expect(href).toBe("#buy");
    await expect(page.locator("#buy [data-fo-pdp-status]")).toHaveCount(1);
    await page.locator(`${BAR} a`).click();
    await expect(page.locator("#buy [data-fo-pdp-status]")).toBeInViewport();
  });

  test("scrolled to the bottom, no text node sits under it", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    await expect.poll(() => barShown(page)).toBe(true);
    const bar = await boxOf(page, BAR);
    const under = await page.evaluate((barBox) => {
      const hits: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      ) {
        const text = (node.textContent ?? "").trim();
        const parent = node.parentElement;
        if (text === "" || parent === null) continue;
        // Not painted: the bar itself, the consent sheet, a `hidden` node, and the content of a
        // closed `<details>` (the Menu's panel), which Chrome still lays out.
        if (
          parent.closest(
            "[data-fo-action-bar], [data-fo-consent-sheet], [hidden]",
          ) !== null ||
          (parent.closest("details:not([open])") !== null &&
            parent.closest("summary") === null)
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (box.width === 0 || box.height === 0) continue;
          if (
            box.left < barBox.right &&
            barBox.left < box.right &&
            box.top < barBox.bottom &&
            barBox.top < box.bottom
          )
            hits.push(text.slice(0, 40));
        }
      }
      return hits;
    }, bar);
    expect(under).toEqual([]);
  });

  for (const height of [844, 600] as const) {
    test(`the language popup never intersects its action at 390 × ${String(height)}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: NO_LOCALE_CHOICE,
        viewport: { width: 390, height },
        locale: "de-DE",
      });
      const page = await context.newPage();
      try {
        await page.goto(PDP);
        const popup = page.locator("dialog[data-fo-language-popup][open]");
        await expect(popup, "the popup opens on a first visit").toBeVisible();
        await scrollPastBuy(page);
        await expect(popup).toBeVisible();
        expect(
          intersects(
            await popup.evaluate((node) => {
              const b = node.getBoundingClientRect();
              return {
                left: b.left,
                top: b.top,
                right: b.right,
                bottom: b.bottom,
                width: b.width,
                height: b.height,
              };
            }),
            await boxOf(page, `${BAR} a`),
          ),
        ).toBe(false);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("T-54: the sizes, the dates and the gallery on the phone (AC-49)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page);
  });

  test("the sizes are a segmented control: fieldset, legend, native radios, one checked, 44 px", async ({
    page,
  }) => {
    const control = page.locator(
      '[data-fo-pdp-buy] [data-fo-segmented="radios"]',
    );
    await expect(control).toHaveCount(1);
    expect(await control.evaluate((node) => node.tagName)).toBe("FIELDSET");
    await expect(control.locator("> legend")).toHaveCount(1);
    await expect(control.locator('input[type="radio"]')).toHaveCount(3);
    await expect(control.locator('input[type="radio"]:checked')).toHaveCount(1);
    for (const segment of await control.locator("[data-fo-segment]").all()) {
      expect(
        Math.round((await segment.boundingBox())?.height ?? 0),
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test("the date row scrolls, its last chip is reachable, and with no focusable chip it is focusable and named", async ({
    page,
  }) => {
    const row = page.locator(
      "[data-fo-pdp-buy] [data-fo-date-grid] [data-fo-scroller]",
    );
    await expect(row).toHaveCount(1);
    const state = await row.evaluate((node) => ({
      overflowX: getComputedStyle(node).overflowX,
      scrolls: node.scrollWidth > node.clientWidth,
      name: node.getAttribute("aria-label") ?? "",
      tabindex: node.getAttribute("tabindex"),
      focusable:
        node.querySelector("input:not(:disabled), a[href], button") !== null,
    }));
    expect(["auto", "scroll"]).toContain(state.overflowX);
    expect(state.scrolls).toBe(true);
    if (!state.focusable) {
      expect(state.tabindex).toBe("0");
      expect(state.name).not.toBe("");
    }
    const last = row.locator(":scope > li").last();
    await row.scrollIntoViewIfNeeded();
    await expect(last).not.toBeInViewport({ ratio: 1 });
    await row.evaluate((node) =>
      node.scrollBy({ left: node.scrollWidth, behavior: "instant" }),
    );
    await expect(last).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(PHONE.width);
  });

  test("the gallery scrolls, its dots are in-page links of 24 × 24 to real photographs, and nothing is a carousel", async ({
    page,
  }) => {
    const gallery = page.locator("[data-fo-gallery] [data-fo-scroller]");
    expect(
      await gallery.evaluate((node) => getComputedStyle(node).overflowX),
    ).toMatch(/auto|scroll/u);
    const dots = page.locator("[data-fo-gallery-dots] a");
    const count = await page.locator("[data-fo-gallery-image]").count();
    await expect(dots).toHaveCount(count > 1 ? count : 0);
    for (const dot of await dots.all()) {
      const href = (await dot.getAttribute("href")) ?? "";
      expect(href).toMatch(/^#./u);
      await expect(page.locator(href)).toHaveCount(1);
      const box = await dot.boundingBox();
      expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(24);
      expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(24);
    }
    await expect(page.locator("[aria-roledescription]")).toHaveCount(0);
  });
});

test.describe("T-55: the product trail (AC-50)", () => {
  test("at 390 the trail is displayed below the buy section, before the sections after it; at 1440 it leads the page", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page);
    const trail = page.locator("main [data-fo-breadcrumb-trail]");
    await expect(trail).toHaveCount(1);
    await expect(trail).toBeVisible();
    await expect(page.locator("main [data-fo-back-link]")).toHaveCount(0);
    const buy = await boxOf(page, "[data-fo-pdp-buy]");
    const more = await boxOf(page, "[data-fo-pdp-more]");
    const box = await boxOf(page, "main [data-fo-breadcrumb-trail]");
    expect(box.top).toBeGreaterThanOrEqual(buy.bottom);
    expect(box.bottom).toBeLessThanOrEqual(more.top);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(trail).toBeVisible();
    const desktop = await boxOf(page, "main [data-fo-breadcrumb-trail]");
    const gallery = await boxOf(page, "[data-fo-pdp-gallery]");
    expect(desktop.bottom).toBeLessThanOrEqual(gallery.top);
  });
});

test.describe("spec 009 A12: one order, the buy section's seven elements, the description clamp (T-33, T-35)", () => {
  for (const width of [1440, 390] as const) {
    test(`at ${String(width)} with JavaScript off: the buy section in A12's order, the sections in one order on screen, no CSS order`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      try {
        await page.goto(PDP);
        const buy = await page
          .locator("[data-fo-pdp-buy]")
          .evaluate((section) =>
            Array.from(section.querySelectorAll("*"))
              .map((node) =>
                node.matches(".eyebrow")
                  ? "eyebrow"
                  : node.matches("h1")
                    ? "h1"
                    : node.matches("[data-fo-pdp-price]")
                      ? "price"
                      : node.matches("[data-fo-tier-selector]")
                        ? "sizes"
                        : node.matches("[data-fo-picker-state]")
                          ? "dates"
                          : node.matches("[data-fo-pdp-action]")
                            ? "action"
                            : node.matches("[data-fo-destination-line]")
                              ? "destination"
                              : node.matches(
                                    "[data-fo-price-equivalents], [data-fo-pdp-card], [data-fo-pdp-addons]",
                                  )
                                ? "intruder"
                                : undefined,
              )
              .filter((name) => name !== undefined),
          );
        expect(buy).toEqual([
          "eyebrow",
          "h1",
          "price",
          "sizes",
          "dates",
          "action",
          "destination",
        ]);
        const sections = await page
          .locator(
            "[data-fo-pdp-about], [data-fo-pdp-trust], [data-fo-pdp-card], [data-fo-pdp-addons], [data-fo-pdp-the-price], [data-fo-pdp-facts], [data-fo-pdp-related]",
          )
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              top: node.getBoundingClientRect().top + window.scrollY,
              order: getComputedStyle(node).order,
            })),
          );
        expect(sections).toHaveLength(7);
        for (const [index, section] of sections.entries()) {
          expect(section.order).toBe("0");
          const previous = sections[index - 1];
          if (previous !== undefined) {
            // Row by row: a later section never starts above an earlier one.
            expect(section.top).toBeGreaterThanOrEqual(previous.top - 1);
          }
        }
        const action = await boxOf(page, "[data-fo-pdp-action]");
        const card = await boxOf(page, "[data-fo-pdp-card]");
        expect(
          card.top + (await page.evaluate(() => window.scrollY)),
        ).toBeGreaterThan(action.top);
      } finally {
        await context.close();
      }
    });
  }

  test("the description: whole in the HTML, three lines closed, and Read more opens it with JavaScript off", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      await page.goto(PDP);
      const description = page.locator("[data-fo-description]");
      await expect(description).toHaveCount(1);
      const closed = await description.evaluate((node) => ({
        lines: Math.round(
          node.clientHeight / parseFloat(getComputedStyle(node).lineHeight),
        ),
        cut: node.scrollHeight > node.clientHeight + 1,
      }));
      expect(closed).toEqual({ lines: 3, cut: true });
      // The exclusion sentence is outside the clamped box.
      await expect(description.locator("[data-fo-price-excludes]")).toHaveCount(
        0,
      );
      const summary = page.locator("[data-fo-read-more] > summary");
      expect(
        await summary.evaluate((node) => node.parentElement?.tagName),
      ).toBe("DETAILS");
      await summary.focus();
      await page.keyboard.press("Enter");
      const open = await description.evaluate(
        (node) => node.scrollHeight <= node.clientHeight + 1,
      );
      expect(open).toBe(true);
    } finally {
      await context.close();
    }
  });
});

/** The PDP in the three languages whose chips the review asked about (review round 1). */
const PDP_BY_LOCALE = {
  en: "/en-gb/poland/product/amber-hour",
  de: "/de/polen/produkt/amber-hour",
  pl: "/pl/polska/produkt/amber-hour",
} as const;

test.describe("the date row's chips: one height, nothing spilling, the reasons under the row (review round 1)", () => {
  for (const [locale, path] of Object.entries(PDP_BY_LOCALE)) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ] as const) {
      test(`${locale} at ${String(viewport.width)}: every chip the same height, none overflowing its 66 px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        const chips = await page
          .locator("[data-fo-pdp-buy] [data-fo-date-grid] label[data-fo-date]")
          .evaluateAll((labels) =>
            labels.map((label) => {
              const box = label.getBoundingClientRect();
              return {
                date: label.getAttribute("data-fo-date"),
                width: Math.round(box.width),
                height: Math.round(box.height * 10) / 10,
                // Every in-flow line inside the card; the occasion tag is drawn on purpose over the
                // chip's top edge, 12 px past each side (`DateChip`), and no further.
                spills: Array.from(label.children).some((child) => {
                  const inner = child.getBoundingClientRect();
                  if (inner.width === 0 || inner.height === 0) return false;
                  const tag = child.hasAttribute("data-fo-date-occasion");
                  const bleed = tag ? 12.5 : 0.5;
                  return (
                    inner.left < box.left - bleed ||
                    inner.right > box.right + bleed ||
                    (!tag &&
                      (inner.top < box.top - 0.5 ||
                        inner.bottom > box.bottom + 0.5))
                  );
                }),
              };
            }),
          );
        expect(chips.length, path).toBeGreaterThanOrEqual(7);
        const heights = new Set(chips.map((chip) => chip.height));
        expect([...heights], JSON.stringify(chips)).toHaveLength(1);
        for (const chip of chips) {
          expect(chip.width, chip.date ?? "").toBe(66);
          expect(chip.spills, chip.date ?? "").toBe(false);
        }
        // No chip prints a reason of its own: a closed day's reason is a caption line under
        // the row, beginning with the date it closes.
        await expect(
          page.locator(
            "[data-fo-pdp-buy] label[data-fo-date] [data-fo-date-why]",
          ),
        ).toHaveCount(0);
      });
    }
  }
});

test.describe("the eyebrow: P2 on the phone, the desktop line from md (breaker H2)", () => {
  /** Restated, not read from the catalogue: the descriptor and the two patterns. */
  const DESCRIPTOR = "hand-tied rose bouquet";
  for (const [width, expected] of [
    [390, `${DESCRIPTOR} · Poland`],
    [1440, `${DESCRIPTOR} · for Poland`],
  ] as const) {
    test(`at ${String(width)} the visible eyebrow reads "${expected}", once`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const eyebrow = page.locator("[data-fo-pdp-buy] .eyebrow");
      await expect(eyebrow).toHaveCount(1);
      // `innerText`: only what is rendered at this width, so a hidden span reads as nothing and
      // a doubled country reads twice.
      const shown = await eyebrow.evaluate((node) =>
        (node as HTMLElement).innerText.replaceAll(/\s+/gu, " ").trim(),
      );
      expect(shown.toLowerCase()).toBe(expected.toLowerCase());
    });
  }
});

test.describe("the docked bar under reduced motion (review round 1)", () => {
  test("is still hidden over the first screen and shown once the buy section has scrolled out", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: PHONE,
    });
    const page = await context.newPage();
    try {
      await open(page);
      expect(await barShown(page), "over the first screen").toBe(false);
      await scrollPastBuy(page);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await expect.poll(() => barShown(page)).toBe(false);
    } finally {
      await context.close();
    }
  });
});
