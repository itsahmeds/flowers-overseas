/**
 * T-53 (AC-48): the sticky primary-action bar, on its fixture page (spec 004 §14 A24 clause
 * 4 (a); TASK-195). The pages that mount it (TASK-196, TASK-197, TASK-182, TASK-183) run the same
 * assertions on their own URLs.
 *
 * `/dev/components/action-bar` is the real chrome, a selected price and the page's own action in
 * the flow, filler long enough to scroll, and the bar repeating the action and the price. The
 * stylesheet half (the safe area in the rules, the foot padding, the consent sheet's offset) is
 * `tests/unit/ui-phone-chrome.test.tsx`.
 *
 * Watched red: with the document's foot padding removed (`body:has([data-fo-action-bar])` in
 * `globals.css`) the bottom-of-page case finds the page's last text under the bar.
 */
import { type Page, expect, test } from "@playwright/test";

import { recordLayoutShifts } from "../support/layout-shift.ts";

const FIXTURE = "/dev/components/action-bar";
const BAR = "[data-fo-action-bar]";
const ACTION = `${BAR} a`;
const PHONE = { width: 390, height: 844 } as const;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
    });
}

test.describe("T-53: the sticky action bar (AC-48)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test("is opaque, fixed to the viewport's foot, and its padding takes the safe area", async ({
    page,
  }) => {
    expect((await page.goto(FIXTURE))?.status()).toBe(200);
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();
    await expect(bar).toHaveCSS("position", "fixed");
    const style = await bar.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        bottom: Math.round(node.getBoundingClientRect().bottom),
        height: Math.round(node.getBoundingClientRect().height),
        paddingEnd: computed.paddingBlockEnd,
      };
    });
    // Alpha 1: no `/ a` in a colour function and no fourth `rgba` channel below 1.
    const alpha =
      /\/\s*([\d.]+%?)\s*\)$/u.exec(style.background)?.[1] ??
      /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/u.exec(style.background)?.[1] ??
      "1";
    expect(Number.parseFloat(alpha), style.background).toBe(1);
    expect(style.bottom).toBe(PHONE.height);
    expect(style.height).toBe(76);
    expect(style.paddingEnd).toBe("14px");
  });

  test("with a 34 px safe area emulated, the bar grows by it and its block-end padding includes it", async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send(
      "Emulation.setSafeAreaInsetsOverride" as never,
      {
        insets: { top: 0, left: 0, bottom: 34, right: 0 },
      } as never,
    );
    await page.goto(FIXTURE);
    const measured = await page.locator(BAR).evaluate((node) => ({
      height: Math.round(node.getBoundingClientRect().height),
      paddingEnd: getComputedStyle(node).paddingBlockEnd,
      foot: getComputedStyle(document.body).paddingBlockEnd,
    }));
    expect(measured).toEqual({
      height: 76 + 34,
      paddingEnd: `${String(14 + 34)}px`,
      foot: `${String(76 + 34)}px`,
    });
  });

  test("scrolled to the bottom, no text node's box intersects the bar", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const bar = await rectOf(page, BAR);
    const { under, lowest } = await page.evaluate((barRect) => {
      const hits: string[] = [];
      let bottom = Number.NEGATIVE_INFINITY;
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
        if (parent.closest("[data-fo-action-bar], [data-fo-consent-sheet]")) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (box.width === 0 || box.height === 0) continue;
          bottom = Math.max(bottom, box.bottom);
          if (
            box.left < barRect.right &&
            barRect.left < box.right &&
            box.top < barRect.bottom &&
            barRect.top < box.bottom
          ) {
            hits.push(text.slice(0, 40));
          }
        }
      }
      return { under: hits, lowest: bottom };
    }, bar);
    expect(under).toEqual([]);
    // Not vacuous: the document's lowest text sits just above the bar, inside the viewport.
    expect(lowest).toBeLessThanOrEqual(bar.top);
    expect(lowest).toBeGreaterThan(bar.top - 160);
  });

  test("repeats, never replaces: its action is an in-page link to a twin that is reachable with JavaScript off", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: PHONE,
    });
    const page = await context.newPage();
    try {
      await page.goto(FIXTURE);
      const href = await page.locator(ACTION).getAttribute("href");
      expect(href).toMatch(/^#./u);
      const twin = page.locator(`${href ?? ""} a`);
      await expect(twin).toHaveCount(1);
      await expect(twin).toHaveText(
        (await page.locator(ACTION).textContent()) ?? "",
      );
      await page.locator(ACTION).click();
      await expect(twin).toBeInViewport();
    } finally {
      await context.close();
    }
  });

  test("its price equals the visible selected price", async ({ page }) => {
    await page.goto(FIXTURE);
    const inBar = await page
      .locator(`${BAR} [data-fo-action-bar-price] strong`)
      .textContent();
    const inFlow = await page
      .locator("[data-fo-fixture-selected-price] [data-fo-price] bdi")
      .textContent();
    expect(inBar).not.toBeNull();
    expect(inBar).toBe(inFlow);
  });

  test("the consent sheet never covers the bar's action", async ({ page }) => {
    await page.goto(FIXTURE);
    const sheet = page.locator(
      '[data-fo-consent-sheet="fixed"] [data-fo-consent]',
    );
    await expect(sheet).toBeVisible();
    await expect(page.locator(ACTION)).toBeVisible();
    expect(
      intersects(
        await rectOf(page, '[data-fo-consent-sheet="fixed"] [data-fo-consent]'),
        await rectOf(page, ACTION),
      ),
    ).toBe(false);
  });

  test("showing and hiding it moves no layout (CLS 0)", async ({ page }) => {
    await recordLayoutShifts(page);
    await page.goto(FIXTURE);
    await page.waitForLoadState("networkidle");
    const before = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    // Only the shifts the bar's own toggling causes: the load (fonts, the consent island) is
    // other suites' business, so the record starts here.
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      (window as unknown as { __foShifts: unknown[] }).__foShifts = [];
    });
    for (const state of ["hidden", "shown", "hidden", "shown"]) {
      await page.evaluate((next) => {
        document
          .querySelector("[data-fo-action-bar]")
          ?.setAttribute("data-fo-action-bar", next);
      }, state);
      await page.waitForTimeout(400);
    }
    const shifts = await page.evaluate(() =>
      (
        (window as unknown as { __foShifts?: { value: number }[] })
          .__foShifts ?? []
      ).reduce((total, entry) => total + entry.value, 0),
    );
    expect(shifts).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(before);
    // The server-rendered hidden state is off-screen and holds the same page.
    await page.goto(`${FIXTURE}?bar=hidden`);
    const hidden = await rectOf(page, BAR);
    expect(hidden.top).toBeGreaterThanOrEqual(PHONE.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(before);
  });

  test("is not drawn from `md` up", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE);
    await expect(page.locator(BAR)).toBeHidden();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).paddingBlockEnd,
      ),
    ).toBe("0px");
  });
});
