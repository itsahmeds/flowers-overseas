/**
 * The three country listings' first screens, as a browser lays them out (spec 004 §14 **A24**
 * clause 2, rebound **AC-34**, **AC-45**, T-49, T-50; spec 008 §14 **A15**, **A16**,
 * A-founder-2026-10-14c, AC-31, AC-33, AC-6, T-35, T-37, T-06; TASK-187, TASK-241).
 *
 * Three sizes: 1440 × 900 and 1280 × 800 (the laptop band) and 390 × 844 (the phone). Every case
 * sets its own viewport, so it runs once, in `e2e-desktop`.
 *
 * What each probe would go red on, by construction:
 * - the first row: a card of the grid's first row whose photograph top or price bottom lies
 *   outside the viewport (a lead figure restored above the grid pushes the row down);
 * - the state line: text that is not the message for the `data-fo-listing-state-line` state the
 *   server rendered, a line not directly under the H1 at 390, or no line;
 * - the price marker: a card's price with no "all in" in the same card (a bare number);
 * - AC-45: a band of the first viewport over 120 px tall with no text, image or control in it, and
 *   any rotated element or `aria-hidden` element 48 px or larger;
 * - C3 (spec 008 §14 A-founder-2026-10-14c, AC-33, T-37; TASK-241, which withdrew T-36): a sort
 *   form or a chip row after the grid or below its first card, a count line or disclosure that is
 *   not visible or not before them, a pager before the grid, in any of four locales at 390 or 1440;
 *   a form that no longer sorts with JavaScript off;
 * - the phone label: anything but exactly one displayed "Example arrangement" label above the
 *   grid's first card, inside the first viewport, while every card's own label stays in the HTML.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Page, expect, test } from "@playwright/test";

import { forbiddenPhrasesIn } from "../support/forbidden-phrases";

const SHOP = "/en-gb/poland/flowers";
const CATEGORY = "/en-gb/poland/flowers/roses";
const OCCASION = "/en-gb/poland/occasions/mothers-day";
const PAGES = [SHOP, CATEGORY, OCCASION] as const;

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

/** The state messages, from the catalogue the page renders (no copy retyped here). */
const MESSAGES = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../messages/en.json"), "utf8"),
) as { destinations: { state: Record<string, string> } };
const STATE_TEXT: Readonly<Record<string, string | undefined>> = {
  guide: MESSAGES.destinations.state["guideNotDelivering"],
  live: MESSAGES.destinations.state["deliveringNow"],
};

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
}

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
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

/**
 * The grid's first row: every displayed card whose top equals the first displayed card's top, each
 * as its photograph's top and its price's bottom. On the occasion page from `md` up the lead `<li>`
 * is placed over the hero, so the grid's first row is the first row of the other cards.
 */
async function firstRow(
  page: Page,
): Promise<{ id: string; top: number; bottom: number; price: string }[]> {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main [data-fo-listing-grid] > li:not([data-fo-lead-item]) article, main [data-fo-listing-grid] > li[data-fo-lead-item] article",
      ),
    ).filter((card) => {
      const li = card.closest("li");
      return li !== null && getComputedStyle(li).position !== "absolute";
    });
    const first = cards[0]?.getBoundingClientRect().top;
    return cards
      .filter(
        (card) => Math.abs(card.getBoundingClientRect().top - (first ?? 0)) < 1,
      )
      .map((card) => {
        // The price is the amount with its "all in" (the `Price` primitive's first line). The
        // approximate-equivalents line under it (spec 004 §14 A21 clause 6) is a separate line,
        // as the TASK-187 brief lists "price, `catalog.price.allIn` and the equivalents line".
        const price = card.querySelector<HTMLElement>(
          "[data-fo-price] > :first-child",
        );
        return {
          id: card.getAttribute("data-fo-product-card") ?? "",
          top: card.getBoundingClientRect().top,
          bottom:
            price?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          // `innerText`: a marker hidden by CSS is not beside the price.
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

test.describe("rebound AC-34 (T-49): the first screen of the three country types", () => {
  for (const url of PAGES) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)} × ${String(size.height)}`, async ({
        page,
      }) => {
        await open(page, url, size);

        // The H1, first in DOM order, inside the viewport.
        const h1 = await boxOf(page, "main h1");
        expect(inside(h1, size), "H1").toBe(true);

        // The state line, from the view's state, inside the viewport and directly under the H1.
        const line = page.locator("main [data-fo-listing-state-line]");
        await expect(line).toHaveCount(1);
        const state =
          (await line.getAttribute("data-fo-listing-state-line")) ?? "";
        expect(STATE_TEXT[state], state).toBeDefined();
        await expect(line).toHaveText(STATE_TEXT[state] ?? "");
        const lineBox = await boxOf(page, "main [data-fo-listing-state-line]");
        expect(inside(lineBox, size), "state line").toBe(true);
        expect(lineBox.top, "state line under the H1").toBeGreaterThanOrEqual(
          h1.bottom - 0.5,
        );
        expect(
          await page.evaluate(
            () =>
              document
                .querySelector("main h1")
                ?.nextElementSibling?.hasAttribute(
                  "data-fo-listing-state-line",
                ) ?? false,
          ),
          "the state line is the H1's next sibling",
        ).toBe(true);

        // The H1 precedes the first price in DOM order.
        expect(
          await page.evaluate(() => {
            const h = document.querySelector("main h1");
            const price = document.querySelector("main [data-fo-price]");
            return (
              h !== null &&
              price !== null &&
              (h.compareDocumentPosition(price) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
                0
            );
          }),
        ).toBe(true);

        const row = await firstRow(page);
        if (url === OCCASION) {
          // The date and `items[0]`'s price, and at 390 the whole first row.
          expect(
            inside(await boxOf(page, "main [data-fo-occasion-date]"), size),
            "the date",
          ).toBe(true);
          const leadPrice = await boxOf(
            page,
            "main li[data-fo-lead-item] [data-fo-price]",
          );
          expect(inside(leadPrice, size), "items[0]'s price").toBe(true);
          if (size.width < 768) {
            expect(row.length).toBe(2);
            for (const card of row) {
              expect(card.top, card.id).toBeGreaterThanOrEqual(-0.5);
              expect(card.bottom, card.id).toBeLessThanOrEqual(
                size.height + 0.5,
              );
            }
          }
        } else {
          // No lead figure: `items[0]` is the grid's first card, and the whole first row of
          // priced cards lies inside the viewport, photograph top to price bottom.
          await expect(page.locator("main [data-fo-lead]")).toHaveCount(0);
          expect(row.length, "cards in the first row").toBe(
            size.width < 768 ? 2 : 4,
          );
          for (const card of row) {
            expect(card.top, `${card.id} photo top`).toBeGreaterThanOrEqual(
              -0.5,
            );
            expect(card.bottom, `${card.id} price bottom`).toBeLessThanOrEqual(
              size.height + 0.5,
            );
            expect(card.price, `${card.id} price`).toContain("all in");
          }
        }

        // Every card's price has "all in" beside it, in the same card, at every width.
        const cards = page.locator("main article[data-fo-product-card]");
        const count = await cards.count();
        expect(count).toBe(url === OCCASION ? 7 : 12);
        for (let index = 0; index < count; index += 1) {
          const price = cards.nth(index).locator("[data-fo-price]");
          await expect(price).toBeVisible();
          // Rendered text, so a marker hidden by CSS below `md` counts as absent (T-49).
          await expect(price).toContainText("all in", { useInnerText: true });
        }

        // Each product's URL once in `<main>` (AC-31).
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

        // No first-viewport text says what AC-37 forbids.
        expect(forbiddenPhrasesIn(await firstViewportText(page))).toStrictEqual(
          [],
        );
      });
    }
  }

  for (const url of [SHOP, CATEGORY]) {
    test(`${url}?page=2 renders no hero`, async ({ page }) => {
      await open(page, `${url}?page=2`, SIZES[0]);
      await expect(page.locator("main [data-fo-listing-hero]")).toHaveCount(0);
      await expect(
        page.locator("main [data-fo-listing-state-line]"),
      ).toHaveCount(0);
      await expect(page.locator("main h1")).toHaveCount(1);
      // The results start the page: the first card's photograph is in the first viewport.
      const first = await boxOf(page, "main article[data-fo-product-card]");
      expect(first.top).toBeLessThan(SIZES[0].height);
    });
  }
});

test.describe("AC-45 (T-50): calm, not bland", () => {
  for (const url of PAGES) {
    for (const size of SIZES) {
      test(`${url} at ${String(size.width)} × ${String(size.height)}: no gap over 120 px, no ornament`, async ({
        page,
      }) => {
        await open(page, url, size);
        const probe = await page.evaluate(() => {
          const header = document.querySelector("header");
          const top = header?.getBoundingClientRect().bottom ?? 0;
          const bottom = window.innerHeight;
          const main = document.querySelector("main");
          if (main === null) throw new Error("no main");
          // Every text node, image and form control in `<main>` inside the span.
          const spans: [number, number][] = [];
          const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
          for (
            let node = walker.nextNode();
            node !== null;
            node = walker.nextNode()
          ) {
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
              ([a, b]) =>
                [Math.max(a, top), Math.min(b, bottom)] as [number, number],
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
            if (
              element.getAttribute("aria-hidden") === "true" &&
              rect.width >= 48 &&
              rect.height >= 48
            ) {
              ornaments.push(
                `aria-hidden ${element.tagName} ${String(rect.width)}`,
              );
            }
          }
          return { widest, ornaments };
        });
        expect(probe.widest, "the widest empty band").toBeLessThanOrEqual(120);
        expect(probe.ornaments).toStrictEqual([]);
      });
    }
  }
});

/**
 * The founder's C3 (spec 008 §14 A-founder-2026-10-14c, AC-33, T-37; TASK-241): on the shop root,
 * the country category, the country occasion and the occasion hub, at 390 and 1440, in four
 * locales — the count line, the ranking disclosure, the chip row and the sort form, in that DOM
 * order, all ending above the first card of the grid; the pager after the grid; no sort form and
 * no chip row after it. The "first card" is the grid's first card in flow: on the country occasion
 * from `md` up the lead `<li>` is drawn over the hero (A16 (b)), so it is the first of the others.
 */
const C3_PAGES = [
  {
    locale: "en-gb",
    pages: [SHOP, CATEGORY, OCCASION, "/en-gb/occasions/mothers-day"],
  },
  {
    locale: "en",
    pages: [
      "/en/poland/flowers",
      "/en/poland/flowers/roses",
      "/en/poland/occasions/mothers-day",
      "/en/occasions/mothers-day",
    ],
  },
  {
    locale: "de",
    pages: [
      "/de/polen/blumen",
      "/de/polen/blumen/rosen",
      "/de/polen/anlaesse/muttertag",
      "/de/anlaesse/muttertag",
    ],
  },
  {
    locale: "pl",
    pages: [
      "/pl/polska/kwiaty",
      "/pl/polska/kwiaty/roze",
      "/pl/polska/okazje/dzien-matki",
      "/pl/okazje/dzien-matki",
    ],
  },
] as const;

/** "Change the order" in each locale, from the catalogue the page renders. */
function reorderLabel(locale: string): string {
  const read = (file: string): string | undefined => {
    const messages = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, `../../messages/${file}.json`),
        "utf8",
      ),
    ) as { shop?: { toolbar?: { reorderLabel?: string } } };
    return messages.shop?.toolbar?.reorderLabel;
  };
  return read(locale) ?? read(locale.split("-")[0] ?? "en") ?? "";
}

interface C3Layout {
  /** The hooks found, in DOM order, among the parts AC-33 orders. */
  readonly order: readonly string[];
  /** Each part's box bottom and height, and the first in-flow card's top. */
  readonly bottoms: Readonly<
    Record<string, { bottom: number; height: number }>
  >;
  readonly firstCardTop: number;
  /** Every `form`, `select` or `nav` in `<main>` after the grid, other than the pager. */
  readonly afterGrid: readonly string[];
}

/** The parts AC-33 orders, read off the served page in one pass. */
async function c3Layout(page: Page): Promise<C3Layout> {
  return page.evaluate(() => {
    const parts: readonly (readonly [string, string])[] = [
      ["count", "main [data-fo-listing-count]"],
      ["disclosure", "main [data-fo-listing-disclosure]"],
      [
        "chips",
        "main [data-fo-listing-chips], main [data-fo-hub-destinations]",
      ],
      ["sort", "main [data-fo-listing-sort-form]"],
      ["grid", "main [data-fo-listing-grid]"],
      ["pager", "main [data-fo-pagination]"],
    ];
    const found: { name: string; element: Element }[] = [];
    const bottoms: Record<string, { bottom: number; height: number }> = {};
    for (const [name, query] of parts) {
      const all = Array.from(document.querySelectorAll(query));
      if (all.length === 0) continue;
      if (all.length > 1)
        throw new Error(`${name}: ${String(all.length)} elements`);
      const element = all[0] as Element;
      found.push({ name, element });
      const rect = element.getBoundingClientRect();
      bottoms[name] = { bottom: rect.bottom, height: rect.height };
    }
    found.sort((a, b) =>
      a.element.compareDocumentPosition(b.element) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    );
    const grid = document.querySelector("main [data-fo-listing-grid]");
    const inFlow = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main [data-fo-listing-grid] > li",
      ),
    ).find((li) => getComputedStyle(li).position !== "absolute");
    const afterGrid =
      grid === null
        ? []
        : Array.from(
            document.querySelectorAll("main form, main select, main nav"),
          )
            .filter(
              (element) =>
                (grid.compareDocumentPosition(element) &
                  Node.DOCUMENT_POSITION_FOLLOWING) !==
                  0 && !element.hasAttribute("data-fo-pagination"),
            )
            .map((element) => element.outerHTML.slice(0, 120));
    return {
      order: found.map((part) => part.name),
      bottoms,
      firstCardTop:
        inFlow?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
      afterGrid,
    };
  });
}

test.describe("C3: sort and the chips above the grid on every listing (AC-33, T-37)", () => {
  for (const { locale, pages } of C3_PAGES) {
    for (const url of pages) {
      const hub = url === pages[3];
      for (const size of [SIZES[0], SIZES[2]]) {
        test(`${url} at ${String(size.width)}`, async ({ page }) => {
          await open(page, url, size);
          const layout = await c3Layout(page);
          const expected = hub
            ? ["chips", "grid"]
            : ["count", "disclosure", "chips", "sort", "grid"];
          // DOM order: the parts the page has, in AC-33's order, the pager (where there is one)
          // after the grid.
          expect(
            layout.order.filter((name) => name !== "pager"),
            "DOM order",
          ).toStrictEqual(expected);
          if (layout.order.includes("pager")) {
            expect(layout.order.at(-1), "the pager follows the grid").toBe(
              "pager",
            );
          }
          // Boxes: every part above the grid is displayed and ends above the first card's top.
          for (const name of expected.filter((part) => part !== "grid")) {
            const box = layout.bottoms[name];
            expect(box, name).toBeDefined();
            expect(box?.height ?? 0, `${name} is displayed`).toBeGreaterThan(
              10,
            );
            expect(
              box?.bottom ?? Infinity,
              `${name} ends above the first card`,
            ).toBeLessThanOrEqual(layout.firstCardTop + 0.5);
          }
          // Nothing that sorts or narrows the list follows the grid.
          expect(layout.afterGrid, "after the grid").toStrictEqual([]);
          if (!hub) {
            for (const hook of [
              "[data-fo-listing-count]",
              "[data-fo-listing-disclosure]",
            ]) {
              await expect(page.locator(`main ${hook}`), hook).toBeVisible();
            }
            // The one sort control, labelled "Change the order" (A10).
            await expect(page.locator("main form")).toHaveCount(1);
            await expect(page.locator("main select")).toHaveCount(1);
            await expect(
              page.locator("main [data-fo-listing-sort-form]"),
            ).toContainText(reorderLabel(locale));
            // The disclosure is not clipped.
            expect(
              await page
                .locator("main [data-fo-listing-disclosure]")
                .evaluate(
                  (element) => element.scrollHeight <= element.clientHeight + 1,
                ),
            ).toBe(true);
          }
          // Below `md` the chip row is one horizontal scroller: every chip on one line
          // (A16 (e), spec 004 AC-49).
          if (!hub && size.width < 768) {
            const tops = await page
              .locator("main [data-fo-listing-chips] li")
              .evaluateAll((items) =>
                items.map((item) =>
                  Math.round(item.getBoundingClientRect().top),
                ),
              );
            expect(tops.length).toBeGreaterThan(1);
            expect(new Set(tops).size, "one line").toBe(1);
          }
        });
      }
    }
  }

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
    // Still above the grid after the round trip.
    const layout = await c3Layout(page);
    expect(layout.order.indexOf("sort")).toBeLessThan(
      layout.order.indexOf("grid"),
    );
    await context.close();
  });
});

test.describe("the phone's honesty label, once per grid (spec 008 §14 A16 (a), T-06)", () => {
  for (const url of [SHOP, CATEGORY]) {
    test(`${url} at 390: one displayed label, above the first card, in the first viewport`, async ({
      page,
    }) => {
      await open(page, url, SIZES[2]);
      const shown = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll("main [data-fo-media-provenance]"),
        ).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            displayed: rect.height > 0,
          };
        }),
      );
      const displayed = shown.filter((label) => label.displayed);
      expect(displayed).toHaveLength(1);
      const first = await boxOf(page, "main article[data-fo-product-card]");
      expect(displayed[0]?.bottom ?? Infinity).toBeLessThanOrEqual(first.top);
      expect(displayed[0]?.top ?? -1).toBeGreaterThanOrEqual(0);
      // The per-card labels stay in the HTML, hidden by CSS.
      expect(shown.length).toBeGreaterThan(1);
    });
  }
});

test.describe("the country occasion's lead is one element (spec 008 §14 A16 (b), T-35)", () => {
  for (const size of [SIZES[0], SIZES[2]]) {
    test(`at ${String(size.width)}: items[0] once, and its URL once in <main>`, async ({
      page,
    }) => {
      await open(page, OCCASION, size);
      await expect(page.locator("main [data-fo-lead-item]")).toHaveCount(1);
      const id = await page
        .locator("main [data-fo-lead-item] article")
        .getAttribute("data-fo-product-card");
      await expect(
        page.locator(`main [data-fo-product-card="${id ?? ""}"]`),
      ).toHaveCount(1);
      await expect(
        page.locator("main [data-fo-lead-item] article"),
      ).toBeVisible();
      // It is the grid's first `<li>` in the DOM at every width.
      expect(
        await page.evaluate(
          () =>
            document
              .querySelector("main [data-fo-listing-grid] > li")
              ?.hasAttribute("data-fo-lead-item") ?? false,
        ),
      ).toBe(true);
    });
  }
});
