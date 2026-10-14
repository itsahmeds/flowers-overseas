/**
 * The product gallery is contained at every tablet and desktop width (TASK-227; spec 004 §14 A24
 * clauses 4 and 5, AC-46's product half; the founder's report of 2026-10-14).
 *
 * The founder saw `/en-gb/poland/product/amber-hour-chocolates` at about 1,360 px with the photo
 * strip laid out as the phone's flex row: no thumbnail column, the hero across columns 1–7, and
 * the next photograph painted beside it and under the buy column. T-51 (`product-v3.spec.ts`)
 * did not see it: it measures three widths and only asks that the hero end left of the buy
 * column, which the broken hero also did.
 *
 * The fault did not reproduce on main (Chromium, Chrome 155, WebKit 26.6, a production build); the
 * picture is matched exactly by forcing the strip to `display: flex` at a desktop width. From
 * `md` to `lg` the strip is TASK-197's scroller (the orchestrator's ruling of 2026-10-14).
 *
 * This scan walks 768–1600 px in 32 px steps, plus 1330 and 1366, and at each width asks of the
 * served page:
 *
 *  1. **Nothing of the gallery is painted under the buy column.** Each photograph's *visible* box
 *     (its box cut by every ancestor that clips) must not intersect the buy section's box.
 *  2. **The strip stays in its column.** Every visible photograph lies inside the gallery's grid
 *     area (`[data-fo-pdp-gallery]`), horizontally, to the pixel.
 *  3. **From `lg` the desktop layout holds** (the artboard `product-desktop`): the strip is a grid,
 *     every photograph is fully visible, the other photographs stand on column 1 at the gallery's
 *     start edge, and the hero starts after them and ends inside the gallery's area.
 *
 * And once: the page nominates exactly one `fetchpriority="high"` image (the hero, AC-25).
 * Watched red (TASK-227 `## Result`): the strip forced to a flex row at desktop widths (the
 * founder's picture: case 1 red without the fix's clip, case 3 red with it), and the tablet
 * scroller's clip removed (case 2 red at 768).
 */
import { type Page, expect, test } from "@playwright/test";

const PDP = "/en-gb/poland/product/amber-hour-chocolates";
const HEIGHT = 860;
/** Tailwind's `lg`: 64rem at the browser's 16 px. */
const LG = 1024;

const WIDTHS: readonly number[] = [
  ...Array.from(
    { length: (1600 - 768) / 32 + 1 },
    (_, index) => 768 + index * 32,
  ),
  1330,
  1366,
];

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Measure {
  readonly display: string;
  readonly buy: Rect;
  readonly column: Rect;
  readonly images: readonly {
    readonly kind: string;
    readonly box: Rect;
    readonly visible: Rect | null;
  }[];
}

/** One width's boxes, measured in the page: every box in document coordinates. */
async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const doc = (rect: DOMRect) => ({
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      right: rect.right + window.scrollX,
      bottom: rect.bottom + window.scrollY,
    });
    const one = (selector: string): Element => {
      const node = document.querySelector(selector);
      if (node === null) throw new Error(`no ${selector}`);
      return node;
    };
    // The part of a box that can paint: cut by every ancestor whose overflow is not `visible`.
    const visibleOf = (node: Element) => {
      let box = doc(node.getBoundingClientRect());
      for (
        let parent = node.parentElement;
        parent !== null && parent !== document.body;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        const clip = doc(parent.getBoundingClientRect());
        if (style.overflowX !== "visible") {
          box = {
            ...box,
            left: Math.max(box.left, clip.left),
            right: Math.min(box.right, clip.right),
          };
        }
        if (style.overflowY !== "visible") {
          box = {
            ...box,
            top: Math.max(box.top, clip.top),
            bottom: Math.min(box.bottom, clip.bottom),
          };
        }
      }
      return box.right - box.left < 1 || box.bottom - box.top < 1 ? null : box;
    };
    const strip = one('[data-fo-gallery="photos"] [data-fo-scroller]');
    return {
      display: getComputedStyle(strip).display,
      buy: doc(one("[data-fo-pdp-buy]").getBoundingClientRect()),
      column: doc(one("[data-fo-pdp-gallery]").getBoundingClientRect()),
      images: [...document.querySelectorAll("[data-fo-gallery-image]")].map(
        (node) => ({
          kind: node.getAttribute("data-fo-gallery-image") ?? "",
          box: doc(node.getBoundingClientRect()),
          visible: visibleOf(node),
        }),
      ),
    };
  });
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

test("the gallery is contained at every width from 768 to 1600 (step 32, 1330 and 1366)", async ({
  page,
}) => {
  const response = await page.goto(PDP);
  expect(response?.status(), PDP).toBe(200);
  await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(1);
  await expect(
    page.locator('[data-fo-gallery-image="hero"] img[fetchpriority="high"]'),
  ).toHaveCount(1);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    const at = `at ${String(width)} × ${String(HEIGHT)}`;
    const m = await measure(page);
    expect(m.images.length, `${at}: photographs`).toBeGreaterThan(1);

    for (const image of m.images) {
      const label = `${at}: the ${image.kind} photograph ${JSON.stringify(image)}`;
      // 1. Nothing painted under the buy column.
      if (image.visible !== null) {
        expect(
          intersects(image.visible, m.buy),
          `${label} is painted under the buy column ${JSON.stringify(m.buy)}`,
        ).toBe(false);
        // 2. Inside the gallery's own area.
        expect(
          image.visible.left >= m.column.left - 0.5 &&
            image.visible.right <= m.column.right + 0.5,
          `${label} leaves its column ${JSON.stringify(m.column)}`,
        ).toBe(true);
      }
    }

    // 3. From `lg`, the desktop layout: thumbnails on column 1, the hero after them.
    if (width >= LG) {
      expect(m.display, `${at}: the strip is a grid`).toBe("grid");
      const hero = m.images.find((image) => image.kind === "hero");
      const more = m.images.filter((image) => image.kind !== "hero");
      if (hero === undefined) throw new Error(`${at}: no hero`);
      for (const image of m.images) {
        expect(
          image.visible,
          `${at}: the ${image.kind} photograph is fully shown`,
        ).toEqual(image.box);
      }
      for (const thumb of more) {
        expect(
          Math.abs(thumb.box.left - m.column.left),
          `${at}: a thumbnail on column 1 ${JSON.stringify(thumb.box)}`,
        ).toBeLessThanOrEqual(1);
        expect(
          thumb.box.right,
          `${at}: the hero starts after the thumbnails`,
        ).toBeLessThan(hero.box.left);
      }
      expect(
        hero.box.right,
        `${at}: the hero ends inside its area`,
      ).toBeLessThanOrEqual(m.column.right + 0.5);
      expect(
        hero.box.right,
        `${at}: the hero ends before the buy column`,
      ).toBeLessThan(m.buy.left);
    }
  }
});
