/**
 * The three country listings' first screens and their head, as a browser lays them out (spec 043
 * §14 A-founder-2026-10-22 as revised 2026-10-24: AC-5, AC-7, AC-35 to AC-37, AC-40, AC-41,
 * AC-51 to AC-54, T-05, T-07, T-35 to T-37, T-40, T-41, T-51 to T-54; spec 004 rebound AC-34,
 * AC-45, T-49, T-50; spec 008 A-founder-2026-10-15c, T-39; TASK-187, TASK-241, TASK-289).
 *
 * Every case sets its own viewport, so it runs once, in `e2e-desktop`. The drawing is the
 * `lh:2026-10-24b` block of `docs/design/wireframes/country-{shop,category,occasion}-*.dc.html`.
 *
 * What each probe goes red on, by construction:
 * - T-41: a first-row price bottom below 900 or 800, or the phone's first photograph top below
 *   340 (the H1 put back at `--text-title-fluid`, the occasion's lead photograph restored, the
 *   example label put back above the grid on the phone);
 * - T-35: a second element between the H1 and the toolbar (the destination line, an eyebrow, the
 *   P.S. column), an image before the first card, a two-line quiet line at 1440 or 1280;
 * - T-36: the quiet line's parts not exactly count, state, prices (or joined into one node);
 * - T-37: the sort control on its own row, a count on the toolbar row, "How we sort" left on the
 *   phone's toolbar row, "Change the order" anywhere;
 * - T-40: the sentence outside its `<details>`, missing, filled by script, or in an overlay;
 * - T-51: another H1 wording, size or a wrapping H1;
 * - T-52: "page N of M" on page 1, or the state and prices parts on page 2;
 * - T-53: the example label above the first card, or more than one displayed;
 * - T-54: the occasion's lead photograph or date card, or `priority` off the first card.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Page, type TestInfo, expect, test } from "@playwright/test";

import { forbiddenPhrasesIn } from "../support/forbidden-phrases";

const SHOP = "/en-gb/poland/flowers";
const CATEGORY = "/en-gb/poland/flowers/roses";
const OCCASION = "/en-gb/poland/occasions/mothers-day";
const PAGES = [SHOP, CATEGORY, OCCASION] as const;

/** AC-41's pages: the shop root, the founder's country category and the country occasion. */
const FIRST_SCREEN_PAGES = [
  { url: "/en/poland/flowers", type: "shop" },
  { url: "/en/poland/flowers/birthday-flowers", type: "category" },
  { url: "/en/poland/occasions/mothers-day", type: "occasion" },
  { url: "/en-gb/poland/flowers", type: "shop" },
  { url: "/en-gb/poland/flowers/birthday-flowers", type: "category" },
  { url: "/en-gb/poland/occasions/mothers-day", type: "occasion" },
] as const;

/** "The three listings" for Poland and Germany (spec 043 §14 AC preamble). */
const THREE_LISTINGS = [
  { url: "/en/poland/flowers", type: "shop", h1: "Flowers to Poland" },
  {
    url: "/en/poland/flowers/birthday-flowers",
    type: "category",
    h1: "Birthday flowers to Poland",
  },
  {
    url: "/en/poland/occasions/mothers-day",
    type: "occasion",
    h1: "Mother's Day flowers to Poland",
  },
  { url: "/en-gb/germany/flowers", type: "shop", h1: "Flowers to Germany" },
  {
    url: "/en-gb/germany/flowers/anniversary-flowers",
    type: "category",
    h1: "Anniversary flowers to Germany",
  },
  {
    url: "/en-gb/germany/occasions/mothers-day",
    type: "occasion",
    h1: "Mother's Day flowers to Germany",
  },
] as const;

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;
const DESKTOP = SIZES[0];
const LAPTOP = SIZES[1];
const PHONE = SIZES[2];

/** The `en` catalogue the pages render (`en-gb` inherits it): no copy retyped here. */
const EN = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../messages/en.json"), "utf8"),
) as {
  destinations: { state: Record<string, string> };
  nav: { utility: Record<string, string>; categories: { label: string } };
  shop: {
    toolbar: Record<string, string>;
    root: Record<string, string>;
    occasion: Record<string, string>;
  };
  media: { provenance: Record<string, string> };
  product: { destination: Record<string, string> };
};
const NOT_OPEN = EN.destinations.state["guideNotDelivering"] ?? "";
const PRICES = EN.nav.utility["pricesInclude"] ?? "";
const SENTENCE = EN.shop.toolbar["disclosure"] ?? "";
const HOW_WE_SORT = EN.shop.toolbar["howWeSort"] ?? "";
const AI_EXAMPLE = EN.media.provenance["aiExample"] ?? "";
const DEMO_NOTICE = EN.shop.root["demoNotice"] ?? "";

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

async function open(
  page: Page,
  url: string,
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

/** A JavaScript-off page at `size`; the caller closes its context. */
async function openNoScript(
  browser: import("@playwright/test").Browser,
  url: string,
  size: { width: number; height: number },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: size,
  });
  const page = await context.newPage();
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  return { page, close: async () => context.close() };
}

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly height: number;
}

/** The box of the first **displayed** element matching `selector`, in viewport coordinates. */
async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.evaluate((query) => {
    for (const element of Array.from(document.querySelectorAll(query))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        height: rect.height,
      };
    }
    return null;
  }, selector);
  if (box === null) throw new Error(`nothing displayed matches ${selector}`);
  return box;
}

function inside(box: Box, size: { width: number; height: number }): boolean {
  return (
    box.top >= -0.5 &&
    box.bottom <= size.height + 0.5 &&
    box.left >= -0.5 &&
    box.right <= size.width + 0.5
  );
}

/** Two boxes share a horizontal band. */
function overlapsVertically(a: Box, b: Box): boolean {
  return a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

/**
 * The grid's first row: every displayed card whose top equals the first displayed card's top, each
 * as its photograph's top and its price's bottom (the amount with its inclusive words, rebound
 * AC-34's price element).
 */
async function firstRow(page: Page): Promise<
  {
    id: string;
    top: number;
    photoTop: number;
    bottom: number;
    price: string;
  }[]
> {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main [data-fo-listing-grid] > li article",
      ),
    );
    const first = cards[0]?.getBoundingClientRect().top;
    return cards
      .filter(
        (card) => Math.abs(card.getBoundingClientRect().top - (first ?? 0)) < 1,
      )
      .map((card) => {
        const price = card.querySelector<HTMLElement>(
          "[data-fo-price] > :first-child",
        );
        const photo =
          card.querySelector("img, picture, [data-fo-photo-placeholder]") ??
          card;
        return {
          id: card.getAttribute("data-fo-product-card") ?? "",
          top: card.getBoundingClientRect().top,
          photoTop: photo.getBoundingClientRect().top,
          bottom:
            price?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          price: price?.innerText ?? "",
        };
      });
  });
}

/** The visible text of `<main>` that lies inside the first viewport. */
async function firstViewportText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (main === null) return "";
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      const parent = node.parentElement;
      if (parent === null) continue;
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      parts.push(node.textContent ?? "");
    }
    return parts.join(" ");
  });
}

/**
 * The innermost **displayed** elements of `<main>` whose own text is `value`, with their boxes
 * (each counted once: an ancestor whose child already reads `value` is not counted).
 */
async function displayed(
  page: Page,
  value: string,
): Promise<
  { top: number; bottom: number; inStatus: boolean; afterGrid: boolean }[]
> {
  return page.evaluate((text) => {
    const main = document.querySelector("main");
    if (main === null) return [];
    const grid = main.querySelector("[data-fo-listing-grid]");
    return Array.from(main.querySelectorAll("*"))
      .filter(
        (element) =>
          (element.textContent ?? "").trim() === text &&
          !Array.from(element.children).some(
            (child) => (child.textContent ?? "").trim() === text,
          ) &&
          element.checkVisibility({ visibilityProperty: true }) &&
          element.getBoundingClientRect().height > 0,
      )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          inStatus: element.closest("[data-fo-listing-status]") !== null,
          afterGrid:
            grid !== null &&
            (grid.compareDocumentPosition(element) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
              0,
        };
      });
  }, value);
}

/** Records a measured number on the test, so the CI report carries it. */
function note(testInfo: TestInfo, description: string): void {
  testInfo.annotations.push({ type: "measured", description });
}

test.describe("T-41 and rebound AC-34 (T-49): the first screen of the three country types", () => {
  for (const { url, type } of FIRST_SCREEN_PAGES) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)} × ${String(size.height)}`, async ({
        page,
      }, testInfo) => {
        await open(page, url, size);

        const h1 = await boxOf(page, "main h1");
        expect(inside(h1, size), "H1").toBe(true);

        const row = await firstRow(page);
        expect(row.length, "cards in the first row").toBe(
          size.width < 768 ? 2 : 4,
        );
        // No lead figure on any type: `items[0]` is the grid's first card (AC-54).
        await expect(page.locator("main [data-fo-lead]")).toHaveCount(0);
        const lowestPrice = Math.max(...row.map((card) => card.bottom));
        const firstPhoto = row[0]?.photoTop ?? Number.POSITIVE_INFINITY;
        note(
          testInfo,
          `${url} ${String(size.width)}x${String(size.height)} (${type}): first photo top ${firstPhoto.toFixed(1)}, first-row price bottom ${lowestPrice.toFixed(1)}`,
        );
        for (const card of row) {
          expect(card.top, `${card.id} card top`).toBeGreaterThanOrEqual(-0.5);
          // AC-41 and rebound AC-34: every first-row price inside the first screen.
          expect(card.bottom, `${card.id} price bottom`).toBeLessThanOrEqual(
            size.height + 0.5,
          );
          expect(card.price, `${card.id} price`).toContain(
            "Includes VAT and delivery",
          );
        }
        if (size.width < 768) {
          // AC-41: the first photograph starts at or above 340 px on the phone.
          expect(firstPhoto, "first photograph top").toBeLessThanOrEqual(340);
        }

        // Every card's price has its inclusive words beside it, in the same card, and no card
        // carries an equivalents line (spec 004 A-founder-2026-10-19b clauses 1 and 2).
        const cards = page.locator("main article[data-fo-product-card]");
        const count = await cards.count();
        expect(count).toBeGreaterThan(5);
        for (let index = 0; index < count; index += 1) {
          const price = cards.nth(index).locator("[data-fo-price]");
          await expect(price).toBeVisible();
          await expect(price).toContainText("Includes VAT and delivery", {
            useInnerText: true,
          });
          await expect(
            cards.nth(index).locator("[data-fo-price-equivalents]"),
          ).toHaveCount(0);
        }

        // Each product's URL once in `<main>` (spec 008 AC-31).
        const hrefs = await page
          .locator("main article[data-fo-product-card] a[href]")
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")),
          );
        const allHrefs = await page
          .locator("main a[href]")
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")),
          );
        for (const href of hrefs) {
          expect(
            allHrefs.filter((other) => other === href),
            href ?? "",
          ).toHaveLength(1);
        }

        // No first-viewport text says what spec 004 AC-37 forbids.
        expect(forbiddenPhrasesIn(await firstViewportText(page))).toStrictEqual(
          [],
        );
      });
    }
  }
});

test.describe("T-35, T-05: the head holds the H1, the quiet line and the toolbar, and nothing else (AC-35, AC-5)", () => {
  for (const { url, type } of THREE_LISTINGS) {
    for (const size of [DESKTOP, LAPTOP, PHONE]) {
      test(`${url} at ${String(size.width)}, JavaScript off`, async ({
        browser,
      }) => {
        const { page, close } = await openNoScript(browser, url, size);
        const head = await page.evaluate(() => {
          const main = document.querySelector("main");
          const h1 = main?.querySelector("h1");
          const toolbar = main?.querySelector("[data-fo-listing-toolbar]");
          const firstCard = main?.querySelector("[data-fo-product-card]");
          if (!main || !h1 || !toolbar || !firstCard) return null;
          const follows = (a: Node, b: Node): boolean =>
            (a.compareDocumentPosition(b) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
            0;
          // The outermost elements after the H1 and before the toolbar, not ancestors of it.
          const between: string[] = [];
          for (const element of Array.from(main.querySelectorAll("*"))) {
            if (!follows(h1, element) || !follows(element, toolbar)) continue;
            if (element.contains(toolbar)) continue;
            const parent = element.parentElement;
            if (
              parent !== null &&
              follows(h1, parent) &&
              !parent.contains(toolbar)
            ) {
              continue;
            }
            between.push(
              element.hasAttribute("data-fo-listing-status")
                ? "status"
                : element.hasAttribute("data-fo-occasion-date")
                  ? "date"
                  : element.outerHTML.slice(0, 80),
            );
          }
          const images = Array.from(main.querySelectorAll("img")).filter(
            (img) => follows(img, firstCard),
          );
          const backgrounds = Array.from(main.querySelectorAll("*")).filter(
            (element) =>
              follows(element, firstCard) &&
              !element.contains(firstCard) &&
              getComputedStyle(element).backgroundImage !== "none",
          );
          const status = main.querySelector<HTMLElement>(
            "[data-fo-listing-status]",
          );
          const headBox = main.querySelector("[data-fo-listing-head]");
          const eyebrows = Array.from(
            headBox?.querySelectorAll(".eyebrow, .label") ?? [],
          ).filter(
            (element) =>
              element.closest("[data-fo-listing-categories]") === null &&
              element.getBoundingClientRect().height > 0,
          );
          return {
            between,
            imagesBeforeFirstCard: images.length,
            backgroundsBeforeFirstCard: backgrounds.length,
            statusHeight: status?.getBoundingClientRect().height ?? 0,
            statusLineHeight: Number.parseFloat(
              status === null ? "0" : getComputedStyle(status).lineHeight,
            ),
            eyebrows: eyebrows.map((element) => element.textContent ?? ""),
            notes: main.querySelectorAll("[data-fo-listing-note]").length,
            text: main.textContent ?? "",
          };
        });
        expect(head, "main, h1, toolbar and a card").not.toBeNull();
        if (head === null) return;
        expect(head.between, "between the H1 and the toolbar").toStrictEqual(
          type === "occasion" ? ["date", "status"] : ["status"],
        );
        expect(head.imagesBeforeFirstCard, "images before the first card").toBe(
          0,
        );
        expect(head.backgroundsBeforeFirstCard, "background images").toBe(0);
        expect(head.notes, "the P.S. column").toBe(0);
        expect(head.eyebrows, "eyebrows in the head").toStrictEqual([]);
        expect(head.text).not.toContain("P.S.");
        expect(head.text).not.toContain("Guide · not delivering yet");
        // AC-5: no destination line in `<main>`; the header's selector carries it.
        expect(head.text).not.toContain(EN.product.destination["label"] ?? "");
        expect(head.text).not.toContain(EN.product.destination["change"] ?? "");
        if (size.width >= 1280) {
          expect(head.statusHeight, "the quiet line is one line").toBeLessThan(
            2 * head.statusLineHeight,
          );
        }
        await close();
      });
    }
  }
});

test.describe("T-36, T-07: the quiet line's parts, and the state said once (AC-36, AC-7)", () => {
  for (const { url, type } of THREE_LISTINGS) {
    test(`${url} at 1440`, async ({ page }) => {
      await open(page, url, DESKTOP);
      const parts = await page
        .locator("main [data-fo-listing-status] [data-fo-listing-status-part]")
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getBoundingClientRect().height > 0)
            .map((element) => [
              element.getAttribute("data-fo-listing-status-part"),
              element.textContent?.trim(),
            ]),
        );
      const count = parts[0]?.[1] ?? "";
      expect(count, "the count").toMatch(/^\d+ bouquets?$/u);
      expect(parts).toStrictEqual([
        ["count", count],
        ["state", NOT_OPEN],
        ["prices", PRICES],
      ]);
      const separators = await page
        .locator("main [data-fo-listing-status] [data-fo-sep]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("aria-hidden")),
        );
      expect(separators.length).toBeGreaterThan(0);
      expect(new Set(separators)).toStrictEqual(new Set(["true"]));
      // AC-7: each value once in `<main>`, inside the quiet line; no demo sentence, no P.S.
      for (const value of [NOT_OPEN, PRICES]) {
        const shown = await displayed(page, value);
        expect(shown, value).toHaveLength(1);
        expect(shown[0]?.inStatus, `${value} in the quiet line`).toBe(true);
      }
      expect(await displayed(page, DEMO_NOTICE)).toHaveLength(0);
      await expect(page.locator("main")).not.toContainText(DEMO_NOTICE);
    });

    test(`${url} at 390: the phone's rows`, async ({ page }) => {
      await open(page, url, PHONE);
      const count = await boxOf(
        page,
        'main [data-fo-listing-status] [data-fo-listing-status-part="count"]',
      );
      const hws = await boxOf(
        page,
        "main [data-fo-ranking-disclosure] > summary",
      );
      expect(
        overlapsVertically(count, hws),
        "How we sort on the count row",
      ).toBe(true);
      expect(hws.left, "How we sort after the count").toBeGreaterThan(
        count.right,
      );
      if (type === "occasion") {
        // The status parts follow the grid below `md` (spec 004 AC-57).
        for (const value of [NOT_OPEN, PRICES]) {
          const shown = await displayed(page, value);
          expect(shown, value).toHaveLength(1);
          expect(shown[0]?.afterGrid, `${value} after the grid`).toBe(true);
        }
      } else {
        const state = await boxOf(
          page,
          'main [data-fo-listing-status] [data-fo-listing-status-part="state"]',
        );
        const prices = await boxOf(
          page,
          'main [data-fo-listing-status] [data-fo-listing-status-part="prices"]',
        );
        expect(
          overlapsVertically(state, prices),
          "state and prices on one row",
        ).toBe(true);
        expect(
          state.bottom,
          "the status row above the count",
        ).toBeLessThanOrEqual(count.top + 0.5);
        for (const value of [NOT_OPEN, PRICES]) {
          expect(await displayed(page, value), value).toHaveLength(1);
        }
      }
    });
  }
});

test.describe("T-37, T-40: one toolbar row, and How we sort (AC-37, AC-40)", () => {
  for (const { url, type } of THREE_LISTINGS) {
    for (const size of [DESKTOP, LAPTOP]) {
      test(`${url} at ${String(size.width)}: start, How we sort, sort pill`, async ({
        page,
      }) => {
        await open(page, url, size);
        const start = await boxOf(
          page,
          type === "occasion"
            ? "main [data-fo-listing-also-in]"
            : "main [data-fo-listing-categories] > summary",
        );
        const hws = await boxOf(
          page,
          "main [data-fo-ranking-disclosure] > summary",
        );
        const select = await boxOf(
          page,
          "main [data-fo-listing-sort-form] select",
        );
        const pill = await boxOf(page, "main [data-fo-listing-sort-form]");
        expect(overlapsVertically(start, hws), "start and How we sort").toBe(
          true,
        );
        expect(
          overlapsVertically(hws, select),
          "How we sort and the select",
        ).toBe(true);
        expect(start.right, "the start control first").toBeLessThan(hws.left);
        expect(
          hws.right,
          "How we sort before the sort pill",
        ).toBeLessThanOrEqual(pill.left + 0.5);
        const status = await boxOf(page, "main [data-fo-listing-status]");
        expect(
          status.bottom,
          "the quiet line above the row",
        ).toBeLessThanOrEqual(start.top + 0.5);
        // The sort pill's end edge is the row's last.
        expect(pill.right).toBeGreaterThanOrEqual(
          Math.max(start.right, hws.right),
        );
        // The pill is 44 px tall.
        expect(Math.round(pill.height)).toBe(44);
        // One hairline under the row from `md` up, and no count on the row.
        const rule = await boxOf(page, "main [data-fo-listing-toolbar-rule]");
        expect(rule.top).toBeGreaterThanOrEqual(pill.bottom);
        const firstCard = await boxOf(
          page,
          "main article[data-fo-product-card]",
        );
        expect(
          hws.bottom,
          "How we sort ends above the first card",
        ).toBeLessThan(firstCard.top);
        expect(
          await page
            .locator(
              "main [data-fo-listing-toolbar] [data-fo-listing-status-part='count']",
            )
            .count(),
        ).toBe(0);
        await expect(page.locator("main")).not.toContainText(
          "Change the order",
        );
      });
    }

    test(`${url} at 768: the toolbar spans at most two rows`, async ({
      page,
    }) => {
      await open(page, url, { width: 768, height: 1024 });
      const tops = await page.evaluate(() =>
        [
          "main [data-fo-listing-categories] > summary, main [data-fo-listing-also-in]",
          "main [data-fo-ranking-disclosure] > summary",
          "main [data-fo-listing-sort-form]",
        ].map((query) =>
          Math.round(
            document.querySelector(query)?.getBoundingClientRect().top ?? -1,
          ),
        ),
      );
      expect(tops).not.toContain(-1);
      expect(new Set(tops).size).toBeLessThanOrEqual(2);
    });

    test(`${url} at 390: the start control and the sort pill on one row, no rule`, async ({
      page,
    }) => {
      await open(page, url, PHONE);
      const start = await boxOf(
        page,
        type === "occasion"
          ? "main [data-fo-listing-also-in] a"
          : "main [data-fo-listing-categories] > summary",
      );
      const pill = await boxOf(page, "main [data-fo-listing-sort-form]");
      expect(overlapsVertically(start, pill)).toBe(true);
      expect(start.right).toBeLessThanOrEqual(pill.left + 0.5);
      expect(pill.right).toBeLessThanOrEqual(PHONE.width + 0.5);
      const rule = page.locator("main [data-fo-listing-toolbar-rule]");
      expect(
        await rule.evaluate((element) => getComputedStyle(element).display),
      ).toBe("none");
    });
  }

  for (const url of [SHOP, OCCASION]) {
    test(`${url}: How we sort is closed, holds the sentence once, opens by keyboard in flow`, async ({
      browser,
    }) => {
      const { page, close } = await openNoScript(browser, url, DESKTOP);
      const details = page.locator("main [data-fo-ranking-disclosure]");
      await expect(details).toHaveCount(1);
      expect(
        await details.evaluate(
          (element) => (element as HTMLDetailsElement).open,
        ),
      ).toBe(false);
      await expect(details.locator("summary")).toHaveText(HOW_WE_SORT);
      // The sentence, word for word, inside the `<details>` and nowhere else in `<main>`.
      const occurrences = await page
        .locator("main")
        .evaluate(
          (main, sentence) =>
            (main.textContent ?? "").split(sentence).length - 1,
          SENTENCE,
        );
      expect(occurrences).toBe(1);
      await expect(details).toContainText(SENTENCE);
      const before = (await boxOf(page, "main article[data-fo-product-card]"))
        .top;
      await details.locator("summary").focus();
      await page.keyboard.press("Enter");
      const sentence = page.locator("main [data-fo-ranking-sentence]");
      await expect(sentence).toBeVisible();
      expect(
        await sentence.evaluate(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
        "not clipped",
      ).toBe(true);
      const after = (await boxOf(page, "main article[data-fo-product-card]"))
        .top;
      expect(after, "the grid pushed down").toBeGreaterThan(before + 20);
      await close();
    });
  }
});

test.describe("T-51: the short H1 (AC-51)", () => {
  for (const { url, h1 } of THREE_LISTINGS) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)}`, async ({ page }) => {
        await open(page, url, size);
        const heading = page.locator("main h1");
        await expect(heading).toHaveCount(1);
        await expect(heading).toHaveText(h1);
        const em = heading.locator("em");
        await expect(em).toHaveCount(1);
        await expect(em).toHaveText(h1.split(" ").at(-1) ?? "");
        const metrics = await heading.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            size: Number.parseFloat(style.fontSize),
            line: Number.parseFloat(style.lineHeight),
            height: element.getBoundingClientRect().height,
          };
        });
        expect(metrics.size).toBeCloseTo(size.width < 768 ? 32 : 46, 0);
        expect(metrics.height).toBeLessThan(
          (size.width < 768 ? 3 : 2) * metrics.line,
        );
      });
    }
  }

  test("every country listing's H1 is one line at 1280 × 800 and at most two at 390 × 844", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const fixture = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, "../fixtures/shop/listing-urls.json"),
        "utf8",
      ),
    ) as Record<string, { pageType: string; path: string }[]>;
    const listings = (fixture["en"] ?? []).filter((entry) =>
      ["countryShopRoot", "countryCategory", "countryOccasion"].includes(
        entry.pageType,
      ),
    );
    expect(listings.length).toBeGreaterThan(50);
    const headings: { path: string; html: string }[] = [];
    for (const { path } of listings) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const match = /<h1[^>]*>(.*?)<\/h1>/su.exec(await response.text());
      headings.push({ path, html: match?.[1] ?? "" });
    }
    for (const size of [LAPTOP, PHONE]) {
      await open(page, "/en/poland/flowers", size);
      const tooTall = await page.evaluate(
        ({ all, lines }) => {
          const h1 = document.querySelector("main h1");
          if (h1 === null) return ["no h1"];
          const line = Number.parseFloat(getComputedStyle(h1).lineHeight);
          const out: string[] = [];
          for (const { path, html } of all) {
            h1.innerHTML = html;
            if (h1.getBoundingClientRect().height >= (lines + 1) * line) {
              out.push(`${path}: ${h1.textContent ?? ""}`);
            }
          }
          return out;
        },
        { all: headings, lines: size.width < 768 ? 2 : 1 },
      );
      expect(tooTall, `${String(size.width)}`).toStrictEqual([]);
    }
  });
});

test.describe("T-52: page numbers from page 2 only (AC-52)", () => {
  test("/en/poland/flowers: page 1 says no page, page 2's quiet line is the summary alone", async ({
    page,
  }) => {
    await open(page, "/en/poland/flowers", DESKTOP);
    const pageOne = await page.locator("main").evaluate((main) => {
      const copy = main.cloneNode(true) as HTMLElement;
      copy.querySelector("[data-fo-pagination]")?.remove();
      return copy.textContent ?? "";
    });
    expect(pageOne).not.toMatch(/page \d+ of \d+/u);
    await open(page, "/en/poland/flowers?page=2", DESKTOP);
    const status = page.locator("main [data-fo-listing-status]");
    await expect(status).toHaveText(/^\d+ bouquets · page 2 of \d+$/u);
    await expect(status).not.toContainText(NOT_OPEN);
    await expect(status).not.toContainText(PRICES);
  });
});

test.describe("T-53: the example note under the grid (AC-53)", () => {
  for (const { url } of THREE_LISTINGS.slice(0, 3)) {
    for (const size of [DESKTOP, PHONE]) {
      test(`${url} at ${String(size.width)}`, async ({ page }) => {
        await open(page, url, size);
        const shown = await displayed(page, AI_EXAMPLE);
        expect(shown, "displayed example labels").toHaveLength(1);
        const cards = await page
          .locator("main [data-fo-listing-grid] > li")
          .evaluateAll((items) =>
            items.map((item) => item.getBoundingClientRect().bottom),
          );
        expect(shown[0]?.top ?? -1).toBeGreaterThanOrEqual(
          Math.max(...cards) - 0.5,
        );
        const pager = page.locator("main [data-fo-pagination]");
        if ((await pager.count()) > 0) {
          expect(shown[0]?.bottom ?? Infinity).toBeLessThanOrEqual(
            (await boxOf(page, "main [data-fo-pagination]")).top + 0.5,
          );
        }
        // Every card keeps its own label in the HTML, hidden by CSS.
        expect(
          await page.locator("main [data-fo-card-provenance='hidden']").count(),
        ).toBeGreaterThan(5);
      });
    }
  }
});

test.describe("T-54: the country occasion's head (AC-54)", () => {
  for (const url of [
    "/en/poland/occasions/mothers-day",
    "/en-gb/poland/occasions/mothers-day",
  ]) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)}, JavaScript off`, async ({
        browser,
      }) => {
        const { page, close } = await openNoScript(browser, url, size);
        const probe = await page.evaluate(() => {
          const main = document.querySelector("main");
          const firstCard = main?.querySelector("[data-fo-product-card]");
          const img = main?.querySelector("img");
          const h1 = main?.querySelector("h1");
          const date = h1?.nextElementSibling as HTMLElement | null | undefined;
          return {
            firstImgInFirstCard:
              img !== null &&
              img !== undefined &&
              firstCard?.contains(img) === true,
            fetchpriority: img?.getAttribute("fetchpriority") ?? null,
            loading: img?.getAttribute("loading") ?? null,
            dateHook: date?.hasAttribute("data-fo-occasion-date") ?? false,
            dateText: date?.textContent ?? "",
            dateHeight: date?.getBoundingClientRect().height ?? 0,
            dateLine: Number.parseFloat(
              date === null || date === undefined
                ? "0"
                : getComputedStyle(date).lineHeight,
            ),
            cards:
              main?.querySelectorAll("[data-fo-date-card], [data-fo-lead]")
                .length ?? -1,
          };
        });
        expect(
          probe.firstImgInFirstCard,
          "the first image is the first card's",
        ).toBe(true);
        expect(probe.fetchpriority).toBe("high");
        expect(probe.loading).not.toBe("lazy");
        expect(probe.cards, "no date card, no lead").toBe(0);
        expect(probe.dateHook, "the date line follows the H1").toBe(true);
        expect(probe.dateText).toBe(
          "Mother's Day in Poland is Wednesday, 26 May 2027.",
        );
        if (size.width >= 1280) {
          expect(probe.dateHeight).toBeLessThan(2 * probe.dateLine);
        }
        const noteText = (EN.shop.occasion["dateNote"] ?? "").replace(
          "{country}",
          "Poland",
        );
        const notes = await displayed(page, noteText);
        expect(notes, "the date note").toHaveLength(1);
        expect(notes[0]?.afterGrid, "after the grid").toBe(true);
        await close();
      });
    }
  }
});

test.describe("the sort select applies on change, with JavaScript on (AC-38)", () => {
  test("/en/poland/flowers: price low to high, no reload, focus kept, Back restores", async ({
    page,
  }) => {
    await open(page, "/en/poland/flowers", DESKTOP);
    await page.waitForFunction(
      () => performance.getEntriesByName("fo:deferred:listing-sort").length > 0,
      undefined,
      { timeout: 30_000 },
    );
    await page.evaluate(() => {
      (window as unknown as { __foMarker: boolean }).__foMarker = true;
    });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.locator("main select[name='sort']").focus();
    await page.locator("main select[name='sort']").selectOption("price-asc");
    await expect(page).toHaveURL(/\/en\/poland\/flowers\?sort=price-asc$/u);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __foMarker?: boolean }).__foMarker === true,
      ),
      "no full reload",
    ).toBe(true);
    await expect(page.locator("main select[name='sort']")).toHaveValue(
      "price-asc",
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.getAttribute("name") ?? ""),
      )
      .toBe("sort");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    // The JavaScript-off order of the same URL.
    const order = async (p: Page): Promise<string[]> =>
      p
        .locator("main [data-fo-product-card]")
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute("data-fo-product-card") ?? ""),
        );
    const sorted = await order(page);
    const context = await page.context().browser()?.newContext({
      javaScriptEnabled: false,
    });
    const plain = await context?.newPage();
    if (plain === undefined) throw new Error("no page");
    await plain.goto("/en/poland/flowers?sort=price-asc");
    expect(sorted).toStrictEqual(await order(plain));
    await context?.close();
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/poland\/flowers$/u);
    await expect(page.locator("main select[name='sort']")).toHaveValue(
      "default",
    );
  });
});

/**
 * AC-45's probe over the viewport band under the header: the widest empty band, and every
 * ornament (a rotation, or an `aria-hidden` box 48 px or more both ways). Runs in the page.
 */
function calmProbe(): { widest: number; ornaments: string[] } {
  const header = document.querySelector("header");
  const top = header?.getBoundingClientRect().bottom ?? 0;
  const bottom = window.innerHeight;
  const main = document.querySelector("main");
  if (main === null) throw new Error("no main");
  // Every text node, image and form control in `<main>` inside the span.
  const spans: [number, number][] = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? "").trim() === "") continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width === 0 || rect.height === 0) continue;
      spans.push([rect.top, rect.bottom]);
    }
  }
  for (const element of Array.from(
    main.querySelectorAll("img, input, select, textarea, button"),
  )) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    spans.push([rect.top, rect.bottom]);
  }
  const covered = spans
    .map(
      ([a, b]) => [Math.max(a, top), Math.min(b, bottom)] as [number, number],
    )
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let cursor = top;
  let widest = 0;
  for (const [a, b] of covered) {
    widest = Math.max(widest, a - cursor);
    cursor = Math.max(cursor, b);
  }
  widest = Math.max(widest, bottom - cursor);

  // Ornaments: a rotation, or an `aria-hidden` element 48 px or more both ways.
  const ornaments: string[] = [];
  for (const element of Array.from(main.querySelectorAll("*"))) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= top || rect.top >= bottom) continue;
    const style = getComputedStyle(element);
    const transform = style.transform;
    if (transform !== "none") {
      const matrix = new DOMMatrixReadOnly(transform);
      if (Math.abs(matrix.b) > 1e-6 || Math.abs(matrix.c) > 1e-6) {
        ornaments.push(`rotated ${element.tagName}`);
      }
    }
    if (style.rotate !== "none" && style.rotate !== "0deg") {
      ornaments.push(`rotate ${element.tagName}`);
    }
    // Motion 6's shadow layer (spec 004 §14 A-founder-2026-10-19e clause 1 (c)) is an
    // `aria-hidden` box the photograph's size that paints nothing at rest: exempt while it
    // sits at opacity 0 inside a moving card, and an ornament the moment it shows.
    const restingShadow =
      element.hasAttribute("data-fo-card-shadow") &&
      element.closest("a[data-fo-card-motion]") !== null &&
      style.opacity === "0";
    if (
      !restingShadow &&
      element.getAttribute("aria-hidden") === "true" &&
      rect.width >= 48 &&
      rect.height >= 48
    ) {
      ornaments.push(`aria-hidden ${element.tagName} ${String(rect.width)}`);
    }
  }
  return { widest, ornaments };
}

test.describe("AC-45 (T-50): calm, not bland", () => {
  for (const url of PAGES) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)} × ${String(size.height)}: no gap over 120 px, no ornament`, async ({
        page,
      }) => {
        await open(page, url, size);
        const probe = await page.evaluate(calmProbe);
        expect(probe.widest, "the widest empty band").toBeLessThanOrEqual(120);
        expect(probe.ornaments).toStrictEqual([]);
        // Not vacuous, and the exemption is the resting shadow layer alone: the same layer
        // shown, and any other `aria-hidden` box inside a moving card, are ornaments.
        const expected = await page.evaluate(() => {
          const link = document.querySelector("main a[data-fo-card-motion]");
          const shadow = link?.querySelector<HTMLElement>(
            "[data-fo-card-shadow]",
          );
          if (
            link === null ||
            link === undefined ||
            shadow === null ||
            shadow === undefined
          ) {
            throw new Error("no moving card");
          }
          link.scrollIntoView({ block: "center" });
          return `aria-hidden SPAN ${String(shadow.getBoundingClientRect().width)}`;
        });
        expect((await page.evaluate(calmProbe)).ornaments).not.toContain(
          expected,
        );
        await page.evaluate(() => {
          const shadow = document.querySelector<HTMLElement>(
            "main a[data-fo-card-motion] [data-fo-card-shadow]",
          );
          if (shadow === null) throw new Error("no shadow layer");
          // At once: through its 500 ms fade the computed opacity would read mid-transition.
          shadow.style.transition = "none";
          shadow.style.opacity = "1";
          const planted = document.createElement("span");
          planted.setAttribute("aria-hidden", "true");
          planted.style.cssText =
            "display:block;inline-size:60px;block-size:60px";
          shadow.after(planted);
        });
        expect((await page.evaluate(calmProbe)).ornaments).toEqual(
          expect.arrayContaining([expected, "aria-hidden SPAN 60"]),
        );
      });
    }
  }
});

/**
 * The founder's C3 on the occasion hubs (spec 008 §14 A-founder-2026-10-14c, AC-33, T-37): the
 * destination row before the grid. The hubs are unchanged by spec 043's revision (§14 "Hubs are
 * unchanged"); the three country listings' order is T-35 and T-37 above.
 */
test.describe("C3 on the occasion hubs (AC-33, T-37)", () => {
  for (const url of [
    "/en-gb/occasions/birthday",
    "/en/occasions/birthday",
    "/de/anlaesse/geburtstag",
    "/pl/okazje/urodziny",
  ]) {
    for (const size of [DESKTOP, PHONE]) {
      test(`${url} at ${String(size.width)}`, async ({ page }) => {
        await open(page, url, size);
        const order = await page.evaluate(() => {
          const chips = Array.from(
            document.querySelectorAll(
              "main [data-fo-hub-destinations], main [data-fo-hub-pills], main [data-fo-phone-chips]",
            ),
          ).find((element) => element.getBoundingClientRect().height > 0);
          const grid = document.querySelector("main [data-fo-listing-grid]");
          if (!chips || !grid) return null;
          return (chips.compareDocumentPosition(grid) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0
            ? ["chips", "grid"]
            : ["grid", "chips"];
        });
        expect(order).toStrictEqual(["chips", "grid"]);
      });
    }
  }
});

test.describe("spec 008 AC-9, spec 043 AC-39: the sort form with JavaScript off", () => {
  test("with JavaScript off, the form above the grid still sorts it", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: SIZES[2],
    });
    const page = await context.newPage();
    await page.goto(CATEGORY);
    const prices = async (): Promise<number[]> =>
      page
        .locator("main [data-fo-product-card]")
        .evaluateAll((cards) =>
          cards.map((card) =>
            Number(
              (card.querySelector("[data-fo-price]")?.textContent ?? "")
                .replace(/[^\d.,]/gu, "")
                .replace(/,/gu, ""),
            ),
          ),
        );
    await page.getByLabel(/sort by/iu).selectOption("price-asc");
    await page.getByRole("button", { name: /^sort$/iu }).click();
    await expect(page).toHaveURL(/\?sort=price-asc$/u);
    const sorted = await prices();
    expect(sorted.length).toBeGreaterThan(1);
    expect(sorted).toStrictEqual([...sorted].sort((a, b) => a - b));
    // Still above the grid after the round trip, and the Sort button is the `<noscript>` one.
    const form = await boxOf(page, "main [data-fo-listing-sort-form]");
    const firstCard = await boxOf(page, "main article[data-fo-product-card]");
    expect(form.bottom).toBeLessThanOrEqual(firstCard.top);
    await context.close();
  });
});

/**
 * T-39 (spec 008 §14 A-founder-2026-10-15c; TASK-241): on the country category, at every width,
 * the sibling chips fold into one "Categories" disclosure, a native `<details>` closed in the
 * server HTML, on the toolbar row, so the first row of cards keeps its place on the first screen
 * (spec 004 rebound AC-34, T-49's bound). Red with the chip line restored above the grid (the
 * first row's prices pass the bound at 1280 × 800, and a chip link renders outside the
 * `<details>`), with the disclosure moved under the grid, and with the links rendered by client
 * script only (the JS-off set empty).
 */
test.describe('T-39: the category\'s chips in a "Categories" disclosure (A-founder-2026-10-15c)', () => {
  // The summary reads the reviewed `nav.categories.label` (A-founder-2026-10-18a), resolved from
  // the locale's own catalogue (`en-gb` inherits `en`'s).
  const label = (locale: string): string =>
    (
      JSON.parse(
        readFileSync(
          resolve(import.meta.dirname, `../../messages/${locale}.json`),
          "utf8",
        ),
      ) as { nav: { categories: { label: string } } }
    ).nav.categories.label;
  const CATEGORIES = [
    { url: CATEGORY, messages: "en" },
    { url: "/de/polen/blumen/rosen", messages: "de" },
  ] as const;

  for (const { url, messages } of CATEGORIES) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)} × ${String(size.height)}`, async ({
        page,
      }) => {
        await open(page, url, size);
        // Two `<details>` on the row: "Categories" and "How we sort" (spec 043 item 2).
        await expect(page.locator("main details")).toHaveCount(2);
        const toggle = page.locator("main details[data-fo-listing-categories]");
        await expect(toggle).toHaveCount(1);
        expect(
          await toggle.evaluate(
            (element) => (element as HTMLDetailsElement).open,
          ),
          "closed",
        ).toBe(false);
        const summary = toggle.locator("summary");
        await expect(summary).toBeVisible();
        // Its words, without the `aria-hidden` "+", are exactly the label.
        expect(
          await summary.evaluate((element) => {
            const copy = element.cloneNode(true) as HTMLElement;
            for (const hidden of Array.from(
              copy.querySelectorAll("[aria-hidden='true']"),
            )) {
              hidden.remove();
            }
            return copy.textContent?.trim() ?? "";
          }),
          "the summary's words",
        ).toBe(label(messages));
        // No chip line beside it: every chip link is inside the `<details>`.
        await expect(page.locator("main [data-fo-listing-chips]")).toHaveCount(
          0,
        );
        const row = await page.evaluate(() => {
          const box = (query: string): DOMRect | undefined =>
            document.querySelector(query)?.getBoundingClientRect();
          const summaryBox = box("main [data-fo-listing-categories] > summary");
          const sort = box("main [data-fo-listing-sort-form] select");
          const count = box("main [data-fo-listing-status]");
          const card = box("main [data-fo-listing-grid] > li");
          const summaryElement = document.querySelector(
            "main [data-fo-listing-categories] > summary",
          );
          const grid = document.querySelector("main [data-fo-listing-grid]");
          const overlaps = (a?: DOMRect, b?: DOMRect): boolean =>
            a !== undefined &&
            b !== undefined &&
            a.height > 0 &&
            b.height > 0 &&
            a.top < b.bottom &&
            b.top < a.bottom;
          return {
            withSort: overlaps(summaryBox, sort),
            withCount: overlaps(summaryBox, count),
            summaryBottom: summaryBox?.bottom ?? Infinity,
            cardTop: card?.top ?? -1,
            beforeGrid:
              summaryElement !== null &&
              grid !== null &&
              (summaryElement.compareDocumentPosition(grid) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
                0,
          };
        });
        expect(row.beforeGrid, "before the grid in the DOM").toBe(true);
        expect(row.withSort, "on the sort form's row").toBe(true);
        // The count is in the quiet line above the row, never on it (spec 043 AC-37).
        expect(row.withCount, "not on the count's row").toBe(false);
        expect(row.summaryBottom, "above the first card").toBeLessThanOrEqual(
          row.cardTop + 0.5,
        );
        // The first row's prices are within the first screen (T-49's bound).
        const first = await firstRow(page);
        expect(first.length).toBe(size.width < 768 ? 2 : 4);
        for (const card of first) {
          expect(card.bottom, `${card.id} price bottom`).toBeLessThanOrEqual(
            size.height + 0.5,
          );
        }
        // Opened, the chips wrap in normal flow under the toolbar row and push the grid down.
        const before = row.cardTop;
        await summary.click();
        await expect(toggle.locator("a").first()).toBeVisible();
        const opened = await page.evaluate(() => {
          const panel = document
            .querySelector("main [data-fo-listing-categories] nav")
            ?.getBoundingClientRect();
          // Grouped: what it is, then the occasions (spec 043 §5.3 E).
          const card = document
            .querySelector("main [data-fo-listing-grid] > li")
            ?.getBoundingClientRect();
          return {
            panelBottom: panel?.bottom ?? Infinity,
            cardTop: card?.top ?? -1,
          };
        });
        expect(
          opened.panelBottom,
          "the panel above the grid",
        ).toBeLessThanOrEqual(opened.cardTop + 0.5);
        expect(opened.cardTop, "the grid pushed down").toBeGreaterThan(
          before + 20,
        );
      });
    }
  }

  test("with JavaScript off, every sibling link is in the HTML, closed, and answers 200", async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: SIZES[2],
    });
    const page = await context.newPage();
    await page.goto(CATEGORY);
    const chips = page.locator("main [data-fo-listing-categories] li");
    const links = page.locator("main [data-fo-listing-categories] a[href]");
    const hrefs = await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href") ?? ""),
    );
    const names = await chips.evaluateAll((elements) =>
      elements.map((element) => element.textContent?.trim() ?? ""),
    );
    // The sibling set the chip row carried (the exact set against `listingView()` is the unit
    // case in `catalog-category-page`), the current category marked and not a link, in two
    // labelled groups (spec 043 §5.3 E), each in the page's collation order (sortBy, by name).
    expect(names.length).toBeGreaterThan(5);
    expect(hrefs).toHaveLength(names.length - 1);
    const groups = await page
      .locator("main [data-fo-listing-categories] ul")
      .evaluateAll((lists) =>
        lists.map((list) =>
          Array.from(list.querySelectorAll("li")).map(
            (item) => item.textContent?.trim() ?? "",
          ),
        ),
      );
    expect(groups.length).toBe(2);
    for (const group of groups) {
      expect(group).toStrictEqual(
        [...group].sort(new Intl.Collator("en-GB").compare),
      );
    }
    await expect(
      page.locator("main [data-fo-listing-categories] h3"),
    ).toHaveText(["By what it is", "Shop by occasion"]);
    await expect(
      page.locator("main [data-fo-listing-categories] [aria-current='page']"),
    ).toHaveCount(1);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/en-gb\/poland\/flowers\/[a-z-]+$/u);
    }
    // No chip link outside the `<details>`.
    const all = await page
      .locator("main a[href]")
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.closest("details") === null)
          .map((element) => element.getAttribute("href") ?? ""),
      );
    for (const href of hrefs) {
      expect(all, href).not.toContain(href);
    }
    // Opens by keyboard with no script: the summary is the platform's own control.
    await page.locator("main [data-fo-listing-categories] > summary").focus();
    await page.keyboard.press("Enter");
    await expect(links.first()).toBeVisible();
    await expect(links.last()).toBeVisible();
    await context.close();
    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
    }
  });
});
