/**
 * Photographs first, the wordless placeholder, and every card image visible (spec 043 §5.3 F,
 * AC-13, AC-14, AC-15; T-13's and T-14's browser halves, T-15; TASK-290).
 *
 * What each case goes red on:
 * - T-13: the plants page's last two cards not being Peace Lily and Olive Sapling (the partition
 *   removed, or made unstable); the price sorts partitioned too (Peace Lily, the cheapest plant,
 *   pushed to the end of `price-asc`); an `ItemList`, where a listing emits one, that differs from
 *   the rendered cards (no listing emits one yet: spec 008 TASK-115).
 * - T-14: "Photography to supply" anywhere on the crawl set, a country listing, a hub or a product
 *   page in `en` and `en-gb`; a placeholder box that is not `aria-hidden="true"` or holds text; a
 *   card with a placeholder that lost its name or its price.
 * - T-15: after a real scroll to the end and network idle, a card image at an opacity under 1 or
 *   not decoded (`naturalWidth` 0); with `print` emulated and no scroll, any element in `<main>`
 *   under full opacity (red with the print rule removed: the pending sections sit at 0).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, expect, test } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "../..");
const PLANTS = "/en/poland/flowers/plants";
const PEACE_LILY = "/en/poland/product/peace-lily";
const CAPTION = /Photography to supply/iu;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit cases; run once, in e2e-desktop",
  );
});

async function cardNames(page: Page): Promise<string[]> {
  return page
    .locator("main article[data-fo-product-card] :is(h2, h3)")
    .evaluateAll((headings) =>
      headings.map((heading) => (heading.textContent ?? "").trim()),
    );
}

test.describe("T-13: photographed products first, price sorts unchanged (AC-13)", () => {
  test("the plants page ends with Peace Lily and Olive Sapling", async ({
    page,
  }) => {
    const response = await page.goto(PLANTS);
    expect(response?.status()).toBe(200);
    const names = await cardNames(page);
    expect(names.length).toBe(8);
    expect(names.slice(-2)).toEqual(["Peace Lily", "Olive Sapling"]);
    // The two are the only placeholder boxes, and both are at the end.
    const boxes = await page
      .locator("main article[data-fo-product-card]")
      .evaluateAll((cards) =>
        cards.map(
          (card) => card.querySelector("[data-fo-media-placeholder]") !== null,
        ),
      );
    expect(boxes).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  test("price-asc is the price order, with the placeholders where their prices put them", async ({
    page,
  }) => {
    const response = await page.goto(`${PLANTS}?sort=price-asc`);
    expect(response?.status()).toBe(200);
    const amounts = await page
      .locator("main article[data-fo-product-card] [data-fo-price] bdi")
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          Number(
            (node.textContent ?? "")
              .replace(/[^\d.,]/gu, "")
              .replace(/,/gu, ""),
          ),
        ),
      );
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    const names = await cardNames(page);
    // Peace Lily is among the cheapest plants: a partitioned price sort would put it last.
    expect(names.slice(-2)).not.toContain("Peace Lily");
  });

  test("an ItemList, where a listing emits one, equals the rendered cards", async ({
    page,
  }) => {
    await page.goto(PLANTS);
    const lists = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    )
      .flatMap((block) => {
        const parsed = JSON.parse(block) as unknown;
        return Array.isArray(parsed) ? parsed : [parsed];
      })
      .filter(
        (node): node is { itemListElement: { name?: string }[] } =>
          typeof node === "object" &&
          node !== null &&
          (node as { "@type"?: string })["@type"] === "ItemList",
      );
    const names = await cardNames(page);
    for (const list of lists) {
      expect(list.itemListElement.map((item) => item.name)).toEqual(names);
    }
  });
});

/** The pages T-14 scans: the crawl set and every country listing, hub and product page in en/en-gb. */
function scannedPages(): string[] | undefined {
  const file = join(ROOT, ".next", "prerender-manifest.json");
  if (!existsSync(file)) return undefined;
  const routes = Object.keys(
    (
      JSON.parse(readFileSync(file, "utf8")) as {
        routes?: Record<string, unknown>;
      }
    ).routes ?? {},
  );
  const products = JSON.parse(
    readFileSync(join(ROOT, "tests/fixtures/shop/product-urls.json"), "utf8"),
  ) as Record<string, readonly string[]>;
  const pages = new Set<string>(["/"]);
  for (const route of routes) {
    const parts = route.split("/").filter(Boolean);
    if (parts[0] !== "en" && parts[0] !== "en-gb") continue;
    // The internal product route is read at its public address below.
    if (parts[1] === "-product") continue;
    pages.add(route);
  }
  for (const locale of ["en", "en-gb"]) {
    for (const url of products[locale] ?? []) pages.add(url);
  }
  return [...pages];
}

test.describe("T-14: no caption, and an aria-hidden empty box (AC-14)", () => {
  test.describe.configure({ timeout: 300_000 });

  test('no page in en or en-gb says "Photography to supply"', async ({
    request,
  }) => {
    const pages = scannedPages();
    test.skip(pages === undefined, "needs the build's prerender manifest");
    expect(pages?.length ?? 0).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const path of pages ?? []) {
      const response = await request.get(path);
      if (response.status() !== 200) continue;
      if (CAPTION.test(await response.text())) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  for (const [path, expected] of [
    [PLANTS, 2],
    [PEACE_LILY, 1],
  ] as const) {
    test(`${path}: each placeholder box is aria-hidden, empty, and its card keeps name and price`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const boxes = await page
        .locator("main [data-fo-media-placeholder]")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            hidden: node.getAttribute("aria-hidden"),
            text: (node.textContent ?? "").trim(),
            children: node.children.length,
            card: (() => {
              const card = node.closest("article[data-fo-product-card]");
              return card === null
                ? null
                : {
                    name: (
                      card.querySelector("h2, h3")?.textContent ?? ""
                    ).trim(),
                    price: (
                      card.querySelector("[data-fo-price]")?.textContent ?? ""
                    ).trim(),
                  };
            })(),
          })),
        );
      expect(boxes.length).toBeGreaterThanOrEqual(expected);
      for (const box of boxes) {
        expect(box.hidden).toBe("true");
        expect(box.text).toBe("");
        expect(box.children).toBe(0);
        if (box.card !== null) {
          expect(box.card.name).not.toBe("");
          expect(box.card.price).toMatch(/\d/u);
        }
      }
      expect(await page.locator("main").innerText()).not.toMatch(CAPTION);
    });
  }
});

test.describe("T-15: every card image visible after a real scroll, and in print (AC-15)", () => {
  for (const path of ["/en/poland/flowers", PLANTS]) {
    test(`${path} at 1440 × 900: scrolled to the end, every card image is shown`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      // A real scroll, a screen at a time, so each image enters the viewport as a reader's would.
      const height = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y <= height; y += 600) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(60);
      }
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll<HTMLImageElement>(
            "main article[data-fo-product-card] img",
          ),
        ).every(
          (img) => img.complete && Number(getComputedStyle(img).opacity) === 1,
        ),
      );
      const cards = await page
        .locator("main article[data-fo-product-card]")
        .evaluateAll((articles) =>
          articles.map((article) => {
            const img = article.querySelector("img");
            if (img === null) {
              return {
                placeholder:
                  article.querySelector("[data-fo-media-placeholder]") !== null,
              };
            }
            return {
              opacity: Number(getComputedStyle(img).opacity),
              naturalWidth: img.naturalWidth,
            };
          }),
        );
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        if ("placeholder" in card) expect(card.placeholder).toBe(true);
        else {
          expect(card.opacity).toBe(1);
          expect(card.naturalWidth).toBeGreaterThan(0);
        }
      }
    });

    test(`${path} printed, with no scroll: nothing in <main> under full opacity`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // The motion module has marked what lies below the fold as pending on screen.
      expect(
        await page
          .locator("[data-fo-reveal='pending'], img[data-fo-fade='pending']")
          .count(),
      ).toBeGreaterThan(0);
      await page.emulateMedia({ media: "print" });
      const faint = await page.evaluate(() =>
        Array.from(document.querySelectorAll("main *"))
          .filter((element) => Number(getComputedStyle(element).opacity) < 1)
          .map(
            (element) =>
              `${element.tagName.toLowerCase()}${element.getAttribute("data-fo-reveal") === null ? "" : "[data-fo-reveal]"}`,
          ),
      );
      expect(faint).toEqual([]);
    });
  }
});
