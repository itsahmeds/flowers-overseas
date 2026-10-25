/**
 * The v3 home, products first, in a browser (spec 004 §14 A-founder-2026-10-24a items 2 to 4 and
 * 8; TASK-386, TASK-387; `docs/design/wireframes/home-desktop.dc.html`, `home-mobile.dc.html`).
 *
 *  - **T-98 / AC-92, the picker** (JavaScript off): inside the first viewport at 1440 × 900 and
 *    390 × 844, its label, one button per shop country up to `PICKER_CHIPS` in the one country
 *    order (`shopCountries()`, today's value in `../support/home-today.ts`), the field with a `<datalist>`, the remember line; a country
 *    submitted by keyboard lands on that country's shop root. Red with the buttons ordered by code.
 *  - **T-100 / AC-94, the first screen** (first visit, no cookies): the first card's photograph top
 *    at most the viewport height less 160 px, the card a link, the H1, the picker and the state
 *    line in view, no fixed or sticky box over the first card, one displayed `fetchpriority=high`
 *    image per width with non-overlapping preload `media`, at most 307,200 B of images at 390,
 *    and no sideways scroll. Red with the hero photograph above the first card on the phone.
 *    Lighthouse's LCP and CLS medians are the CI job's.
 *  - **T-101 / AC-95, the whole core range**: after a full scroll, the distinct products displayed
 *    are exactly `coreRange()` (`../support/home-today.ts`), each card's chooser link answering 200.
 *  - **T-102 / AC-96, the sections**: their order, the counts, the price words' links, Coming up's
 *    date order, the last-element rule and no sentence picker.
 *  - **T-103 / AC-97, the tabs** (JavaScript off): click and arrow keys show only the chosen panel,
 *    with no request; the names; no script in the section.
 *  - **T-113 / AC-107, the labels and `ItemList`s**: the example label once per section grid, the
 *    per-card labels in the HTML and hidden, and each section's `ItemList` equal to its cards with
 *    no price.
 */
import { type Page, expect, test } from "@playwright/test";

import { PICKER_CHIPS } from "@/config/commerce";

import {
  CORE_RANGE_TODAY,
  SHOP_COUNTRIES_TODAY,
} from "../support/home-today.ts";
import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

const PATHS = ["/en", "/en-gb"] as const;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

const PICKER = "[data-fo-home-picker]";
const SELECTION = '[data-fo-home-section="selection"]';
const OCCASIONS = '[data-fo-home-section="occasions"]';
const PRICE = '[data-fo-home-section="price"]';
const COMING_UP = '[data-fo-home-section="coming-up"]';
const FIRST_CARD = `${SELECTION} article`;

/** AC-94's bound: the first card's photograph starts at least 160 px above the viewport's foot. */
const FIRST_CARD_MARGIN = 160;
/** AC-94: the first screen's image transfer at 390 × 844. */
const FIRST_SCREEN_IMAGE_BYTES = 307_200;

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const locator = page.locator(selector).first();
  await expect(locator, selector).toBeVisible();
  return locator.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      top: box.top + window.scrollY,
      bottom: box.bottom + window.scrollY,
      left: box.left,
      right: box.right,
    };
  });
}

function inViewport(box: Box, height: number): boolean {
  return box.top >= 0 && box.bottom <= height;
}

test.describe("T-98: the home picker, JavaScript off (AC-92)", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of PATHS) {
    for (const viewport of VIEWPORTS) {
      test(`${path} at ${String(viewport.width)} × ${String(viewport.height)}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        expect((await page.goto(path))?.status()).toBe(200);

        expect(
          inViewport(await boxOf(page, PICKER), viewport.height),
          "the picker is inside the first viewport",
        ).toBe(true);
        await expect(page.locator(PICKER)).toContainText(
          "Where should the flowers go?",
        );
        // One button per shop country, up to PICKER_CHIPS, in the one country order.
        const expected = SHOP_COUNTRIES_TODAY.slice(0, PICKER_CHIPS).map(
          (code) => code.toLowerCase(),
        );
        const chips = await page
          .locator(`${PICKER} button[name="to"]`)
          .evaluateAll((nodes) =>
            nodes.map((node) => (node as HTMLButtonElement).value),
          );
        expect(chips.map((code) => code.toLowerCase())).toStrictEqual(expected);
        // The searchable field over a datalist of every registry country.
        const field = page.locator(`${PICKER} input[type="search"][name="to"]`);
        await expect(field).toHaveCount(1);
        const list = await field.getAttribute("list");
        expect(
          await page.locator(`datalist#${list ?? ""} option`).count(),
        ).toBeGreaterThanOrEqual(expected.length);
        await expect(page.locator(PICKER)).toContainText(
          "We will remember this country on this device.",
        );
      });
    }

    test(`${path}: a country chosen by keyboard lands on its shop root`, async ({
      page,
    }) => {
      await page.goto(path);
      const first = page.locator(`${PICKER} button[name="to"]`).first();
      await first.focus();
      await Promise.all([
        page.waitForURL((url) => url.pathname.startsWith(`${path}/`)),
        page.keyboard.press("Enter"),
      ]);
      const landed = new URL(page.url());
      expect(landed.pathname.startsWith(`${path}/`)).toBe(true);
      expect(landed.search).toBe("");
      await expect(page.locator("h1")).toHaveCount(1);
      // The shop root prices its products: the country's prices, at last.
      await expect(page.locator("main [data-fo-price]").first()).toBeVisible();
    });
  }
});

test.describe("T-100: the first screen on a first visit (AC-94)", () => {
  test.use({ storageState: NO_LOCALE_CHOICE });

  for (const path of PATHS) {
    for (const viewport of VIEWPORTS) {
      test(`${path} at ${String(viewport.width)} × ${String(viewport.height)}`, async ({
        page,
      }) => {
        const images = new Map<string, number>();
        page.on("response", (response) => {
          const type = response.headers()["content-type"] ?? "";
          if (!type.startsWith("image/")) return;
          void response
            .body()
            .then((body) => images.set(response.url(), body.byteLength))
            .catch(() => undefined);
        });
        await page.setViewportSize(viewport);
        expect((await page.goto(path))?.status()).toBe(200);
        await page.waitForLoadState("networkidle");

        // The first card's photograph, and the card a link.
        // A card draws its photograph twice, one per width (the priority one below `md`).
        const photo = await boxOf(
          page,
          `${SELECTION} li:first-child article [data-fo-media-slot]:visible`,
        );
        expect(
          photo.top,
          `first card's photograph top ${String(photo.top)}`,
        ).toBeLessThanOrEqual(viewport.height - FIRST_CARD_MARGIN);
        await expect(
          page.locator(`${FIRST_CARD}`).first().locator("a[href]"),
        ).toHaveCount(1);
        // The H1, the picker and spec 043 AC-8's line in the first viewport.
        for (const selector of ["h1", PICKER, "[data-fo-home-state]"]) {
          expect(
            inViewport(await boxOf(page, selector), viewport.height),
            selector,
          ).toBe(true);
        }
        // No photograph above the first card on the phone (item 4.2).
        if (viewport.width < 768)
          await expect(page.locator("[data-fo-home-photo]")).toBeHidden();

        // No fixed or sticky box over the first card (the language sheet included).
        const card = await page
          .locator(FIRST_CARD)
          .first()
          .evaluate((node) => {
            const box = node.getBoundingClientRect();
            return {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
            };
          });
        const over = await page.evaluate((target) => {
          const hits: string[] = [];
          for (const node of document.querySelectorAll("body *")) {
            const style = getComputedStyle(node);
            if (style.position !== "fixed" && style.position !== "sticky")
              continue;
            if (!node.checkVisibility({ visibilityProperty: true })) continue;
            const box = node.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if (
              box.left < target.right &&
              target.left < box.right &&
              box.top < target.bottom &&
              target.top < box.bottom
            )
              hits.push(
                `${node.tagName} ${[...node.attributes].map((a) => a.name).join(" ")}`,
              );
          }
          return hits;
        }, card);
        expect(over).toStrictEqual([]);

        // One displayed priority image per width, and preloads whose media do not overlap.
        const high = await page
          .locator('img[fetchpriority="high"]')
          .evaluateAll(
            (nodes) =>
              nodes.filter(
                (node) =>
                  node.checkVisibility() &&
                  node.getBoundingClientRect().width > 0,
              ).length,
          );
        expect(high, "displayed fetchpriority=high images").toBe(1);
        const media = await page
          .locator('link[rel="preload"][as="image"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("media")),
          );
        expect(media.toSorted()).toStrictEqual([
          "(min-width: 48rem)",
          "(width < 48rem)",
        ]);
        const matching = await page.evaluate(
          (list) =>
            list.filter((query) => query !== null && matchMedia(query).matches)
              .length,
          media,
        );
        expect(matching, "one preload applies at this width").toBe(1);

        // The image bytes of the first screen, and nothing to scroll sideways.
        if (viewport.width === 390) {
          let total = 0;
          for (const bytes of images.values()) total += bytes;
          expect(total, `${String(total)} B of images`).toBeLessThanOrEqual(
            FIRST_SCREEN_IMAGE_BYTES,
          );
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(viewport.width);
      });
    }
  }
});

test.describe("T-101: the whole core range on the home (AC-95)", () => {
  for (const path of PATHS) {
    for (const viewport of VIEWPORTS) {
      test(`${path} at ${String(viewport.width)}`, async ({
        page,
        request,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        });
        const core: string[] = [...CORE_RANGE_TODAY];
        // Displayed: in a section's visible grid (the default state, so the checked tab only).
        const shown = await page
          .locator("[data-fo-home-section] article[data-fo-product-card]")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.checkVisibility())
              .map((node) => ({
                id: node.getAttribute("data-fo-product-card") ?? "",
                href: node.querySelector("a[href]")?.getAttribute("href") ?? "",
              })),
          );
        const distinct = [...new Set(shown.map((card) => card.id))];
        expect(distinct.toSorted()).toStrictEqual(core.toSorted());
        for (const href of new Set(shown.map((card) => card.href))) {
          expect(href, href).toMatch(/\/product\//u);
          expect(
            (await request.get(href, { maxRedirects: 0 })).status(),
            href,
          ).toBe(200);
        }
      });
    }
  }
});

test.describe("T-102: the home's sections (AC-96)", () => {
  test("/en: the order, the counts, the price words, Coming up, the last-element rule", async ({
    page,
  }) => {
    await page.goto("/en");
    const order = await page
      .locator("main [data-fo-home-section]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-fo-home-section")),
      );
    expect(order.slice(0, 3)).toStrictEqual([
      "selection",
      "occasions",
      "price",
    ]);
    expect(
      await page.locator("main [data-fo-hero]").evaluate((hero) => {
        const first = document.querySelector("main [data-fo-home-section]");
        return first !== null
          ? Boolean(
              hero.compareDocumentPosition(first) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            )
          : false;
      }),
      "the first screen comes first",
    ).toBe(true);
    await expect(page.locator("[data-fo-sentence]")).toHaveCount(0);

    // Our selection: "How we sort" closed, See all to the chooser.
    await expect(page.locator(`${SELECTION} details[open]`)).toHaveCount(0);
    await expect(
      page.locator(`${SELECTION} a[data-fo-see-all="selection"]`),
    ).toHaveAttribute("href", "/en/choose-country");

    // Shop by occasion: up to four cards per panel and a plain hub link.
    for (const panel of await page
      .locator(`${OCCASIONS} [data-fo-occasion-panel]`)
      .all()) {
      expect(await panel.locator("article").count()).toBeLessThanOrEqual(4);
      const hub = panel.locator("a[data-fo-see-all]");
      if ((await hub.count()) > 0)
        expect(await hub.getAttribute("rel")).toBeNull();
    }

    // Shop by price: three word labels, chooser links, no amount.
    const bands = await page
      .locator(`${PRICE} a[data-fo-price-band]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          node.getAttribute("href"),
          node.getAttribute("rel"),
          node.textContent,
        ]),
      );
    expect(bands).toStrictEqual([
      ["/en/choose-country/price/low", "nofollow", "Lower prices"],
      ["/en/choose-country/price/mid", "nofollow", "Middle prices"],
      ["/en/choose-country/price/high", "nofollow", "Higher prices"],
    ]);
    await expect(page.locator(PRICE)).not.toContainText(/\d/u);

    // Coming up, when drawn: at most three, in date order, each with countries and up to 3 cards.
    if ((await page.locator(COMING_UP).count()) > 0) {
      const dates = await page
        .locator(`${COMING_UP} time[datetime]`)
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("datetime") ?? ""),
        );
      expect(dates.length).toBeGreaterThan(0);
      expect(dates.length).toBeLessThanOrEqual(3);
      expect(dates).toStrictEqual(dates.toSorted());
    }

    // Each product section ends in its list, followed only by its See all (item 4).
    for (const section of [SELECTION, OCCASIONS]) {
      const tails = await page.locator(section).evaluate((node) =>
        [...node.querySelectorAll("ul")]
          .filter((list) => list.querySelector("article") !== null)
          .map((list) => {
            const after: boolean[] = [];
            for (
              let next = list.nextElementSibling;
              next !== null;
              next = next.nextElementSibling
            )
              after.push(
                next.children.length === 1 &&
                  next.querySelector(":scope > a[data-fo-see-all]") !== null,
              );
            return after;
          }),
      );
      expect(tails.length, section).toBeGreaterThan(0);
      for (const tail of tails) expect(tail.every(Boolean), section).toBe(true);
    }
  });
});

test.describe("T-103: the occasion tabs, JavaScript off (AC-97)", () => {
  test.use({ javaScriptEnabled: false });

  test("click and arrow keys show only the chosen panel, with no request", async ({
    page,
  }) => {
    await page.goto("/en");
    const panels = page.locator(`${OCCASIONS} [data-fo-occasion-panel]`);
    const count = await panels.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const shown = async (): Promise<number[]> =>
      panels.evaluateAll((nodes) =>
        nodes
          .map((node, index) =>
            getComputedStyle(node).display === "none" ? -1 : index,
          )
          .filter((index) => index >= 0),
      );
    expect(await shown()).toStrictEqual([0]);
    await expect(
      page.locator(`${OCCASIONS} [data-fo-occasion-tab="0"]`),
    ).toBeChecked();

    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    // A click on the second tab's label.
    await page
      .locator(`${OCCASIONS} label`)
      .filter({ has: page.locator('[data-fo-occasion-tab="1"]') })
      .click();
    expect(await shown()).toStrictEqual([1]);
    // The arrow key on the focused group moves to the next tab.
    await page.locator(`${OCCASIONS} [data-fo-occasion-tab="1"]`).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.locator(`${OCCASIONS} [data-fo-occasion-tab="2"]`),
    ).toBeChecked();
    expect(await shown()).toStrictEqual([2]);
    // Lazy photographs of the panel just shown may load; no document, no script, no data.
    expect(
      requests.filter((url) => !/\.(?:webp|avif|jpe?g|png)(?:\?|$)/u.test(url)),
    ).toStrictEqual([]);
  });

  test("the names, and no script in the section", async ({ page }) => {
    await page.goto("/en");
    const group = page.getByRole("radiogroup", {
      name: "What is the occasion?",
    });
    await expect(group).toHaveCount(1);
    await expect(group.getByRole("radio", { name: "Birthday" })).toBeChecked();
    await expect(page.getByRole("group", { name: "Birthday" })).toHaveCount(1);
    await expect(page.locator(`${OCCASIONS} script`)).toHaveCount(0);
  });
});

test.describe("T-113: the example label and each section's ItemList (AC-107)", () => {
  test("/en: one label per section grid, per-card labels hidden, ItemLists equal to the cards", async ({
    page,
  }) => {
    await page.goto("/en");
    for (const section of [SELECTION, OCCASIONS]) {
      await expect(
        page.locator(`${section} [data-fo-grid-label]`),
        section,
      ).toHaveCount(1);
      await expect(page.locator(`${section} [data-fo-grid-label]`)).toHaveText(
        "Example arrangement · our florist hand-makes each one",
      );
    }
    // The per-card labels are in the HTML and not shown.
    const cardLabels = page.locator(
      `${SELECTION} [data-fo-card-provenance="hidden"]`,
    );
    expect(await cardLabels.count()).toBeGreaterThan(0);
    for (const label of await cardLabels.all())
      await expect(label).toBeHidden();

    const lists = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => JSON.parse(node.textContent ?? "null") as unknown)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .flatMap((value) =>
            typeof value === "object" &&
            value !== null &&
            Array.isArray((value as { "@graph"?: unknown[] })["@graph"])
              ? (value as { "@graph": unknown[] })["@graph"]
              : [value],
          )
          .filter(
            (
              value,
            ): value is {
              "@type": string;
              itemListElement: { name: string; url: string }[];
            } =>
              typeof value === "object" &&
              value !== null &&
              (value as { "@type"?: string })["@type"] === "ItemList",
          ),
      );
    expect(lists.length).toBeGreaterThanOrEqual(2);
    const selection = await page
      .locator(`${SELECTION} article`)
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          name: node.querySelector("h3")?.textContent ?? "",
          path: node.querySelector("a[href]")?.getAttribute("href") ?? "",
        })),
      );
    const first = lists[0];
    expect(first?.itemListElement.map((item) => item.name)).toStrictEqual(
      selection.map((card) => card.name),
    );
    expect(
      first?.itemListElement.map((item) => new URL(item.url).pathname),
    ).toStrictEqual(selection.map((card) => card.path));
    for (const list of lists) {
      expect(JSON.stringify(list)).not.toMatch(/price|Offer/u);
    }
  });
});
