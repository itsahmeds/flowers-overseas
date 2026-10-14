/**
 * Home v3 (spec 004 §14 A23 clause 1, A24 clauses 4 (a), 5 and 7; TASK-196): desktop option A and
 * the phone cover, on `/en-gb`.
 *
 *  - **T-51, the home half (AC-46).** At 1280 × 800, 1440 × 900 and 1512 × 945 (and the laptop
 *    band's 1470 × 830 and 1512 × 860): the photograph's block-start edge is the chrome's block-end
 *    edge (± 1 px), its block-end edge is at or above the viewport's foot, its block size is at
 *    least 560 px, and the white card with the H1, the sentence and Continue lies fully inside the
 *    viewport. At 390 × 844 the header, the cover and the bar together are 844 ± 1 px, the H1 and
 *    its line lie inside the cover, above the fade's ramp, and Send flowers lies in the bar. At
 *    360 × 640 the cover is at least 420 px. Watched red: with the photograph capped at
 *    `--hero-photo-max` (480 px at 1280 × 800) the block-size case fails.
 *  - **The priority image (A24 clause 5).** At 1440 × 900 and 390 × 844 exactly one displayed
 *    `<img>` carries `fetchpriority="high"`, and exactly one image preload whose `media` matches
 *    the width names its ladder. Watched red with a second `priority` image.
 *  - **T-53 on the home (AC-48).** At 390 × 844: the bar is opaque, takes a 34 px safe area, sits
 *    above the page's last text when scrolled to the bottom, is an in-page link to the sentence
 *    (`#send`) that works with JavaScript off, does not meet the consent sheet, and moves nothing
 *    while the page scrolls. Watched red with the page's foot padding removed.
 *
 * The contrast half of T-51 is a unit test, `tests/unit/home-cover-fade.test.tsx`.
 */
import { type Page, expect, test } from "@playwright/test";

import { COVER_FADE_RAMP_PX } from "../../src/modules/ui/home/cover-fade.ts";
import { recordLayoutShifts } from "../support/layout-shift.ts";
import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

const HOME = "/en-gb";
const BAR = "[data-fo-action-bar]";
const ACTION = `${BAR} a`;
const PHOTO = "[data-fo-hero-photo]";
const CARD = "[data-fo-hero-card]";
const COPY = "[data-fo-hero-copy]";

/** `--hero-photo-max` restated, `min(520px, 60svh)`: the home hero is exempt from it. */
const heroPhotoMax = (height: number): number => Math.min(520, 0.6 * height);

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

async function rectOf(page: Page, selector: string): Promise<Rect> {
  const locator = page.locator(selector).first();
  await expect(locator, selector).toBeAttached();
  return locator.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

const inside = (inner: Rect, outer: Rect, slack = 0.5): boolean =>
  inner.left >= outer.left - slack &&
  inner.top >= outer.top - slack &&
  inner.right <= outer.right + slack &&
  inner.bottom <= outer.bottom + slack;

const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function open(page: Page): Promise<void> {
  expect((await page.goto(HOME))?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

test.describe("T-51: option A fills the first screen under the chrome (AC-46)", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1512, height: 945 },
    { width: 1470, height: 830 },
    { width: 1512, height: 860 },
  ] as const) {
    test(`${String(viewport.width)} × ${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page);
      const screen: Rect = {
        left: 0,
        top: 0,
        right: viewport.width,
        bottom: viewport.height,
        width: viewport.width,
        height: viewport.height,
      };
      const chrome = await rectOf(page, "[data-fo-header]");
      const photo = await rectOf(page, PHOTO);

      expect(
        Math.abs(photo.top - chrome.bottom),
        `photo top ${String(photo.top)} vs chrome bottom ${String(chrome.bottom)}`,
      ).toBeLessThanOrEqual(1);
      expect(photo.bottom, "photo block-end").toBeLessThanOrEqual(
        viewport.height + 0.5,
      );
      expect(photo.height, "photo block size").toBeGreaterThanOrEqual(560);
      // Full-bleed: the viewport's whole width, and taller than the cap every other hero keeps.
      expect(photo.width).toBeCloseTo(viewport.width, 0);
      expect(photo.height).toBeGreaterThan(heroPhotoMax(viewport.height));

      const card = await rectOf(page, CARD);
      expect(inside(card, screen), `card ${JSON.stringify(card)}`).toBe(true);
      for (const part of [
        "main h1",
        "[data-fo-sentence]",
        "[data-fo-sentence] button[type='submit']",
      ]) {
        expect(inside(await rectOf(page, part), card), part).toBe(true);
      }
      // The card on columns 1–5 of the frame: its edge is the logo's, its text 36 px in.
      const logo = await rectOf(page, "[data-fo-header-logo]");
      expect(
        Math.abs(card.left - logo.left),
        "card x = logo x",
      ).toBeLessThanOrEqual(0.5);
      const h1 = await rectOf(page, "main h1");
      expect(h1.left - card.left, "text inset").toBeCloseTo(36, 0);
    });
  }

  // Below the laptop band (`/break` 212, hole 2): `--home-chrome` is 203 px at `md` and 183 px at
  // `lg`, so the photograph must still start at the chrome's foot and end inside the viewport.
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1180, height: 820 },
  ] as const) {
    test(`${String(viewport.width)} × ${String(viewport.height)}: under the chrome, inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page);
      const chrome = await rectOf(page, "[data-fo-header]");
      const photo = await rectOf(page, PHOTO);
      expect(
        Math.abs(photo.top - chrome.bottom),
        `photo top ${String(photo.top)} vs chrome bottom ${String(chrome.bottom)}`,
      ).toBeLessThanOrEqual(1);
      expect(photo.bottom, "photo block-end").toBeLessThanOrEqual(
        viewport.height + 0.5,
      );
      const card = await rectOf(page, CARD);
      expect(inside(card, photo), `card ${JSON.stringify(card)}`).toBe(true);
    });
  }

  // A short window (`/review` 212 nit): at 1024 × 700 the chrome (183 px) and the photograph's
  // 560 px floor are 743 px, so the photograph runs past the foot by design (the artboard's
  // `clamp(560px, …)`); what must hold is that the card stays on it, below the header.
  test("1024 × 700: the card stays on the photograph, below the header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await open(page);
    const chrome = await rectOf(page, "[data-fo-header]");
    const photo = await rectOf(page, PHOTO);
    const card = await rectOf(page, CARD);
    expect(Math.abs(photo.top - chrome.bottom)).toBeLessThanOrEqual(1);
    expect(photo.height).toBeGreaterThanOrEqual(560);
    expect(card.top, `card ${JSON.stringify(card)}`).toBeGreaterThanOrEqual(
      chrome.bottom - 0.5,
    );
    expect(inside(card, photo), `card ${JSON.stringify(card)}`).toBe(true);
  });

  test("1440 × 900 matches the artboard's left edges: card at x 56, text at x 92", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    expect((await rectOf(page, CARD)).left).toBeCloseTo(56, 0);
    expect((await rectOf(page, "main h1")).left).toBeCloseTo(92, 0);
    expect((await rectOf(page, "[data-fo-sentence]")).left).toBeCloseTo(92, 0);
  });
});

test.describe("T-51: the phone cover (AC-46)", () => {
  test("390 × 844: header, cover and bar are the viewport; H1 and line on the cover; Send flowers in the bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const header = await rectOf(page, "[data-fo-header]");
    const cover = await rectOf(page, PHOTO);
    const bar = await rectOf(page, BAR);

    expect(header.height + cover.height + bar.height).toBeGreaterThanOrEqual(
      843,
    );
    expect(header.height + cover.height + bar.height).toBeLessThanOrEqual(845);
    expect(Math.abs(cover.top - header.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.top - cover.bottom)).toBeLessThanOrEqual(1);

    const h1 = await rectOf(page, "main h1");
    const line = await rectOf(page, "[data-fo-hero-line]");
    expect(inside(h1, cover), `H1 ${JSON.stringify(h1)}`).toBe(true);
    expect(inside(line, cover), `line ${JSON.stringify(line)}`).toBe(true);

    // Every glyph sits on the fade's full alpha: the ramp is the copy's block-start padding.
    const copy = await rectOf(page, COPY);
    const ramp = await page
      .locator(COPY)
      .evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).paddingBlockStart),
      );
    expect(ramp).toBe(COVER_FADE_RAMP_PX);
    const eyebrow = await rectOf(page, "[data-fo-hero-eyebrow]");
    expect(eyebrow.top).toBeGreaterThanOrEqual(copy.top + ramp - 0.5);
    // The gradient reaches the fade's full alpha at its last stop, and that stop is the padding:
    // a longer ramp would leave the eyebrow and the H1 on partial alpha (`/break` 212, hole 1).
    const gradient = await page
      .locator(COPY)
      .evaluate((node) => getComputedStyle(node).backgroundImage);
    const stop = /^linear-gradient\(.*\s(\d+(?:\.\d+)?)px\)$/u.exec(
      gradient,
    )?.[1];
    expect(stop, gradient).toBeDefined();
    expect(Number(stop), gradient).toBe(ramp);

    await expect(page.locator(ACTION)).toHaveText(/Send flowers/u);
    expect(inside(await rectOf(page, ACTION), bar)).toBe(true);
  });

  test("360 × 640: the cover is at least 420 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await open(page);
    expect((await rectOf(page, PHOTO)).height).toBeGreaterThanOrEqual(420);
  });
});

test.describe("the priority image, per width (A24 clause 5)", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ] as const) {
    test(`${String(viewport.width)} × ${String(viewport.height)}: one fetchpriority=high image, one matching preload`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page);
      const found = await page.evaluate(() => {
        const high = Array.from(
          document.querySelectorAll<HTMLImageElement>(
            'img[fetchpriority="high"]',
          ),
        ).filter((img) => img.checkVisibility());
        const preloads = Array.from(
          document.querySelectorAll<HTMLLinkElement>(
            'link[rel="preload"][as="image"]',
          ),
        ).filter(
          (link) => link.media === "" || window.matchMedia(link.media).matches,
        );
        const source = high[0]?.closest("picture")?.querySelector("source");
        return {
          high: high.length,
          inPhoto: high[0]?.closest("[data-fo-hero-photo]") !== null,
          preloads: preloads.map((link) => link.getAttribute("imagesrcset")),
          srcset: source?.getAttribute("srcset") ?? null,
        };
      });
      expect(found.high).toBe(1);
      expect(found.inPhoto).toBe(true);
      expect(found.preloads).toHaveLength(1);
      expect(found.preloads[0]).toBe(found.srcset);
    });
  }
});

test.describe("T-53 on the home at 390 × 844 (AC-48)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("the bar is opaque, on the viewport's foot, and shown from the first screen", async ({
    page,
  }) => {
    await open(page);
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("data-fo-action-bar", "shown");
    const style = await bar.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      bottom: Math.round(node.getBoundingClientRect().bottom),
    }));
    const alpha =
      /\/\s*([\d.]+%?)\s*\)$/u.exec(style.background)?.[1] ??
      /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/u.exec(style.background)?.[1] ??
      "1";
    expect(Number.parseFloat(alpha), style.background).toBe(1);
    expect(style.bottom).toBe(844);
  });

  test("with a 34 px safe area, the bar and the page's foot both take it", async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send(
      "Emulation.setSafeAreaInsetsOverride" as never,
      { insets: { top: 0, left: 0, bottom: 34, right: 0 } } as never,
    );
    await open(page);
    const measured = await page.locator(BAR).evaluate((node) => ({
      height: Math.round(node.getBoundingClientRect().height),
      paddingEnd: getComputedStyle(node).paddingBlockEnd,
      foot: getComputedStyle(document.body).paddingBlockEnd,
    }));
    expect(measured).toEqual({
      height: 110,
      paddingEnd: "48px",
      foot: "110px",
    });
  });

  test("scrolled to the bottom, no text node's box intersects the bar", async ({
    page,
  }) => {
    await open(page);
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
        if (
          parent.closest(
            "[data-fo-action-bar], [data-fo-consent-sheet], [data-fo-language-popup]",
          )
        )
          continue;
        // Painted text only: the closed phone menu (TASK-195's `<details>`) keeps a laid-out box
        // for its help link, y 747 to 791 at 390 × 844, that nobody sees.
        if (
          !parent.checkVisibility({
            visibilityProperty: true,
            opacityProperty: true,
          })
        )
          continue;
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
    expect(lowest).toBeLessThanOrEqual(bar.top);
    expect(lowest).toBeGreaterThan(bar.top - 160);
  });

  test("repeats, never replaces: Send flowers jumps to the sentence with JavaScript off", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto(HOME);
      await expect(page.locator(ACTION)).toHaveAttribute("href", "#send");
      const twin = page.locator("form#send[data-fo-sentence]");
      await expect(twin).toHaveCount(1);
      // Directly below the fold: the sentence card is the first thing after the cover.
      const form = await rectOf(page, "form#send");
      const cover = await rectOf(page, PHOTO);
      expect(form.top).toBeGreaterThanOrEqual(844 - 76);
      expect(form.top - cover.bottom).toBeLessThanOrEqual(40);
      await page.locator(ACTION).click();
      await expect(page).toHaveURL(/#send$/u);
      const submit = page.locator("form#send button[type='submit']");
      await expect(submit).toBeInViewport();
      const header = await rectOf(page, "[data-fo-header]");
      expect((await rectOf(page, "form#send")).top).toBeGreaterThanOrEqual(
        header.bottom,
      );
    } finally {
      await context.close();
    }
  });

  test("the consent sheet never covers the bar's action", async ({ page }) => {
    await open(page);
    const sheet = '[data-fo-consent-sheet="fixed"] [data-fo-consent]';
    await expect(page.locator(sheet)).toBeVisible();
    await expect(page.locator(ACTION)).toBeVisible();
    expect(
      intersects(await rectOf(page, sheet), await rectOf(page, ACTION)),
    ).toBe(false);
  });

  test("the language popup never covers the bar's action", async ({
    browser,
  }) => {
    // TASK-119's popup (spec 003 §14 A16) opens on a first visit: below `md` a top sheet,
    // block-start 0 and at most 260 px, so it stays clear of the bar at the viewport's foot.
    // Coordinated by test, not by editing the popup (work order). A first visit means no
    // `fo_locale`: `NO_LOCALE_CHOICE` overrides the config's returning-visitor cookie.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "de-DE",
      storageState: NO_LOCALE_CHOICE,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => ["de-DE", "de"],
      });
    });
    const page = await context.newPage();
    try {
      await page.goto(HOME);
      const popup = "dialog[data-fo-language-popup][open]";
      await expect(page.locator(popup)).toBeVisible();
      await expect(page.locator(ACTION)).toBeVisible();
      expect(
        intersects(await rectOf(page, popup), await rectOf(page, ACTION)),
      ).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("the bar moves no layout while the page scrolls (CLS 0)", async ({
    page,
  }) => {
    await recordLayoutShifts(page);
    await open(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      (window as unknown as { __foShifts: unknown[] }).__foShifts = [];
    });
    const before = await rectOf(page, BAR);
    for (const y of [400, 1200, 3000, 0]) {
      await page.evaluate((top) => {
        window.scrollTo(0, top);
      }, y);
      await page.waitForTimeout(250);
      expect(await rectOf(page, BAR)).toEqual(before);
    }
    const shifts = await page.evaluate(() =>
      (
        (window as unknown as { __foShifts?: { value: number }[] })
          .__foShifts ?? []
      ).reduce((total, entry) => total + entry.value, 0),
    );
    expect(shifts).toBe(0);
  });
});
