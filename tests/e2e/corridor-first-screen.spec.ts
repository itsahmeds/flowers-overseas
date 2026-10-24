/**
 * The guide's first screen, its Rule column and its v2 shapes in the browser (spec 007 §14 A11,
 * A12; AC-30, AC-31, AC-32; T-31, T-32, T-33 e2e halves; spec 004 §14 A24, AC-45 for the guide,
 * T-50; TASK-189).
 *
 * The unit half (`tests/unit/corridor-first-screen.test.tsx`) reads the server HTML; this file
 * reads what only a browser knows: which boxes lie inside the first viewport, the computed font of
 * every calendar cell, the shop pill's computed radius and width, and the empty bands of the first
 * screen. Nothing here names a country in code beyond the URLs the AC names: every expected text
 * is read off the page itself (the table's rows, the state line), so the assertions hold for any
 * destination the data publishes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Page, expect, test } from "@playwright/test";

/** The value at a dotted key of a locale's catalogue, or `undefined`. */
function message(locale: string, key: string): string | undefined {
  let value: unknown = JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", `${locale}.json`), "utf8"),
  ) as unknown;
  for (const segment of key.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === "string" ? value : undefined;
}

/**
 * The guide state's text, read from the catalogue rather than written here: TASK-239 rewords the
 * key, and this file pins the key's rendering, not its wording (the brief's carry-forward).
 */
function guideState(url: string): string {
  const locale = url.split("/")[1] ?? "en";
  const key = "destinations.state.guideNotDelivering";
  const value = message(locale, key) ?? message("en", key);
  if (value === undefined) throw new Error(`no ${key}`);
  return value;
}

type Size = { readonly width: number; readonly height: number };

const DESKTOP = { width: 1440, height: 900 } as const;
const LAPTOP = { width: 1280, height: 800 } as const;
const PHONE = { width: 390, height: 844 } as const;

/** AC-31's two URLs. */
const AC31_URLS = [
  "/en-gb/send-flowers-to/poland",
  "/en/send-flowers-to/germany",
] as const;

/** Every guide in the two English locales (the corpus has no `de`/`pl` guide yet). */
const GUIDE_SLUGS = [
  "poland",
  "germany",
  "france",
  "spain",
  "italy",
  "romania",
  "netherlands",
] as const;
const GUIDES = (["en", "en-gb"] as const).flatMap((locale) =>
  GUIDE_SLUGS.map((slug) => `/${locale}/send-flowers-to/${slug}`),
);

const IDENTIFIERS = [
  "fixed",
  "easter_offset",
  "nth_weekday",
  "last_weekday",
  "lent_sunday",
  "orthodox_easter_offset",
  "none",
] as const;

/** Spec 007 §14 A11 (a): the approved English per rule kind, keyed by what the cell may say. */
const RULE_WORDS = new Set([
  "Same date every year",
  "Moves with Easter",
  "A set weekday of the month",
  "",
]);

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
  readonly width: number;
}

function inside(box: Box, size: Size): boolean {
  return (
    box.top >= -0.5 &&
    box.bottom <= size.height + 0.5 &&
    box.left >= -0.5 &&
    box.right <= size.width + 0.5
  );
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const r = element.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
      };
    });
}

test.describe("T-31 (e2e): no rule identifier and no code font in any calendar (AC-30)", () => {
  for (const url of GUIDES) {
    test(url, async ({ page }) => {
      await open(page, url, DESKTOP);
      const facts = await page.evaluate(() => {
        const probe = document.createElement("code");
        document.body.append(probe);
        const mono = getComputedStyle(probe).fontFamily;
        probe.remove();
        const section = document.querySelector("[data-fo-corridor-calendar]");
        if (section === null) throw new Error("no calendar");
        const cells = Array.from(section.querySelectorAll("th, td, caption"));
        const fonts = new Set<string>();
        for (const cell of cells) {
          fonts.add(getComputedStyle(cell).fontFamily);
          for (const child of Array.from(cell.querySelectorAll("*"))) {
            fonts.add(getComputedStyle(child).fontFamily);
          }
        }
        const rules = Array.from(
          section.querySelectorAll("tbody tr > td:last-child"),
        ).map((cell) => (cell.textContent ?? "").trim());
        return { mono, fonts: [...fonts], rules };
      });
      expect(facts.rules.length).toBeGreaterThan(0);
      for (const rule of facts.rules) {
        expect(RULE_WORDS.has(rule), `Rule cell ${JSON.stringify(rule)}`).toBe(
          true,
        );
        for (const identifier of IDENTIFIERS) {
          expect(rule).not.toContain(identifier);
        }
      }
      for (const font of facts.fonts) {
        expect(font, "a calendar cell's font").not.toBe(facts.mono);
        expect(font).not.toMatch(/mono/iu);
      }
    });
  }
});

test.describe("T-32 (e2e): the first viewport holds the h1, the state and the table's first three dates (AC-31)", () => {
  for (const url of AC31_URLS) {
    for (const size of [DESKTOP, PHONE]) {
      test(`${url} at ${String(size.width)} × ${String(size.height)}`, async ({
        page,
      }) => {
        await open(page, url, size);

        const h1 = await boxOf(page, "main h1");
        expect(inside(h1, size), `h1 ${JSON.stringify(h1)}`).toBe(true);

        const state = page.locator("main [data-fo-corridor-state-line]");
        await expect(state).toHaveCount(1);
        // The state's text is `destinations.state.guideNotDelivering`, the page's own state.
        await expect(state).toHaveText(guideState(url));
        expect(
          inside(await boxOf(page, "main [data-fo-corridor-state-line]"), size),
        ).toBe(true);

        const rows = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              "[data-fo-corridor-calendar] tbody tr[data-fo-calendar-date]",
            ),
          )
            .slice(0, 3)
            .map((row) => ({
              date: row.getAttribute("data-fo-calendar-date") ?? "",
              name: (row.querySelector("th")?.textContent ?? "").trim(),
              text: (row.querySelector("td")?.textContent ?? "").trim(),
            })),
        );
        const cards = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll("main [data-fo-first-date]"),
          ).map((card) => {
            const r = card.getBoundingClientRect();
            const faces = Array.from(
              card.querySelectorAll("[data-fo-date-face]"),
            ).map((face) => (face as HTMLElement).innerText.trim());
            return {
              date: card.getAttribute("data-fo-first-date") ?? "",
              text: (card.textContent ?? "").trim(),
              faces,
              box: {
                top: r.top,
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                width: r.width,
              },
            };
          }),
        );
        expect(rows).toHaveLength(3);
        expect(cards.map((card) => card.date)).toStrictEqual(
          rows.map((row) => row.date),
        );
        cards.forEach((card, index) => {
          const row = rows[index];
          expect(inside(card.box, size), `card ${card.date}`).toBe(true);
          expect(card.text).toContain(row?.name ?? "!");
          // The day and the month on the card are parts of the date the table's row prints.
          for (const face of card.faces) {
            for (const part of face.split(" · ")) {
              expect(row?.text.toLowerCase()).toContain(part.toLowerCase());
            }
          }
        });

        // The h1 first in DOM order, then the state line, then the dates.
        const order = await page.evaluate(() => {
          const h1 = document.querySelector("main h1");
          const line = document.querySelector(
            "main [data-fo-corridor-state-line]",
          );
          const first = document.querySelector("main [data-fo-first-date]");
          if (h1 === null || line === null || first === null) return false;
          const before = (a: Node, b: Node): boolean =>
            (a.compareDocumentPosition(b) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
            0;
          const headings = Array.from(
            document.querySelectorAll("main h1, main h2, main h3"),
          );
          return before(h1, line) && before(line, first) && headings[0] === h1;
        });
        expect(order).toBe(true);

        // No photo slot and no image in the first viewport; no image preload at all.
        const images = await page.evaluate((height) => {
          return Array.from(
            document.querySelectorAll("main img, main picture, main .photo"),
          ).filter((element) => {
            const r = element.getBoundingClientRect();
            return r.height > 0 && r.top < height;
          }).length;
        }, size.height);
        expect(images).toBe(0);
        await expect(page.locator("main")).not.toContainText("Photo slot");
        await expect(
          page.locator('link[rel="preload"][as="image"]'),
        ).toHaveCount(0);
      });
    }
  }
});

test.describe("T-33 (e2e): the route and the pill (AC-32)", () => {
  test("the steps are an ordered route with no hairline square box and no 01 label", async ({
    page,
  }) => {
    await open(page, "/en-gb/send-flowers-to/poland", DESKTOP);
    const steps = page.locator("[data-fo-corridor-steps]");
    await expect(steps.locator("ol > li")).toHaveCount(3);
    await expect(steps).not.toContainText(/\b0[1-3]\b/u);
    const boxed = await steps.evaluate((section) =>
      Array.from(section.querySelectorAll("ol, ol *"))
        .filter((element) => {
          const style = getComputedStyle(element);
          const sides = [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ].map((width) => parseFloat(width));
          const radius = parseFloat(style.borderTopLeftRadius);
          return sides.every((width) => width > 0) && radius < 1;
        })
        .map((element) => element.outerHTML.slice(0, 120)),
    );
    expect(boxed).toStrictEqual([]);
  });

  test("the shop link is a pill narrower than half the content column at 1440", async ({
    page,
  }) => {
    await open(page, "/en-gb/send-flowers-to/poland", DESKTOP);
    const facts = await page.evaluate(() => {
      const link = document.querySelector("main [data-fo-corridor-shop] a");
      const main = document.querySelector("main");
      if (link === null || main === null) throw new Error("no shop link");
      const probe = document.createElement("div");
      probe.style.borderRadius = "var(--radius-full)";
      document.body.append(probe);
      const pill = getComputedStyle(probe).borderTopLeftRadius;
      probe.remove();
      const style = getComputedStyle(main);
      const column =
        main.clientWidth -
        parseFloat(style.paddingInlineStart) -
        parseFloat(style.paddingInlineEnd);
      return {
        radius: getComputedStyle(link).borderTopLeftRadius,
        pill,
        width: link.getBoundingClientRect().width,
        column,
      };
    });
    expect(facts.radius).toBe(facts.pill);
    expect(facts.width).toBeLessThan(facts.column / 2);
  });
});

test.describe("T-50 (AC-45): the guide is calm, not bland", () => {
  for (const url of AC31_URLS) {
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
