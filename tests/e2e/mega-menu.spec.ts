/**
 * The mega menu's own behaviour against the built site (spec 004 §14 A-founder-2026-10-24a item 5,
 * AC-99, AC-102, AC-104; T-105, T-108 and T-110's e2e halves; TASK-383).
 *
 *  - **AC-99 / T-105.** Six `<details name="fo-mega">` with the resolved labels in order, closed
 *    in the server HTML; Enter and Space open a summary and Tab then reaches its entries, while a
 *    closed panel's entries are not focusable; Flowers, Occasions, Sympathy and Plants & gifts
 *    each carry one featured card (photograph, name, the country-less price box and a chooser
 *    link out of context; the country's exact price and a direct link in context); By price and
 *    Destinations carry none; no "Send flowers" pill.
 *  - **AC-102.** Opening each panel moves nothing outside the header; no panel image is requested
 *    on load; opening Flowers requests exactly its featured image, at most 384 px wide and
 *    25,600 B.
 *  - **AC-104's Menu clauses.** At 390 × 844 with JavaScript off the Menu opens, holds six
 *    `<details>` whose entries equal the desktop panels' on the same page, carries no `<img>`, and
 *    each accordion opens.
 *
 * What is the entries' *values* is `header-in-context.spec.ts`'s (against the pinned models) and
 * the hover half of AC-101 is not built (TASK-383 escalation: the header ships no script).
 */
import { type Page, expect, test } from "@playwright/test";

const LABELS = {
  en: [
    "Flowers",
    "Occasions",
    "Sympathy",
    "Plants & gifts",
    "By price",
    "Destinations",
  ],
} as const;

/** The panels that carry a featured card (item 5's table), in the row's order. */
const FEATURED_PANELS = ["flowers", "occasions", "sympathy", "plantsGifts"];
const PANELS = [...FEATURED_PANELS, "byPrice", "destinations"];

const OUT_OF_CONTEXT = ["/en", "/en-gb", "/en/occasions"];
const IN_CONTEXT = ["/en/poland/flowers", "/en/france/flowers"];

test.beforeEach(({}, testInfo) => {
  testInfo.skip(
    testInfo.project.name !== "e2e-desktop",
    "the file sets both viewports itself",
  );
});

/** The `<details name="fo-mega">` opening tags of a served document, in order. */
function megaDetails(html: string): string[] {
  return [...html.matchAll(/<details\b[^>]*\bname="fo-mega"[^>]*>/gu)].map(
    (match) => match[0],
  );
}

test.describe("AC-99: six closed panels, in order, opened from the keyboard", () => {
  for (const path of [...OUT_OF_CONTEXT, ...IN_CONTEXT]) {
    test(`${path}: six closed fo-mega panels in the server HTML, no Send pill`, async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const html = await response.text();
      const details = megaDetails(html);
      expect(details).toHaveLength(6);
      for (const tag of details) expect(tag, tag).not.toMatch(/\sopen[\s=>]/u);
      const header = html.slice(
        html.indexOf("<header"),
        html.indexOf("</header>"),
      );
      expect(header).not.toContain("Send flowers");
      expect(header).not.toContain('href="#send"');
    });
  }

  test("/en at 1440: the labels in order, summaries first, closed entries unreachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    const summaries = page.locator("[data-fo-mega-summary]");
    await expect(summaries).toHaveText([...LABELS.en]);
    // Closed: Tab from the first summary lands on the second, never inside the first panel.
    await summaries.nth(0).focus();
    await page.keyboard.press("Tab");
    await expect(summaries.nth(1)).toBeFocused();
  });

  test("/en at 1440: Enter and Space open a summary, then Tab reaches its entries", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    for (const [index, key] of [
      [0, "Enter"],
      [1, "Space"],
    ] as const) {
      const details = page.locator("[data-fo-mega]").nth(index);
      const summary = page.locator("[data-fo-mega-summary]").nth(index);
      await summary.focus();
      await page.keyboard.press(key);
      await expect(details).toHaveAttribute("open", "");
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        (i) =>
          document
            .querySelectorAll("[data-fo-mega-panel]")
            [i]?.contains(document.activeElement) ?? false,
        index,
      );
      expect(inside, `${key} then Tab`).toBe(true);
      await summary.focus();
      await page.keyboard.press(key);
      await expect(details).not.toHaveAttribute("open", "");
    }
  });

  for (const path of OUT_OF_CONTEXT.slice(0, 2)) {
    test(`${path}: one country-less featured card per featured panel, through the chooser`, async ({
      page,
    }) => {
      await page.goto(path);
      for (const id of PANELS) {
        const cards = page.locator(
          `[data-fo-mega-panel="${id}"] [data-fo-mega-featured]`,
        );
        if (!FEATURED_PANELS.includes(id)) {
          await expect(cards, id).toHaveCount(0);
          continue;
        }
        await expect(cards, id).toHaveCount(1);
        const card = cards.first();
        await expect(card, id).toHaveAttribute(
          "data-fo-product-card-money",
          "none",
        );
        await expect(card.locator("img"), id).toHaveCount(1);
        await expect(card.locator("h3"), id).not.toBeEmpty();
        const link = card.locator("a").first();
        await expect(link, id).toHaveAttribute("rel", "nofollow");
        // A chooser link carries the shop path and nothing in a query string (AC-76).
        const href = (await link.getAttribute("href")) ?? "";
        expect(href, id).not.toContain("?");
      }
    });
  }

  for (const path of IN_CONTEXT) {
    test(`${path}: each featured card is the country's, priced, linked directly`, async ({
      page,
    }) => {
      await page.goto(path);
      const country = path.split("/")[2] ?? "";
      for (const id of FEATURED_PANELS) {
        const card = page.locator(
          `[data-fo-mega-panel="${id}"] [data-fo-mega-featured]`,
        );
        await expect(card, id).toHaveCount(1);
        await expect(card, id).toHaveAttribute(
          "data-fo-product-card-money",
          "priced",
        );
        const link = card.locator("a").first();
        await expect(link, id).not.toHaveAttribute("rel", /nofollow/u);
        await expect(link, id).toHaveAttribute(
          "href",
          new RegExp(`^/en/${country}/product/[a-z0-9-]+$`, "u"),
        );
      }
    });
  }
});

/** Every `{url → width}` a panel's featured `<picture>` may request. */
async function candidates(
  page: Page,
  panel: string,
): Promise<Map<string, number>> {
  const sets = await page
    .locator(`[data-fo-mega-panel="${panel}"] [data-fo-mega-featured]`)
    .first()
    .evaluate((card) =>
      [...card.querySelectorAll("source, img")].map(
        (el) => el.getAttribute("srcset") ?? "",
      ),
    );
  const map = new Map<string, number>();
  for (const set of sets) {
    for (const part of set.split(",")) {
      const [url, width] = part.trim().split(/\s+/u);
      if (url !== undefined && width !== undefined) {
        map.set(new URL(url, page.url()).href, Number.parseInt(width, 10));
      }
    }
  }
  return map;
}

test.describe("AC-102: no shift and no early images", () => {
  /** Each featured image's chosen URL, by panel: empty until the browser fetches it. */
  async function chosen(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("[data-fo-mega-panel]")].flatMap(
          (panel) => {
            const img = panel.querySelector("[data-fo-mega-featured] img");
            return img instanceof HTMLImageElement
              ? [
                  [
                    panel.getAttribute("data-fo-mega-panel") ?? "",
                    img.currentSrc,
                  ],
                ]
              : [];
          },
        ),
      ),
    );
  }

  test("/en at 1440: no panel image on load; Flowers fetches exactly its own, ≤ 384 px and 25,600 B", async ({
    page,
    request,
  }) => {
    // The image's own state, not the network log: the home's cards may share a variant's URL.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en", { waitUntil: "networkidle" });
    const atLoad = await chosen(page);
    expect(Object.keys(atLoad).toSorted()).toEqual(
      [...FEATURED_PANELS].toSorted(),
    );
    // A panel image is unfetched on load, unless its URL is one the page itself already drew
    // outside the header: then Chrome fills it from memory cache and no request is made for it.
    const onPage = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .filter((img) => img.closest("header") === null)
        .map((img) => img.currentSrc)
        .filter((src) => src !== ""),
    );
    for (const [panel, src] of Object.entries(atLoad)) {
      if (src !== "") expect(onPage, panel).toContain(src);
    }
    expect(atLoad.flowers).toBe("");

    const flowers = await candidates(page, "flowers");
    await page.locator('[data-fo-mega-summary="flowers"]').click();
    await expect
      .poll(async () => (await chosen(page)).flowers ?? "")
      .not.toBe("");
    const opened = await chosen(page);
    for (const panel of FEATURED_PANELS.filter((id) => id !== "flowers")) {
      expect(opened[panel], panel).toBe(atLoad[panel]);
    }
    // The full URL: the variants live on the media origin, not on the page's.
    const url = opened.flowers ?? "";
    expect(flowers.has(url), url).toBe(true);
    expect(flowers.get(url) ?? Infinity).toBeLessThanOrEqual(384);
    const bytes = (await (await request.get(url)).body()).byteLength;
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(25_600);
  });

  for (const width of [1440, 1280, 1024]) {
    test(`/en at ${String(width)}: opening each panel moves nothing outside the header`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/en");
      const main = page.locator("#main");
      const top = async (): Promise<number> =>
        (await main.boundingBox())?.y ?? Number.NaN;
      const header = page.locator("header[data-fo-header]");
      const height = async (): Promise<number> =>
        (await header.boundingBox())?.height ?? Number.NaN;
      const restTop = await top();
      const restHeight = await height();
      for (const id of PANELS) {
        await page.locator(`[data-fo-mega-summary="${id}"]`).click();
        await expect(page.locator(`[data-fo-mega="${id}"]`)).toHaveAttribute(
          "open",
          "",
        );
        expect(await top(), id).toBe(restTop);
        expect(await height(), id).toBe(restHeight);
      }
    });
  }
});

test.describe("AC-104: the phone Menu, JavaScript off", () => {
  // Reduced motion: the sheet's drop-in transition is not what this checks.
  test.use({ javaScriptEnabled: false, reducedMotion: "reduce" });

  for (const path of ["/en", "/en/poland/flowers"]) {
    test(`${path} at 390: six accordions with the desktop panels' entries, no image, each opens`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.locator("[data-fo-menu-summary]").click();
      const accordions = page.locator("[data-fo-menu-accordion]");
      await expect(accordions).toHaveCount(6);
      await expect(page.locator("[data-fo-mega-accordions] img")).toHaveCount(
        0,
      );
      for (const [index, id] of PANELS.entries()) {
        const panelEntries = await page
          .locator(`[data-fo-mega-panel="${id}"] [data-fo-mega-entry]`)
          .evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-fo-mega-entry")),
          );
        const accordion = accordions.nth(index);
        await expect(accordion).toHaveAttribute("data-fo-menu-accordion", id);
        const menuEntries = await accordion
          .locator("[data-fo-mega-entry]")
          .evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-fo-mega-entry")),
          );
        expect(menuEntries, id).toEqual(panelEntries);
        await accordion.locator(":scope > summary").click();
        await expect(accordion, id).toHaveAttribute("open", "");
      }
    });
  }
});
