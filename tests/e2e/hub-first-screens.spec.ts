/**
 * The hubs' first screens in the browser (spec 004 §14 A23 R2–R6, clause 5; A24 clauses 2 (c), 4
 * and 5; AC-35 as amended, AC-36 as amended, AC-45 for the four hubs; T-37, T-38, T-50; QA
 * 2026-10-18 Q18-03; TASK-188).
 *
 * The unit half (`tests/unit/hub-first-screens.test.tsx`, `catalog-hub-pages.test.tsx`) reads the
 * server HTML; this file reads geometry and the network: what lies inside the first viewport, the
 * gaps in it, which image is the priority image at each width as the browser loads it, and that
 * the lead figure's photograph is never requested on a phone.
 */
import { type Page, expect, test } from "@playwright/test";

const BIRTHDAY = "/en-gb/occasions/birthday";
const SYMPATHY = "/en-gb/occasions/sympathy";
const MOTHERS_DAY = "/en-gb/occasions/mothers-day";
const ROSES = "/en-gb/flowers/roses";
const INDEX = "/en-gb/occasions";
const DESTINATIONS = "/en-gb/send-flowers-to";
const HUBS = [BIRTHDAY, SYMPATHY, MOTHERS_DAY, ROSES] as const;
const ALL = [...HUBS, INDEX, DESTINATIONS] as const;

const DESKTOP = { width: 1440, height: 900 } as const;
const LAPTOP = { width: 1280, height: 800 } as const;
const PHONE = { width: 390, height: 844 } as const;
type Size = { readonly width: number; readonly height: number };

const NO_MONEY = "We show no price on this page";
const GUIDE_STATE = "Ordering opens soon";

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

async function open(page: Page, url: string, size: Size): Promise<void> {
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

/** Every **displayed** element matching `selector`, as viewport boxes, in document order. */
async function boxesOf(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate((query) => {
    const boxes: Box[] = [];
    for (const element of Array.from(document.querySelectorAll(query))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      boxes.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      });
    }
    return boxes;
  }, selector);
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = (await boxesOf(page, selector))[0];
  if (box === undefined)
    throw new Error(`nothing displayed matches ${selector}`);
  return box;
}

function inside(box: Box, size: Size): boolean {
  return (
    box.top >= -0.5 &&
    box.bottom <= size.height + 0.5 &&
    box.left >= -0.5 &&
    box.right <= size.width + 0.5
  );
}

/** The displayed element in `<main>` whose own text contains `text`. */
async function textBox(page: Page, text: string): Promise<Box> {
  const box = await page.evaluate((needle) => {
    const main = document.querySelector("main");
    if (main === null) return null;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      if (!(node.textContent ?? "").includes(needle)) continue;
      const parent = node.parentElement;
      if (parent === null) continue;
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      };
    }
    return null;
  }, text);
  if (box === null) throw new Error(`no displayed text "${text}" in main`);
  return box;
}

/** The first row of the grid: every displayed card sharing the first card's top. */
async function gridFirstRow(page: Page): Promise<Box[]> {
  const cards = await boxesOf(page, "main [data-fo-listing-grid] > li article");
  const top = cards[0]?.top ?? 0;
  return cards.filter((card) => Math.abs(card.top - top) < 1);
}

test.describe("AC-35 (T-37): the hub first screens", () => {
  for (const url of HUBS) {
    for (const size of [DESKTOP, PHONE]) {
      test(`${url} at ${String(size.width)}: the H1 first, the no-money sentence and a way to a price in view`, async ({
        page,
      }) => {
        await open(page, url, size);
        // The H1 is the first heading of <main>, and it precedes every destination link.
        const order = await page.evaluate(() => {
          const main = document.querySelector("main");
          const h1 = main?.querySelector("h1");
          const link = main?.querySelector(
            "a[data-fo-hub-destination], a[data-fo-hub-chip], a[data-fo-hub-first-date]",
          );
          if (
            h1 === null ||
            h1 === undefined ||
            link === null ||
            link === undefined
          ) {
            return null;
          }
          return {
            firstHeading: main?.querySelector("h1, h2, h3")?.tagName,
            h1BeforeLink: Boolean(
              h1.compareDocumentPosition(link) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          };
        });
        expect(order?.firstHeading).toBe("H1");
        expect(order?.h1BeforeLink).toBe(true);
        expect(inside(await boxOf(page, "main h1"), size)).toBe(true);
        expect(
          inside(await textBox(page, NO_MONEY), size),
          "no-money sentence",
        ).toBe(true);
        const way = await boxOf(
          page,
          "main a[data-fo-hub-destination], main a[data-fo-hub-chip], main a[data-fo-hub-first-date], main [data-fo-phone-date-cards] a",
        );
        expect(inside(way, size), "the first destination link").toBe(true);

        if (size.width >= 768) {
          // From `md` up: R2's lead figure, whole, inside the first viewport.
          const lead = await boxOf(page, "main figure[data-fo-hub-lead] img");
          expect(inside(lead, size), "the lead figure").toBe(true);
        } else {
          // A24 clause 2 (c): no lead figure below `md`, and the grid's first row in view.
          expect(await boxesOf(page, "main figure[data-fo-hub-lead]")).toEqual(
            [],
          );
          const row = await gridFirstRow(page);
          expect(row.length).toBeGreaterThanOrEqual(2);
          for (const card of row)
            expect(inside(card, size), "first-row card").toBe(true);
        }
      });
    }
  }

  test("Mother's Day: the first-screen dates repeat the table, in its order and its words", async ({
    page,
  }) => {
    await open(page, MOTHERS_DAY, DESKTOP);
    const first = await page.$$eval("main [data-fo-hub-first-date]", (cards) =>
      cards.map((card) => card.getAttribute("data-fo-hub-first-date")),
    );
    const table = await page.$$eval("main tr[data-fo-hub-date]", (rows) =>
      rows.map((row) => row.getAttribute("data-fo-hub-date")),
    );
    expect(first).toHaveLength(7);
    expect(first).toEqual(table);
    for (const box of await boxesOf(page, "main [data-fo-hub-first-date]")) {
      expect(inside(box, DESKTOP), "a first-screen date card").toBe(true);
    }
  });

  test("roses: every R4 destination link in the first viewport", async ({
    page,
  }) => {
    await open(page, ROSES, DESKTOP);
    const pills = await boxesOf(page, "main a[data-fo-hub-destination]");
    expect(pills).toHaveLength(7);
    for (const pill of pills)
      expect(inside(pill, DESKTOP), "a destination").toBe(true);
  });

  for (const size of [DESKTOP, PHONE]) {
    test(`the occasions index at ${String(size.width)}: R5's next six, in date order, in view`, async ({
      page,
    }) => {
      await open(page, INDEX, size);
      const CARDS =
        "main a[data-fo-next-occasion], main [data-fo-phone-date-cards] a";
      const dates = await page.$$eval(CARDS, (cards) =>
        cards
          .filter((card) => card.getBoundingClientRect().width > 0)
          .map((card) => card.getAttribute("data-fo-card-date") ?? ""),
      );
      expect(dates.length).toBeGreaterThan(0);
      expect(dates.length).toBeLessThanOrEqual(6);
      expect(dates).toEqual([...dates].sort());
      expect(inside(await boxOf(page, CARDS), size)).toBe(true);
    });

    test(`the destinations hub at ${String(size.width)}: the guide state in view as real text`, async ({
      page,
    }) => {
      await open(page, DESTINATIONS, size);
      expect(inside(await textBox(page, GUIDE_STATE), size)).toBe(true);
    });
  }
});

test.describe("AC-36 (T-38): one priority image per width, and none on the index or the destinations hub", () => {
  for (const url of ALL) {
    for (const size of [DESKTOP, PHONE]) {
      test(`${url} at ${String(size.width)}`, async ({ page }) => {
        await open(page, url, size);
        const facts = await page.evaluate(() => {
          const displayed = Array.from(
            document.querySelectorAll<HTMLImageElement>(
              "img[fetchpriority='high']",
            ),
          ).filter((img) => img.getBoundingClientRect().width > 0);
          const preloads = Array.from(
            document.querySelectorAll<HTMLLinkElement>(
              "link[rel='preload'][as='image']",
            ),
          ).filter(
            (link) =>
              link.media === "" || window.matchMedia(link.media).matches,
          );
          const sourceOf = (img: HTMLImageElement): string => {
            const source = Array.from(
              img.closest("picture")?.querySelectorAll("source") ?? [],
            ).find((candidate) => !candidate.srcset.startsWith("data:"));
            return source?.srcset ?? img.srcset;
          };
          return {
            high: displayed.map((img) => ({
              lead: img.closest("[data-fo-hub-lead]") !== null,
              srcset: sourceOf(img),
            })),
            preloads: preloads.map(
              (link) => link.getAttribute("imagesrcset") ?? "",
            ),
            carousel: document.querySelectorAll(
              "[aria-roledescription='carousel']",
            ).length,
          };
        });
        expect(facts.carousel).toBe(0);
        if (url === INDEX || url === DESTINATIONS) {
          expect(facts.high).toEqual([]);
          expect(facts.preloads).toEqual([]);
          return;
        }
        expect(facts.high).toHaveLength(1);
        expect(facts.preloads).toEqual([facts.high[0]?.srcset]);
        // The lead figure's from `md` up; the first grid card's below `md`.
        expect(facts.high[0]?.lead).toBe(size.width >= 768);
      });
    }
  }

  test("the lead figure's photograph is never requested on a phone (A24 clause 5)", async ({
    page,
  }) => {
    await open(page, BIRTHDAY, PHONE);
    await page.waitForLoadState("networkidle");
    const facts = await page.evaluate(() => {
      const figure = document.querySelector("main figure[data-fo-hub-lead]");
      const img = figure?.querySelector("img");
      const asset =
        figure
          ?.querySelector("[data-fo-media-asset]")
          ?.getAttribute("data-fo-media-asset") ?? "";
      return {
        asset,
        currentSrc: img?.currentSrc ?? "",
        // The figure's own fetch: by its `<img>` (the picture's source) or by its preload. The
        // same product's grid card, if it is on the page, fetches as a lazy grid image and is
        // not the figure.
        preloaded: performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              entry.name.includes(`/${asset}/`) &&
              (entry as PerformanceResourceTiming).initiatorType === "link",
          ).length,
      };
    });
    expect(facts.asset).not.toBe("");
    expect(facts.currentSrc.startsWith("data:"), facts.currentSrc).toBe(true);
    expect(facts.preloaded).toBe(0);
  });
});

test.describe("AC-45 (T-50): the hubs are calm, not bland", () => {
  for (const url of ALL) {
    for (const size of [DESKTOP, LAPTOP, PHONE]) {
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
          const ornaments: string[] = [];
          for (const element of Array.from(main.querySelectorAll("*"))) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.bottom <= top || rect.top >= bottom) continue;
            const style = getComputedStyle(element);
            if (style.transform !== "none") {
              const matrix = new DOMMatrixReadOnly(style.transform);
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
              ornaments.push(`aria-hidden ${element.tagName}`);
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

test.describe("Q18-03: a category hub's destination text never becomes a narrow column", () => {
  for (const url of [
    ROSES,
    "/en/flowers/hand-tied-bouquets",
    "/en/flowers/plants",
  ]) {
    for (const width of [768, 1024]) {
      test(`${url} at ${String(width)}`, async ({ page }) => {
        await open(page, url, { width, height: 900 });
        // Each destination's text block is at least 12 characters wide at its own font size.
        const narrow = await page.evaluate(() => {
          const found: string[] = [];
          for (const pill of Array.from(
            document.querySelectorAll<HTMLElement>(
              "main [data-fo-hub-destination]",
            ),
          )) {
            for (const span of Array.from(
              pill.querySelectorAll<HTMLElement>("span"),
            )) {
              const rect = span.getBoundingClientRect();
              if (rect.width === 0) continue;
              const fontSize = parseFloat(getComputedStyle(span).fontSize);
              const text = (span.textContent ?? "").trim();
              // A short name ("Italy") is narrow because it is short; a column is text that wraps.
              const lines = Math.round(rect.height / (fontSize * 1.2));
              if (lines > 1 && rect.width < fontSize * 0.5 * 12) {
                found.push(`${text} ${String(rect.width)}px`);
              }
            }
          }
          return found;
        });
        expect(narrow).toEqual([]);
      });
    }
  }
});
