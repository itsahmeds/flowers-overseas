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
 *  - **nothing is drawn for a target with no page** (spec 004 §14 A20; TASK-173): no search band,
 *    no account cluster, no menu glyph and no category entry without a hub — and every entry the
 *    category row does draw is a link that answers 200;
 *  - **every rendered link measures at least 44 px tall** at both artboard widths (§5.3, §8), and
 *    the currency chip sits inside the header's visible box at 390 px (§14 A4's AC-8 fix);
 *  - **no header link points at an unpublished target** (AC-14's header half, verified in full by
 *    TASK-054's crawl and TASK-173's chrome crawl in `tests/e2e/links.spec.ts`): every internal
 *    `href` in the header answers 200.
 */
import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

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
 * The v2 chrome's heights per breakpoint (TASK-176, spec 004 §14 A21 clause 7: "A7's reserved
 * header height takes v2's values"), **restated** rather than imported from
 * `src/modules/ui/layout/header-model.ts`: a test that imports the number the component renders
 * agrees with the component by construction. Measured on a production build at 390, 412, 768,
 * 1 023, 1 024, 1 280 and 1 440 px in `en`, `de` and `pl`, identical in all three:
 *
 * notice bar mobile  = 36 (8 + one 14 px line at 1.4 + 8; 35.6 rounded) — below `lg` it carries no
 *                      links, so it is one sentence
 * notice bar desktop = 62 (9 + the 44 px utility links + 9) from `lg` (1 024 px)
 * sticky mobile      = 64 masthead + 56 chip row (44 px chips + 12) + 1 rule = 121, below `xl`
 * sticky desktop     = 82 masthead (logo, the eight links, the pill) + 1 rule = 83, from `xl`
 *
 * v1 was 113 + 96 = 209 on mobile and 45 + 138 = 183 on desktop (TASK-173). Both boxes are
 * server-rendered with no island, so they are the same before and after hydration (AC-7).
 */
const UTILITY_HEIGHTS = { mobile: 36, desktop: 62 } as const;
const STICKY_HEIGHTS = { mobile: 121, desktop: 83 } as const;
const HEADER_HEIGHTS = {
  mobile: UTILITY_HEIGHTS.mobile + STICKY_HEIGHTS.mobile,
  desktop: UTILITY_HEIGHTS.desktop + STICKY_HEIGHTS.desktop,
} as const;

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

/**
 * Tailwind's `xl` breakpoint (80rem): from it the desktop artboard's one-row header applies, and
 * the notice bar carries its links (they start at `lg`). The two e2e projects sit either side of
 * it: `e2e-mobile` (412 px) and `e2e-desktop` (1 280 px).
 */
const XL_BREAKPOINT = 1280;

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
      const wide = (viewport?.width ?? 0) >= XL_BREAKPOINT;
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

    // The notice bar is a sibling before it, not a descendant: it is `role="note"` (not a
    // landmark) and not sticky, so its claims cost a first screen rather than every screen.
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
    ).toEqual({ nested: false, precedes: true, role: "note" });
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

  test("the wordmark lockup navigates to the locale home", async ({ page }) => {
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

  test("draws no element for a target with no page, and every header link answers 200", async ({
    page,
    request,
  }) => {
    await page.goto("/en");

    // Every keyed entry is a link (spec 004 §14 A20; TASK-173): not one `<span>` dressed as one.
    const items = page.locator("[data-fo-header-item]");
    await expect(items).toHaveCount(8);
    for (const handle of await items.all()) {
      expect(await handle.evaluate((node) => node.tagName)).toBe("A");
    }
    // And the targets with no page are absent, not text.
    for (const id of [
      "sign-in",
      "my-orders",
      "basket",
      "for-florists",
      "add-ons",
      "same-day-delivery",
    ]) {
      await expect(
        page.locator(`[data-fo-header-item="${id}"]`),
        id,
      ).toHaveCount(0);
    }
    for (const word of [
      "Sign in",
      "My orders",
      "Basket",
      "For florists",
      "Add-ons",
    ]) {
      await expect(page.locator(HEADER), word).not.toContainText(word);
    }

    const internal = await page
      .locator(inChrome('a[href^="/"]'))
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) {
      const response = await request.get(href, { maxRedirects: 0 });
      expect(response.status(), href).toBe(200);
    }
  });

  test("draws no search band and no form control at all (§14 A20)", async ({
    page,
  }) => {
    await page.goto("/en");

    // Search has no page, so there is no band: not a field, not the text shaped like one.
    await expect(page.locator("[data-fo-header-search]")).toHaveCount(0);
    await expect(
      page.locator(
        [inChrome("form"), inChrome("input"), inChrome("select")].join(", "),
      ),
    ).toHaveCount(0);
    await expect(page.locator(inChrome("button"))).toHaveCount(0);
    await expect(page.locator(HEADER)).not.toContainText(
      "Search flowers, occasions, a city or a country",
    );
  });

  test("every rendered link clears 44 px at both artboard widths (§5.3, §8)", async ({
    page,
  }) => {
    for (const viewport of ARTBOARDS) {
      await page.setViewportSize(viewport);
      await page.goto("/en");

      // Only **rendered** links: below `lg` the notice bar's links have no box at all.
      const measured = (
        await page.locator(inChrome("a")).evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return {
              href: node.getAttribute("href") ?? "",
              height: Math.round(box.height),
              width: Math.round(box.width),
            };
          }),
        )
      ).filter((link) => link.width > 0);

      // The logo, the eight category links and the Send pill at both widths; at 1 440 px also the
      // help line and the switcher's three siblings in the notice bar.
      const notice = viewport.width >= XL_BREAKPOINT ? 4 : 0;
      expect(measured.length, String(viewport.width)).toBe(10 + notice);
      for (const link of measured) {
        expect(
          link.height,
          `${String(viewport.width)}px ${link.href}`,
        ).toBeGreaterThanOrEqual(MIN_TARGET);
      }
    }
  });

  test("nothing in the chrome overflows the viewport at 390 px; only the chip row scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");

    const boxes = await page.evaluate(() => {
      const fits = (selector: string) => {
        const node = document.querySelector(selector);
        return node !== null && node.scrollWidth <= node.clientWidth;
      };
      const row = document.querySelector(
        '[data-fo-header-band="categories"] ul',
      );
      const send = document
        .querySelector('[data-fo-header] a[href$="#send"]')
        ?.getBoundingClientRect();
      return {
        document: document.documentElement.scrollWidth <= window.innerWidth,
        utility: fits("[data-fo-utility]"),
        header: fits("[data-fo-header]"),
        footer: fits("footer"),
        // The eight chips are one horizontally scrolling row (the artboard's), inside the banner.
        rowScrolls:
          row !== null &&
          row.scrollWidth > row.clientWidth &&
          getComputedStyle(row).overflowX === "auto",
        sendInside: send !== undefined && send.right <= window.innerWidth,
      };
    });
    expect(boxes).toEqual({
      document: true,
      utility: true,
      header: true,
      footer: true,
      rowScrolls: true,
      sendInside: true,
    });
  });

  test("the switcher and the currency sit in the notice bar at 1 440 px, visible (AC-8)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    await expect(page.locator("[data-fo-header-switcher]")).toBeVisible();
    await expect(page.locator("[data-fo-header-currency]")).toBeVisible();
    // On the mobile artboard the languages move to the footer (chrome-mobile.dc.html).
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-fo-header-switcher]")).toBeHidden();
    await expect(
      page
        .getByRole("contentinfo")
        .locator('nav[aria-label="Change language"]'),
    ).toHaveCount(1);
  });

  test("draws no menu glyph, because it opened nothing (§14 A20)", async ({
    page,
  }) => {
    await page.goto("/en");
    // `/review 31` turned a dead button into decoration; spec 004 §14 A20 removes the decoration
    // too, because a glyph that looks like a menu and opens nothing is the defect itself.
    await expect(page.locator("[data-fo-header-menu]")).toHaveCount(0);
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

      const chip = page.locator("[data-fo-header-currency]");
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
