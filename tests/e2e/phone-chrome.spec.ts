/**
 * T-52 (AC-47) and T-55 (AC-50, AC-32's phone half): the phone header, its Menu, and the back link
 * in place of the trail (spec 004 §14 A24 clauses 3 and 4 (e); TASK-195).
 *
 * The repository half is `tests/unit/ui-phone-chrome.test.tsx`; this file measures what needs a
 * browser: boxes, display, focus, JavaScript on and off, and the served `BreadcrumbList`.
 *
 * Every case is watched red by mutating its subject: the strip rendered below `md` turns the
 * "no utility strip" and "two controls" cases red; the trail's ancestors removed from the HTML
 * below `md` (or the product trail hidden at 390) turns the `BreadcrumbList` and the product case
 * red.
 */
import { type Browser, type Page, expect, test } from "@playwright/test";

const HEADER = "[data-fo-header]";
const UTILITY = "[data-fo-utility]";
const MENU = "[data-fo-menu]";
const SUMMARY = "[data-fo-menu-summary]";
const PANEL = "[data-fo-menu-panel]";

/** AC-47's two phone sizes. */
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;
const DESKTOP = { width: 1440, height: 900 } as const;

/** AC-47's page set: AC-41's nine, the product page and a trust page (spec 041 has none yet). */
const CHROME_PAGES = [
  "/en-gb",
  "/en-gb/poland/flowers",
  "/en-gb/poland/flowers/roses",
  "/en-gb/poland/occasions/mothers-day",
  "/en-gb/occasions/birthday",
  "/en-gb/flowers/roses",
  "/en-gb/occasions",
  "/en-gb/send-flowers-to",
  "/en-gb/send-flowers-to/poland",
  "/en-gb/poland/product/anthurium",
] as const;

/** 65 ± 1 px: the logo and Menu row and its rule. */
const PHONE_HEADER = 65;
const MIN_TARGET = 44;

/** The header's controls that hold a box: links and summaries with a non-zero rect. */
async function displayedControls(page: Page): Promise<string[]> {
  return page.locator(`${HEADER} a, ${HEADER} summary`).evaluateAll((nodes) =>
    nodes
      // Rendered and not inside a closed disclosure (`checkVisibility` is false there: the
      // closed `<details>` hides its content with `content-visibility`, which a rect does not).
      .filter((node) =>
        node.checkVisibility({
          contentVisibilityAuto: true,
          visibilityProperty: true,
        }),
      )
      .map((node) =>
        node.tagName === "SUMMARY"
          ? "summary"
          : node.hasAttribute("data-fo-header-logo")
            ? "logo"
            : (node.getAttribute("href") ?? ""),
      ),
  );
}

async function headerBox(page: Page) {
  return page.locator(HEADER).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top, height: box.height, width: box.width };
  });
}

async function noScriptPage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport,
  });
  return { context, page: await context.newPage() };
}

test.describe("T-52: the phone header (AC-47)", () => {
  for (const viewport of PHONES) {
    for (const path of CHROME_PAGES) {
      test(`${path} at ${String(viewport.width)} × ${String(viewport.height)}: 65 px, the logo and Menu only, no strip`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);

        expect(
          Math.abs((await headerBox(page)).height - PHONE_HEADER),
        ).toBeLessThanOrEqual(1);
        expect(await displayedControls(page)).toEqual(["logo", "summary"]);
        // No utility-strip element is displayed: not the strip, not anything inside it.
        await expect(page.locator(UTILITY)).toBeHidden();
        expect(
          await page
            .locator(`${UTILITY} *`)
            .evaluateAll(
              (nodes) =>
                nodes.filter((node) => node.getBoundingClientRect().height > 0)
                  .length,
            ),
        ).toBe(0);
      });
    }

    test(`at ${String(viewport.width)} px the header box is the same with JavaScript off and on (AC-7)`, async ({
      browser,
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/en-gb/poland/flowers");
      await page.waitForLoadState("networkidle");
      const hydrated = await headerBox(page);
      const { context, page: plain } = await noScriptPage(browser, viewport);
      try {
        await plain.goto("/en-gb/poland/flowers");
        expect(await headerBox(plain)).toEqual(hydrated);
      } finally {
        await context.close();
      }
    });

    test(`at ${String(viewport.width)} px, with JavaScript off, Menu reveals the links, Send flowers, the languages, the currency and the help line, each ≥ 44 px`, async ({
      browser,
    }) => {
      const { context, page } = await noScriptPage(browser, viewport);
      try {
        await page.goto("/en-gb");
        await expect(page.locator(PANEL)).toBeHidden();
        await page.locator(SUMMARY).click();
        await expect(page.locator(`${MENU}[open]`)).toHaveCount(1);

        const items = page.locator("[data-fo-menu-item]");
        expect(await items.count()).toBe(
          await page.locator("[data-fo-header-item]").count(),
        );
        await expect(page.locator(`${PANEL} a[href="/en-gb#send"]`)).toHaveText(
          "Send flowers",
        );
        const switcher = page.locator("[data-fo-menu-switcher] nav");
        await expect(switcher).toHaveAttribute("aria-label", "Change language");
        // T-52's Menu case (spec 004 §14 A-founder-2026-10-14e): the language links of
        // `shownLocales()`, today English and English (UK), and no hidden locale.
        await expect(switcher.locator("li")).toHaveCount(2);
        await expect(switcher.locator('[aria-current="page"]')).toHaveCount(1);
        expect(
          await switcher
            .locator("a")
            .evaluateAll((nodes) =>
              nodes.map((node) => node.getAttribute("hreflang")),
            ),
        ).toEqual(["en"]);
        const currency = page.locator("[data-fo-menu-currency]");
        await expect(currency).toHaveText("GBP");
        await expect(currency).toHaveAttribute("aria-label", /GBP$/u);
        // Spec 041 AC-34: the help line opens WhatsApp, never `tel:`.
        await expect(page.locator(`${PANEL} a[href^="tel:"]`)).toHaveCount(0);
        await expect(
          page.locator(`${PANEL} a[href="https://wa.me/12135925150"]`),
        ).toHaveCount(1);

        // Every target in the panel, scrolled into view inside the panel, is ≥ 44 px tall.
        const heights = await page.locator(`${PANEL} a`).evaluateAll((nodes) =>
          nodes.map((node) => ({
            href: node.getAttribute("href") ?? "",
            height: Math.round(node.getBoundingClientRect().height),
          })),
        );
        expect(heights.length).toBe((await items.count()) + 1 + 1 + 1);
        for (const { href, height } of heights) {
          expect(height, href).toBeGreaterThanOrEqual(MIN_TARGET);
        }
        // The last target is reachable inside the panel (it scrolls in itself under the header).
        const help = page.locator(
          `${PANEL} a[href="https://wa.me/12135925150"]`,
        );
        await help.scrollIntoViewIfNeeded();
        await expect(help).toBeInViewport();

        // And it closes again with no script.
        await page.locator(SUMMARY).click();
        await expect(page.locator(`${MENU}[open]`)).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }

  test("with JavaScript on, Esc closes the Menu and focus returns to the summary", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en-gb");
    await page.waitForLoadState("networkidle");
    await expect(async () => {
      if ((await page.locator(`${MENU}[open]`).count()) === 0) {
        await page.locator(SUMMARY).click();
      }
      await page.locator("[data-fo-menu-item]").first().focus();
      await page.keyboard.press("Escape");
      await expect(page.locator(`${MENU}[open]`)).toHaveCount(0, {
        timeout: 500,
      });
    }).toPass({ timeout: 10_000 });
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.hasAttribute("data-fo-menu-summary") ?? false,
      ),
    ).toBe(true);
  });

  test("at 1440 × 900 the strip and the full header render as before, and the Menu is not drawn", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/en-gb");
    await expect(page.locator(UTILITY)).toBeVisible();
    expect(Math.round((await headerBox(page)).height)).toBe(83);
    await expect(page.locator(MENU)).toBeHidden();
    await expect(page.locator("[data-fo-header-item]")).toHaveCount(8);
    for (const item of await page.locator("[data-fo-header-item]").all()) {
      await expect(item).toBeVisible();
    }
    await expect(page.locator("[data-fo-header-switcher]")).toBeVisible();
    await expect(page.locator("[data-fo-header-currency]")).toHaveText("GBP");
  });
});

/**
 * T-52 as spec 004 §14 A-founder-2026-10-19c clause 3 and 5 amend it (AC-47; TASK-282): the open
 * Menu with JavaScript on, and the short-screen header. Red with the Menu left open after Send
 * flowers, and red with the header sticky at 640 × 400.
 */
test.describe("T-52 (A-founder-2026-10-19c): the open Menu and short screens (AC-47)", () => {
  const SCRIM = "[data-fo-menu-scrim]";
  const SHOP = "/en-gb/poland/flowers";

  /** The motion module carries the Menu's enhancements; it loads after the paint by itself. */
  async function withModule(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1, {
      timeout: 15_000,
    });
  }

  async function openMenu(page: Page): Promise<void> {
    await page.locator(SUMMARY).click();
    await expect(page.locator(`${MENU}[open]`)).toHaveCount(1);
    await expect(page.locator(SCRIM)).toBeVisible();
  }

  for (const viewport of PHONES) {
    test(`at ${String(viewport.width)} × ${String(viewport.height)}: a scrim covers the page below the header, the summary is named by the close label`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await withModule(page, SHOP);
      await expect(page.locator(SUMMARY)).toHaveAccessibleName("Menu");
      await openMenu(page);
      await expect(page.locator(SUMMARY)).toHaveAccessibleName("Close");
      const scrim = (await page.locator(SCRIM).boundingBox())!;
      const header = await headerBox(page);
      expect(
        Math.abs(scrim.y - (header.top + header.height)),
      ).toBeLessThanOrEqual(1);
      expect(scrim.y + scrim.height).toBeCloseTo(viewport.height, 0);
      expect(scrim.width).toBeCloseTo(viewport.width, 0);
      // It dims: the scrim token, painted, over everything below the header but the panel.
      expect(
        await page
          .locator(SCRIM)
          .evaluate((node) => getComputedStyle(node).backgroundColor),
      ).not.toBe("rgba(0, 0, 0, 0)");
    });
  }

  test("at 390 × 844 a tap on the scrim closes the Menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withModule(page, SHOP);
    await openMenu(page);
    const panel = (await page.locator(PANEL).boundingBox())!;
    // A point on the scrim, below the panel's foot: what a visitor taps to dismiss.
    const y = Math.round((panel.y + panel.height + 844) / 2);
    expect(y).toBeLessThan(844);
    expect(
      await page.evaluate(
        ([x, at]) =>
          document
            .elementFromPoint(x!, at!)
            ?.hasAttribute("data-fo-menu-scrim") ?? false,
        [195, y],
      ),
    ).toBe(true);
    await page.mouse.click(195, y);
    await expect(page.locator(`${MENU}[open]`)).toHaveCount(0);
    await expect(page.locator(SCRIM)).toBeHidden();
  });

  for (const viewport of PHONES) {
    test(`at ${String(viewport.width)} × ${String(viewport.height)}: Tab and Shift+Tab keep focus inside the Menu and its summary`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await withModule(page, SHOP);
      await openMenu(page);
      const inside = () =>
        page.evaluate(
          () =>
            document.activeElement?.closest("details[data-fo-menu]") !== null,
        );
      await page.locator(SUMMARY).focus();
      const stops = await page
        .locator(`${MENU} summary, ${MENU} a[href]`)
        .evaluateAll(
          (nodes) =>
            nodes.filter((node) => node.getClientRects().length > 0).length,
        );
      for (let press = 0; press < stops + 2; press += 1) {
        await page.keyboard.press("Tab");
        expect(await inside(), `Tab ${String(press + 1)}`).toBe(true);
      }
      // Round the end: the summary is the stop after the last.
      await page.locator(SUMMARY).focus();
      await page.keyboard.press("Shift+Tab");
      expect(await inside()).toBe(true);
      expect(
        await page.evaluate(() =>
          document.activeElement?.hasAttribute("data-fo-menu-summary"),
        ),
      ).toBe(false);
      // `Esc` still leaves (no keyboard trap, WCAG 2.1.2).
      await page.keyboard.press("Escape");
      await expect(page.locator(`${MENU}[open]`)).toHaveCount(0);
      await expect(page.locator(SUMMARY)).toBeFocused();
    });
  }

  test("off the home, Send flowers is a link to the home's #send, and activating it leaves for the home", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withModule(page, SHOP);
    await openMenu(page);
    const send = page.locator(`${PANEL} a[href$="#send"]`);
    await expect(send).toHaveAttribute("href", "/en-gb#send");
    await send.click();
    await page.waitForURL(/\/en-gb#send$/u);
  });

  for (const viewport of [
    { width: 390, height: 844, from: "menu" },
    { width: 360, height: 640, from: "menu" },
    { width: 1440, height: 900, from: "pill" },
  ] as const) {
    test(`on the home at ${String(viewport.width)} × ${String(viewport.height)}, Send flowers (${viewport.from}) closes the Menu, brings the letter in below the header and focuses its first choice`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await withModule(page, "/en-gb");
      if (viewport.from === "menu") {
        await openMenu(page);
        await page.locator(`${PANEL} a[href$="#send"]`).click();
        await expect(page.locator(`${MENU}[open]`)).toHaveCount(0);
      } else {
        await page
          .locator(`${HEADER} a[href$="#send"]:visible`)
          .first()
          .click();
      }
      await expect(page.locator("[data-fo-sentence-who]")).toBeFocused();
      const header = await headerBox(page);
      const letter = await page.evaluate(() => {
        const form = document.getElementById("send")!;
        const card = form.closest("[data-fo-hero-card]");
        const box = (
          card !== null && getComputedStyle(card).display !== "contents"
            ? card
            : form
        ).getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      expect(letter.top).toBeGreaterThanOrEqual(header.top + header.height - 1);
      expect(letter.top).toBeLessThan(viewport.height);
      // The page stayed where it was: no navigation, no jump to the anchor.
      expect(new URL(page.url()).pathname).toBe("/en-gb");
    });
  }

  for (const viewport of [
    { width: 640, height: 400 },
    { width: 844, height: 390 },
  ] as const) {
    test(`at ${String(viewport.width)} × ${String(viewport.height)} the header is not sticky and the home's H1 is on the first screen`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/en");
      expect(
        await page
          .locator(HEADER)
          .evaluate((node) => getComputedStyle(node).position),
      ).not.toMatch(/^(sticky|fixed)$/u);
      const h1 = (await page.locator("h1").boundingBox())!;
      expect(h1.y).toBeGreaterThanOrEqual(0);
      expect(h1.y + h1.height).toBeLessThanOrEqual(viewport.height);
      // And it is not under the header either.
      const header = await headerBox(page);
      expect(h1.y).toBeGreaterThanOrEqual(header.top + header.height - 1);
    });
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ] as const) {
    test(`at ${String(viewport.width)} × ${String(viewport.height)} the header is sticky as before`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/en");
      expect(
        await page
          .locator(HEADER)
          .evaluate((node) => getComputedStyle(node).position),
      ).toBe("sticky");
    });
  }
});

/** Every page type with a breadcrumb that exists today (spec 004 AC-50), in `/en-gb`. */
const WITH_BREADCRUMB = {
  countryShop: "/en-gb/poland/flowers",
  countryCategory: "/en-gb/poland/flowers/roses",
  countryOccasion: "/en-gb/poland/occasions/mothers-day",
  occasionHub: "/en-gb/occasions/birthday",
  categoryHub: "/en-gb/flowers/roses",
  occasionsIndex: "/en-gb/occasions",
  destinationsHub: "/en-gb/send-flowers-to",
  guide: "/en-gb/send-flowers-to/poland",
  product: "/en-gb/poland/product/anthurium",
} as const;

/** The types whose route serves `BreadcrumbList` today (spec 007 AC-15). */
const SERVES_BREADCRUMB_LIST = new Set(["destinationsHub", "guide"]);

interface TrailItem {
  readonly name: string;
  readonly href: string | null;
}

/** The trail in the HTML: one `{ name, href }` per `<li>`, separators out. */
async function htmlTrail(page: Page): Promise<TrailItem[]> {
  return page
    .locator("main [data-fo-breadcrumb-trail] > li")
    .evaluateAll((items) =>
      items.map((item) => {
        const clone = item.cloneNode(true) as Element;
        for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
          hidden.remove();
        }
        return {
          name: (clone.textContent ?? "").replaceAll(/\s+/gu, " ").trim(),
          href: item.querySelector("a")?.getAttribute("href") ?? null,
        };
      }),
    );
}

/** The served `BreadcrumbList`, if the document has one. */
async function servedList(page: Page): Promise<TrailItem[] | undefined> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  for (const block of blocks) {
    const parsed = JSON.parse(block) as unknown;
    const nodes = (
      Array.isArray(parsed)
        ? parsed
        : ((parsed as { "@graph"?: unknown[] })["@graph"] ?? [parsed])
    ) as Record<string, unknown>[];
    const list = nodes.find((node) => node["@type"] === "BreadcrumbList");
    if (list === undefined) continue;
    return (
      (list["itemListElement"] ?? []) as {
        name?: string;
        item?: string | { "@id"?: string };
      }[]
    ).map((entry) => {
      const item =
        typeof entry.item === "string" ? entry.item : entry.item?.["@id"];
      return {
        name: entry.name ?? "",
        href: item === undefined ? null : new URL(item).pathname,
      };
    });
  }
  return undefined;
}

const displayOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => getComputedStyle(node).display);

test.describe("T-55: the back link and the trail (AC-50, AC-32's phone half)", () => {
  for (const [type, path] of Object.entries(WITH_BREADCRUMB)) {
    test(`${type} (${path}) at 390 × 844 and 1440 × 900`, async ({ page }) => {
      // 390 × 844 first.
      await page.setViewportSize({ width: 390, height: 844 });
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const trail = await htmlTrail(page);
      // The trail is in the server HTML at this width: its ancestors and its current page.
      expect(trail.length, `${path} trail`).toBeGreaterThanOrEqual(2);
      // The last ancestor **with a page** (review ruling, PR 208): on the category hub "Flowers"
      // is text, so the back link is `‹ Home` there.
      const ancestor = trail
        .slice(0, -1)
        .filter(({ href }) => href !== null)
        .at(-1);
      expect(ancestor, `${path} has a linked ancestor`).toBeDefined();

      if (type === "product") {
        // The product page displays its trail and draws no back link.
        await expect(page.locator("main [data-fo-back-link]")).toHaveCount(0);
        expect(
          await displayOf(page, "main [data-fo-breadcrumb-trail]"),
        ).not.toBe("none");
        await expect(
          page.locator("main [data-fo-breadcrumb-trail]"),
        ).toBeVisible();
      } else {
        const back = page.locator("main [data-fo-back-link]");
        await expect(back).toBeVisible();
        expect(await displayOf(page, "main [data-fo-breadcrumb-trail]")).toBe(
          "none",
        );
        await expect(back).toHaveAttribute("href", ancestor?.href ?? "");
        expect(
          ((await back.textContent()) ?? "").replaceAll(/\s+/gu, " ").trim(),
        ).toBe(ancestor?.name);
        // 14 ± 1 px under the header, and at least 44 px tall.
        const header = await page.locator(HEADER).boundingBox();
        const box = await back.boundingBox();
        expect(
          Math.abs(
            (box?.y ?? 0) - ((header?.y ?? 0) + (header?.height ?? 0)) - 14,
          ),
          `back top ${String(box?.y)}`,
        ).toBeLessThanOrEqual(1);
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }

      // `BreadcrumbList` equals the HTML trail, item for item, at this width.
      const list = await servedList(page);
      if (SERVES_BREADCRUMB_LIST.has(type)) {
        expect(list, `${path} serves BreadcrumbList`).toBeDefined();
      }
      if (list !== undefined) {
        expect(list.map(({ name }) => name)).toEqual(
          trail.map(({ name }) => name),
        );
        expect(list.slice(0, -1).map(({ href }) => href)).toEqual(
          trail.slice(0, -1).map(({ href }) => href),
        );
      }

      // 1440 × 900: the trail is displayed and the back link is not.
      await page.setViewportSize(DESKTOP);
      await expect(
        page.locator("main [data-fo-breadcrumb-trail]"),
      ).toBeVisible();
      if (type !== "product") {
        expect(await displayOf(page, "main [data-fo-back-link]")).toBe("none");
      }
      expect(await htmlTrail(page)).toEqual(trail);
    });
  }

  test("the back link's chevron is mirrored under dir=rtl (/ar-XB)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/ar-XB/poland/flowers");
    expect(
      response?.status(),
      "is ENABLE_PSEUDO_LOCALES=true on the target?",
    ).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const transforms = await page
      .locator("main [data-fo-back-link] svg")
      .evaluate((svg) => {
        const style = getComputedStyle(svg);
        return { transform: style.transform, scale: style.scale };
      });
    // `mirror-in-rtl` flips it back from the start-facing `-scale-x-100`.
    expect(transforms.transform).toBe("matrix(-1, 0, 0, 1, 0, 0)");
    expect(transforms.scale.startsWith("-1")).toBe(true);
  });
});
