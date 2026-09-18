/**
 * T-09 / AC-7 and T-10 / AC-8 (TASK-048): the commerce header, served.
 *
 * Everything here needs a browser, a real response or both, which is what separates it from
 * `tests/unit/ui-site-header.test.tsx`:
 *
 *  - **the reserved height** per breakpoint, measured from the laid-out box rather than asserted
 *    from a class name (`e2e-desktop` is 1280 px wide, `e2e-mobile` is a Pixel 7 at 412 px, so the
 *    two projects cover the two artboards without a second config). Since §14 A4's addendum the
 *    chrome is **two elements** — the utility strip scrolls with the page, the banner is sticky —
 *    so the reserved height is asserted as both parts *and* their unchanged sum;
 *  - **the banner stays at the top while the strip scrolls away** (§14 A4's addendum, mechanism
 *    iii), which is the whole point of the split and only observable in a browser;
 *  - **the header's box is identical with and without JavaScript**, which is the observable form
 *    of "identical before and after hydration": there is no island in the header, so the document
 *    a crawler sees and the document a browser ends up with have the same chrome — and the CLS
 *    the header contributes is 0;
 *  - **the wordmark navigates to the locale home** (AC-7's one link);
 *  - **the currency chip** per locale, and the body being byte-identical with and without an
 *    `fo_currency` cookie, with no `Set-Cookie` on the response (AC-8);
 *  - **the search band holds no form control at all** (spec §14 A4): the artboards draw text, and
 *    text is what ships until spec 008 publishes search — so there is nothing to submit, nothing
 *    to focus and nothing that can navigate to a route that does not exist;
 *  - **every rendered link measures at least 44 px tall** at both artboard widths (§5.3, §8), and
 *    the currency chip sits inside the header's visible box at 390 px (§14 A4's AC-8 fix);
 *  - **no header link points at an unpublished target** (AC-14's header half, verified in full by
 *    TASK-054's crawl): every internal `href` in the header answers 200.
 */
import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { recordLocaleChoice } from "../support/locale-choice.ts";

/** The sticky part: masthead + category row, and the `banner` landmark. */
const HEADER = "[data-fo-header]";

/** The utility strip: a plain, non-landmark sibling that scrolls away (§14 A4's addendum). */
const UTILITY = "[data-fo-utility]";

/**
 * A selector scoped to **both** boxes. A CSS comma cannot be nested (`"a, b" + " a"` parses as
 * `"a, b a"`), so the descendant is distributed over the two roots rather than appended to a
 * comma-joined constant.
 */
const inChrome = (selector: string): string =>
  `${UTILITY} ${selector}, ${HEADER} ${selector}`;

/**
 * The reserved header height per breakpoint, **restated** rather than imported from
 * `src/modules/ui/layout/header-model.ts` (which the Playwright loader cannot resolve through the
 * `ui` barrel's `next/dynamic` chain in any case): a test that imports the number the component
 * renders agrees with the component by construction.
 *
 * mobile  = 113 utility (three lines at 390 px: the cutoff line, the help channel, and the
 *           switcher with the chip) + 1 rule + 102 masthead and search band + 1 rule
 *           + 28 category row + 1 rule (rounded: 245)
 * desktop = 44 utility (the strip carries links now, and a link owes 44 px) + 1 rule
 *           + 84 masthead + 1 rule + 52 category row (one line again, the artboard's) + 1 rule
 *
 * Both numbers are identical in all four locales and at both artboard widths, which is the AC-7
 * property: one deterministic box, nothing measured after paint. `header-model.ts` records why
 * each differs from the artboards' band sum (167 / 173).
 */
const HEADER_HEIGHTS = { mobile: 245, desktop: 183 } as const;

/**
 * The two boxes that sum to it: the strip that scrolls, and the banner that sticks (§14 A4's
 * addendum, mechanism iii — `header-model.ts` records why an inner sticky wrapper and a negative
 * sticky offset were both measured and rejected).
 *
 * utility mobile  = 113 (three lines at 390 px) + 1 rule
 * utility desktop = 44 (the strip carries links, and a link owes 44 px) + 1 rule
 * sticky  mobile  = 50 masthead + 52 search band + 28 category row + 2 rules
 * sticky  desktop = 84 masthead + 52 category row + 2 rules
 */
const UTILITY_HEIGHTS = { mobile: 113, desktop: 45 } as const;
const STICKY_HEIGHTS = { mobile: 132, desktop: 138 } as const;

/** The two artboard widths, for the assertions that must hold at both (§14 A4). */
const ARTBOARDS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

/** §5.3/§8's minimum tap target, in CSS pixels. */
const MIN_TARGET = 44;

/** `{ path, currency }` — the four launch locales and the chip AC-8 pins to each of them. */
const LOCALES = [
  { path: "/en", currency: "EUR", home: "/en" },
  { path: "/en-gb", currency: "GBP", home: "/en-gb" },
  { path: "/de", currency: "EUR", home: "/de" },
  { path: "/pl", currency: "PLN", home: "/pl" },
] as const;

/** Tailwind's `md` breakpoint is 48rem; below it the mobile artboard's bands apply. */
const MD_BREAKPOINT = 768;

/** Sum of every layout-shift entry the page reported (the banner suite's measurement, locally). */
async function cumulativeLayoutShift(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            };
            if (!shift.hadRecentInput) total += shift.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => {
          resolve(total);
        }, 500);
      }),
  );
}

test.describe("the site header (AC-7)", () => {
  for (const { path } of LOCALES) {
    test(`${path} renders the header at its artboard's reserved height`, async ({
      page,
    }) => {
      // The banner is a client island that overlays the page; emptying the language list keeps it
      // out of the way of a height measurement (the reason is documented in the visual suite).
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          get: () => [],
        });
      });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const header = page.locator(HEADER);
      const utility = page.locator(UTILITY);
      await expect(header).toBeVisible();
      await expect(utility).toBeVisible();

      const viewport = page.viewportSize();
      const wide = (viewport?.width ?? 0) >= MD_BREAKPOINT;
      const height = async (locator: import("@playwright/test").Locator) =>
        Math.round((await locator.boundingBox())?.height ?? 0);

      // Reserved, not measured after paint: the same two boxes in every locale, to the pixel …
      expect(await height(utility)).toBe(
        wide ? UTILITY_HEIGHTS.desktop : UTILITY_HEIGHTS.mobile,
      );
      expect(await height(header)).toBe(
        wide ? STICKY_HEIGHTS.desktop : STICKY_HEIGHTS.mobile,
      );
      // … and the chrome the document reserves is their sum, which the addendum left unchanged.
      expect((await height(utility)) + (await height(header))).toBe(
        wide ? HEADER_HEIGHTS.desktop : HEADER_HEIGHTS.mobile,
      );

      // The banner sticks at the header layer, so neither banner island can end up under it;
      // the strip above it is an ordinary, in-flow `<div>` that scrolls with the page.
      await expect(header).toHaveCSS("position", "sticky");
      await expect(utility).toHaveCSS("position", "static");

      // Nothing the header does shifts the page.
      expect(await cumulativeLayoutShift(page)).toBe(0);
    });
  }

  test("the header box is the same with JavaScript disabled (pre/post hydration)", async ({
    browser,
    page,
  }) => {
    await page.goto("/en");
    const hydratedStrip = await page.locator(UTILITY).boundingBox();
    const hydratedBanner = await page.locator(HEADER).boundingBox();

    const context = await browser.newContext({ javaScriptEnabled: false });
    const plain = await context.newPage();
    try {
      await plain.goto("/en");
      // Both boxes, so the split cannot hide a shift in either one.
      expect(await plain.locator(UTILITY).boundingBox()).toEqual(hydratedStrip);
      expect(await plain.locator(HEADER).boundingBox()).toEqual(hydratedBanner);
    } finally {
      await context.close();
    }
  });

  test("the banner is the sticky part and the utility strip is outside it (§14 A4 addendum)", async ({
    page,
  }) => {
    await page.goto("/en");

    // One `banner`, and it is the sticky element — not a wrapper over all three bands.
    const banner = page.getByRole("banner");
    await expect(banner).toHaveCount(1);
    await expect(banner).toHaveAttribute("data-fo-header", "true");

    // The strip is a sibling before it, not a descendant: it is neither a landmark nor sticky, so
    // its claims and help channel cost a first screen rather than 113 px of every screen.
    expect(
      await page.evaluate(() => {
        const utility = document.querySelector("[data-fo-utility]");
        const header = document.querySelector("[data-fo-header]");
        return {
          nested: header?.contains(utility) ?? true,
          precedes:
            utility !== null &&
            header !== null &&
            (utility.compareDocumentPosition(header) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
              0,
          role: utility?.getAttribute("role"),
        };
      }),
    ).toEqual({ nested: false, precedes: true, role: null });
  });

  /**
   * The property the split exists for. `/en` is short in Phase 0 (194 px of scroll at 390 × 844,
   * none at 1440 × 900), so the viewport is shortened to give the page room — and the gallery is
   * **not** usable for this: `/dev/components` renders a *demo copy* of the header inside `<main>`
   * in a bordered wrapper whose containing block is the header's own box, so that instance
   * scrolls with the page by construction (measured: top 7 277 px after a 600 px scroll).
   */
  for (const { width, height, scroll } of [
    { width: 390, height: 300, scroll: 600 },
    { width: 1440, height: 300, scroll: 235 },
  ] as const) {
    test(`at ${String(width)} px the banner pins to the top and the strip scrolls away`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/en");

      // Enough room to scroll past the strip, which is what makes the assertion meaningful.
      const room = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(room).toBeGreaterThanOrEqual(scroll);

      await page.evaluate((to) => {
        window.scrollTo(0, to);
      }, scroll);
      const after = await page.evaluate(() => ({
        y: Math.round(window.scrollY),
        banner: Math.round(
          document.querySelector("[data-fo-header]")?.getBoundingClientRect()
            .top ?? Number.NaN,
        ),
        strip: Math.round(
          document.querySelector("[data-fo-utility]")?.getBoundingClientRect()
            .bottom ?? Number.NaN,
        ),
      }));

      expect(after.y).toBe(scroll);
      // The masthead is at the top of the viewport …
      expect(after.banner).toBe(0);
      // … and the whole strip is above it, off screen.
      expect(after.strip).toBeLessThanOrEqual(0);
    });
  }

  test("the wordmark lockup navigates to the locale home", async ({
    page,
    context,
    baseURL,
  }) => {
    // A returning German visitor, so §14 A14's modal suggestion is silent and this test is about
    // the lockup rather than about whichever island mounted first (TASK-119).
    await recordLocaleChoice(context, "de", baseURL);
    await page.goto("/de");
    await page.locator(`${HEADER} a[href="/de"]`).first().click();

    await expect(page).toHaveURL(/\/de$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("hosts spec 003's locale switcher, unchanged", async ({ page }) => {
    await page.goto("/en");

    const switcher = page.locator("[data-fo-header-switcher] nav");
    await expect(switcher).toHaveAttribute("aria-label", "Change language");
    await expect(switcher.locator("li")).toHaveCount(4);
    await expect(switcher.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test("renders every unpublished target as text, and every header link answers 200", async ({
    page,
    request,
  }) => {
    await page.goto("/en");

    // Not one category, account item or `For florists` entry is a link (AC-14).
    const items = page.locator("[data-fo-header-item]");
    await expect(items).not.toHaveCount(0);
    for (const handle of await items.all()) {
      expect(await handle.evaluate((node) => node.tagName)).toBe("SPAN");
    }

    const internal = await page
      .locator(inChrome('a[href^="/"]'))
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
    }
  });

  test("the search band holds no form control at all (§14 A4)", async ({
    page,
  }) => {
    await page.goto("/en");

    // Nothing to submit, nothing to focus: the band is the two boxes the artboards draw, as text.
    await expect(
      page.locator(
        [inChrome("form"), inChrome("input"), inChrome("select")].join(", "),
      ),
    ).toHaveCount(0);
    await expect(page.locator(inChrome('button[type="submit"]'))).toHaveCount(
      0,
    );
    const band = page.locator("[data-fo-header-search]");
    await expect(band).toContainText(
      "Search flowers, occasions, a city or a country",
    );
    // …and it is not in the tab order, because a focus stop that does nothing is a failure.
    await expect(band.locator("a, button, input, [tabindex]")).toHaveCount(0);
  });

  test("every rendered link clears 44 px at both artboard widths (§5.3, §8, §14 A4)", async ({
    page,
  }) => {
    for (const viewport of ARTBOARDS) {
      await page.setViewportSize(viewport);
      await page.goto("/en");

      // Both elements: the strip holds four of the six links (§14 A4's addendum re-scoped this).
      const measured = await page.locator(inChrome("a")).evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            href: node.getAttribute("href") ?? "",
            height: Math.round(box.height),
            width: Math.round(box.width),
          };
        }),
      );

      // The help channel's two links, the masthead lockup and the switcher's three siblings.
      expect(measured.length, String(viewport.width)).toBe(6);
      for (const link of measured) {
        expect(
          link.height,
          `${String(viewport.width)}px ${link.href}`,
        ).toBeGreaterThanOrEqual(MIN_TARGET);
        // A link with no text of its own owes the target in both dimensions.
        if (link.href.startsWith("https://wa.me/")) {
          expect(link.width, link.href).toBeGreaterThanOrEqual(MIN_TARGET);
        }
      }
    }
  });

  test("the currency chip and the switcher are visible at 390 px without scrolling (AC-8, §14 A4)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");

    const boxes = await page.evaluate(() => {
      // Measured inside the **utility strip's** box: §14 A4's addendum moved the strip out of the
      // banner, and both controls live in the strip.
      const header = document.querySelector("[data-fo-utility]");
      const chip = document.querySelector("[data-fo-header-currency]");
      const switcher = document.querySelector("[data-fo-header-switcher]");
      const round = (box: DOMRect) => ({
        x: Math.round(box.x),
        y: Math.round(box.y),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
      });
      return {
        header: round(header?.getBoundingClientRect() as DOMRect),
        chip: round(chip?.getBoundingClientRect() as DOMRect),
        switcher: round(switcher?.getBoundingClientRect() as DOMRect),
        viewport: window.innerWidth,
      };
    });

    // Inside the strip's own box — the failure of round 1 was a chip 120–570 px outside it,
    // inside the category row's horizontal scroll.
    for (const box of [boxes.chip, boxes.switcher]) {
      expect(box.x).toBeGreaterThanOrEqual(boxes.header.x);
      expect(box.right).toBeLessThanOrEqual(boxes.header.right);
      expect(box.y).toBeGreaterThanOrEqual(boxes.header.y);
      expect(box.bottom).toBeLessThanOrEqual(boxes.header.bottom);
      // And inside the viewport, with no horizontal scroll to reach it.
      expect(box.right).toBeLessThanOrEqual(boxes.viewport);
    }
    // Neither box scrolls horizontally, so there is nothing to scroll *to* in order to see them.
    expect(
      await page.evaluate(() =>
        ["[data-fo-utility]", "[data-fo-header]"].map((selector) => {
          const node = document.querySelector(selector);
          return node?.scrollWidth === node?.clientWidth;
        }),
      ),
    ).toEqual([true, true]);
  });

  test("the menu glyph is decoration, not a control (`/review 31`, TASK-055)", async ({
    page,
  }) => {
    await page.goto("/en");
    // Not `getByRole`: the glyph is `md:hidden` *and* `aria-hidden`, so it is out of the
    // accessibility tree entirely — which is the correct answer for an affordance that does
    // nothing, and is exactly why the assertion reads the DOM.
    await expect(
      page.locator('[data-fo-header-menu="unpublished"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-fo-header-menu="unpublished"]'),
    ).toHaveAttribute("aria-hidden", "true");
    // No button in the header at all: nothing that looks pressable and is not.
    await expect(page.locator("[data-fo-header] button")).toHaveCount(0);
  });
});

test.describe("the currency chip (AC-8)", () => {
  for (const { path, currency } of LOCALES) {
    test(`${path} prints ${currency} with a localised label and no cookie`, async ({
      page,
    }) => {
      await page.goto(path);

      const chip = page.locator("[data-fo-header-currency] > *");
      await expect(chip).toHaveText(currency);
      await expect(chip).toHaveAttribute(
        "aria-label",
        new RegExp(`${currency}$`),
      );
    });
  }

  test("the document is byte-identical with and without an `fo_currency` cookie", async ({
    request,
  }) => {
    for (const { path } of LOCALES) {
      const plain = await request.get(path);
      const withCookie = await request.get(path, {
        headers: { cookie: "fo_currency=PLN" },
      });

      expect(plain.status()).toBe(200);
      expect(withCookie.status()).toBe(200);
      const hash = (body: string) =>
        createHash("sha256").update(body).digest("hex");
      expect(hash(await withCookie.text()), path).toBe(
        hash(await plain.text()),
      );
      // And no response writes one either (spec 001 AC-15, spec 003 AC-12 stay green).
      expect(
        Object.keys(withCookie.headers()).map((name) => name.toLowerCase()),
        path,
      ).not.toContain("set-cookie");
    }
  });
});
