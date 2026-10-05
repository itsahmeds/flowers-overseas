/**
 * The frame, the breadcrumb, the laptop band and the phone (spec 004 §14 A23 clauses 2, 3 and 9,
 * A24 clauses 4 (e), 4 (f), 5 and 8; TASK-186):
 *
 *  - **T-33 / AC-31.** On the eleven page types at 1440, 1024, 768 and 390 px, the inline-start
 *    edge of the first block in `<main>` equals the header logo's within 0.5 px (x 56 at 1440, x 20
 *    at 390), skipping full-bleed media (A24 clause 4 (f)); at 1440 a listing's column is 1,328 px.
 *  - **T-34 / AC-32.** On every page type with a breadcrumb, at 1440 × 900, 1024 and 768, the
 *    trail's top edge is 20 ± 1 px under the sticky header's bottom edge. The 390 case is T-55's
 *    (TASK-195), because below `md` a back link replaces the trail.
 *  - **T-43 / AC-41.** At 1280 × 800 and 1512 × 945 on AC-41's nine URLs: the H1 and the page's
 *    primary action lie inside the viewport, the H1's computed `font-size` equals clause 9's value
 *    for its step within 0.5 px, and no lead photograph is taller than `--hero-photo-max` resolved
 *    (`/en-gb` exempt, A24 clause 5).
 *  - **T-45 / AC-43.** At 390 × 844 on the same nine: no horizontal overflow, no visible text
 *    under 13 px, every `<a>`/`<button>` in `<main>` at least 24 × 24 and each primary action at
 *    least 44 px tall, each fluid step at its unchanged minimum, the H1 in the first viewport.
 *
 * The expected values are **restated** from clause 9's formulas, never read from the stylesheet: a
 * test that resolves `var(--text-hero-fluid)` to learn what `--text-hero-fluid` should be agrees
 * with any value by construction. The geometry runs once, in `e2e-desktop`: each case sets its own
 * viewport, so the Pixel 7 project would measure the same boxes a second time.
 */
import { expect, type Page, test } from "@playwright/test";

/** The eleven page types of AC-31 (the home, the seven listings, the guide, a product, the 404). */
const PAGE_TYPES = {
  home: "/en-gb",
  countryShop: "/en-gb/poland/flowers",
  countryCategory: "/en-gb/poland/flowers/roses",
  countryOccasion: "/en-gb/poland/occasions/mothers-day",
  occasionHub: "/en-gb/occasions/birthday",
  categoryHub: "/en-gb/flowers/roses",
  occasionsIndex: "/en-gb/occasions",
  destinationsHub: "/en-gb/send-flowers-to",
  guide: "/en-gb/send-flowers-to/poland",
  product: "/en-gb/poland/product/anthurium",
  notFound: "/en-gb/does-not-exist",
} as const;
type PageType = keyof typeof PAGE_TYPES;

const LISTINGS: readonly PageType[] = [
  "countryShop",
  "countryCategory",
  "countryOccasion",
  "occasionHub",
  "categoryHub",
  "occasionsIndex",
  "destinationsHub",
];

/** Page types that render a breadcrumb trail (AC-32). */
const WITH_BREADCRUMB: readonly PageType[] = [...LISTINGS, "guide", "product"];

/** AC-41's nine URLs, in its order. */
const LAPTOP_SET: readonly PageType[] = [
  "home",
  "countryShop",
  "countryCategory",
  "countryOccasion",
  "occasionHub",
  "categoryHub",
  "occasionsIndex",
  "destinationsHub",
  "guide",
];

/**
 * Clause 9's fluid steps as functions of the viewport, restated from the spec's table. A step is
 * `clamp(min, min(a·vw, b·vh), max)`; `--text-2xl-fluid` has no height term (`b` = ∞).
 */
const STEPS = {
  hero: { min: 50, vw: 5.2, vh: 8.6, max: 76 },
  display: { min: 42, vw: 5, vh: 8, max: 70 },
  title: { min: 44, vw: 4.2, vh: 6.8, max: 58 },
  "3xl": { min: 32, vw: 3.6, vh: 5.8, max: 46 },
  "2xl": { min: 30, vw: 3, vh: Number.POSITIVE_INFINITY, max: 38 },
  section: { min: 64, vw: 7, vh: 11, max: 104 },
} as const;
type Step = keyof typeof STEPS;

function resolveStep(step: Step, width: number, height: number): number {
  const { min, vw, vh, max } = STEPS[step];
  const preferred = Math.min((vw * width) / 100, (vh * height) / 100);
  return Math.min(Math.max(preferred, min), max);
}

/** `--hero-photo-max`: `min(520px, 60svh)`. No browser chrome in a headless window, so svh = vh. */
const heroPhotoMax = (height: number): number => Math.min(520, 0.6 * height);

/**
 * Which step each page's H1 is set in, and what its primary action is (clause 9 "What the first
 * screen shows"): the home's "Send flowers" (the sentence's submit today), the first price on a
 * country page, the way to a price on a hub, and on the guide its way into the shop.
 */
const FIRST_SCREEN: Readonly<
  Record<PageType, { readonly h1: Step; readonly action: string }>
> = {
  home: { h1: "hero", action: "main [data-fo-sentence] button[type='submit']" },
  countryShop: { h1: "display", action: "main [data-fo-price]" },
  countryCategory: { h1: "display", action: "main [data-fo-price]" },
  countryOccasion: { h1: "display", action: "main [data-fo-price]" },
  occasionHub: { h1: "display", action: "main [data-fo-hub-destination] a" },
  categoryHub: { h1: "display", action: "main [data-fo-hub-destination] a" },
  occasionsIndex: { h1: "display", action: "main a[data-fo-occasion]" },
  destinationsHub: {
    h1: "display",
    action: "main [data-fo-hub-destination] a",
  },
  guide: { h1: "display", action: "main [data-fo-corridor-shop] a" },
  product: { h1: "title", action: "main [data-fo-pdp-price]" },
  notFound: { h1: "title", action: "main a" },
};

/**
 * The primary-action checks that **cannot pass until a later task rebuilds that first screen**, each
 * with its owner. They are declared as expected failures (`test.fail`), not skipped: the case
 * still runs, and the day the owning task makes it pass, Playwright reports the unexpected pass and
 * that task must delete its row here. Recorded as an escalation in `docs/tasks/TASK-186.md`
 * ("AC-41's primary action on first screens TASK-186 does not own"); measured on the TASK-186 build:
 *
 *  - the country pages' first price is in the second card row, y 1,024 to 1,246 (TASK-187: "the
 *    first priced row in view", spec 008 §14 A15);
 *  - the `en-gb` birthday hub renders no way to a price in `<main>`, and the destinations hub's
 *    first destination ends at y 813 at 1280 × 800 (TASK-188's hub first screens); the occasions
 *    index's occasion links are 21 px inline links, and at 390 the category hub's destination link
 *    is 26 px tall where a primary action needs 44 (TASK-188's hub first screens);
 *  - the guide's way into the shop is at y 7,166 (TASK-189: the guide's first screen).
 */
type Check = "inView" | "target" | "primaryTarget";
const PENDING: Readonly<
  Partial<
    Record<
      PageType,
      Readonly<Partial<Record<Check | `inView@${number}`, string>>>
    >
  >
> = {
  countryShop: { inView: "TASK-187" },
  countryCategory: { inView: "TASK-187" },
  countryOccasion: { inView: "TASK-187" },
  occasionHub: { inView: "TASK-188", primaryTarget: "TASK-188" },
  categoryHub: { primaryTarget: "TASK-188" },
  destinationsHub: { "inView@1280": "TASK-188" },
  occasionsIndex: { target: "TASK-188", primaryTarget: "TASK-188" },
  guide: { inView: "TASK-189" },
};

function pendingOwner(
  type: PageType,
  check: Check,
  width?: number,
): string | undefined {
  const row = PENDING[type];
  if (row === undefined) return undefined;
  return (
    row[check] ??
    (width === undefined
      ? undefined
      : row[`${check}@${String(width)}` as `inView@${number}`])
  );
}

test.beforeEach(({}, testInfo) => {
  // One run of the geometry, not two: every case below sets its own viewport.
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

async function open(page: Page, type: PageType): Promise<void> {
  const response = await page.goto(PAGE_TYPES[type]);
  expect(response?.status(), PAGE_TYPES[type]).toBe(
    type === "notFound" ? 404 : 200,
  );
  await page.evaluate(() => document.fonts.ready);
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * AC-31's probe. The first rendered element in `<main>`, depth first, that is not full-bleed: an
 * element whose inline size equals the viewport's is media or a band, not "the first block" (A24
 * clause 4 (f)), so the walk descends into it. Out-of-flow and invisible elements are skipped.
 */
async function firstBlock(page: Page): Promise<Box & { tag: string }> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (main === null) throw new Error("no <main>");
    const viewport = document.documentElement.clientWidth;
    const walk = (parent: Element): Element | null => {
      for (const child of Array.from(parent.children)) {
        const style = getComputedStyle(child);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (style.position === "absolute" || style.position === "fixed")
          continue;
        const box = child.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.width >= viewport - 0.5) {
          const inner = walk(child);
          if (inner !== null) return inner;
          continue;
        }
        return child;
      }
      return null;
    };
    const block = walk(main);
    if (block === null) throw new Error("no block in <main>");
    const b = block.getBoundingClientRect();
    return {
      tag: `${block.tagName.toLowerCase()}${block.id === "" ? "" : `#${block.id}`}`,
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
    };
  });
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const locator = page.locator(selector).first();
  await expect(locator, selector).toBeAttached();
  return locator.evaluate((element) => {
    const b = element.getBoundingClientRect();
    return {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
    };
  });
}

/**
 * The header logo. The 404 letter has no site header: its lockup is `<main>`'s first link, so on
 * that page the logo *is* the first block and the frame is asserted through its x alone.
 */
const logoOf = (type: PageType): string =>
  type === "notFound" ? "main#main > a:first-child" : "[data-fo-header-logo]";

test.describe("T-33: the first block in <main> starts at the logo's edge (AC-31)", () => {
  for (const width of [1440, 1024, 768, 390] as const) {
    for (const type of Object.keys(PAGE_TYPES) as PageType[]) {
      test(`${PAGE_TYPES[type]} at ${String(width)} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, type);
        const logo = await boxOf(page, logoOf(type));
        const block = await firstBlock(page);
        const gutter = width >= 768 ? 56 : 20;
        expect(logo.left, "logo x").toBeCloseTo(
          width >= 1440 ? (width - 1328) / 2 : gutter,
          0,
        );
        expect(
          Math.abs(block.left - logo.left),
          `${block.tag} x ${String(block.left)} vs logo x ${String(logo.left)}`,
        ).toBeLessThanOrEqual(0.5);
        if (width === 1440 && LISTINGS.includes(type)) {
          expect(
            Math.abs(block.width - 1328),
            `${block.tag} is ${String(block.width)} px wide`,
          ).toBeLessThanOrEqual(0.5);
        }
      });
    }
  }
});

test.describe("T-34: the breadcrumb is 20 px under the sticky header (AC-32, md and up)", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 768, height: 1024 },
  ] as const) {
    for (const type of WITH_BREADCRUMB) {
      test(`${PAGE_TYPES[type]} at ${String(viewport.width)} × ${String(viewport.height)}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await open(page, type);
        const header = await boxOf(page, "[data-fo-header]");
        const trail = await boxOf(page, "main [data-fo-breadcrumb]");
        expect(
          Math.abs(trail.top - header.bottom - 20),
          `trail top ${String(trail.top)} − header bottom ${String(header.bottom)}`,
        ).toBeLessThanOrEqual(1);
      });
    }
  }
});

const inViewport = (
  box: Box,
  viewport: { readonly width: number; readonly height: number },
): boolean =>
  box.top >= 0 &&
  box.left >= 0 &&
  box.bottom <= viewport.height &&
  box.right <= viewport.width;

test.describe("T-43: the laptop band's first screen (AC-41)", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1512, height: 945 },
  ] as const) {
    const size = `${String(viewport.width)} × ${String(viewport.height)}`;
    for (const type of LAPTOP_SET) {
      test(`${PAGE_TYPES[type]} at ${size}: H1 in view at clause 9's size, photographs capped`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await open(page, type);

        const h1 = await boxOf(page, "main h1");
        expect(inViewport(h1, viewport), `H1 ${JSON.stringify(h1)}`).toBe(true);
        const step = FIRST_SCREEN[type].h1;
        const fontSize = await page
          .locator("main h1")
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          );
        const expected = resolveStep(step, viewport.width, viewport.height);
        expect(
          Math.abs(fontSize - expected),
          `H1 ${String(fontSize)} px, clause 9 --text-${step}-fluid = ${expected.toFixed(1)} px`,
        ).toBeLessThanOrEqual(0.5);

        // A24 clause 5: the home hero has its own bound (AC-46, TASK-196).
        if (type !== "home") {
          const cap = heroPhotoMax(viewport.height);
          const heights = await page
            .locator("main [data-fo-lead-photo], main img")
            .evaluateAll(
              (elements, fold) =>
                elements
                  .map((element) => element.getBoundingClientRect())
                  .filter((b) => b.top < fold && b.height > 0)
                  .map((b) => b.height),
              viewport.height,
            );
          for (const height of heights) {
            expect(height, "a first-screen photograph").toBeLessThanOrEqual(
              cap + 0.5,
            );
          }
        }
      });

      test(`${PAGE_TYPES[type]} at ${size}: the primary action in view`, async ({
        page,
      }) => {
        const owner = pendingOwner(type, "inView", viewport.width);
        test.fail(
          owner !== undefined,
          `first screen not yet rebuilt; owned by ${owner ?? ""}`,
        );
        await page.setViewportSize(viewport);
        await open(page, type);
        const { action } = FIRST_SCREEN[type];
        const primary = await boxOf(page, action);
        expect(
          inViewport(primary, viewport),
          `${action} ${JSON.stringify(primary)}`,
        ).toBe(true);
      });
    }
  }
});

const PHONE = { width: 390, height: 844 } as const;

test.describe("T-45: the phone at 390 × 844 (AC-43)", () => {
  for (const type of LAPTOP_SET) {
    test(`${PAGE_TYPES[type]}: no overflow, no text under 13 px, minima, H1 in view`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await open(page, type);

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth, "horizontal overflow").toBe(PHONE.width);

      const tooSmall = await page.evaluate(() => {
        const found: string[] = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        for (
          let node = walker.nextNode();
          node !== null;
          node = walker.nextNode()
        ) {
          const text = node.textContent?.trim() ?? "";
          const parent = node.parentElement;
          if (text === "" || parent === null) continue;
          if (
            !parent.checkVisibility({
              visibilityProperty: true,
              opacityProperty: true,
            })
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          // A 1 px clip (`VisuallyHidden`) is for assistive technology, not rendered text.
          if (rect.width <= 1 || rect.height <= 1) continue;
          const size = parseFloat(getComputedStyle(parent).fontSize);
          if (size < 13) found.push(`${String(size)}px "${text.slice(0, 40)}"`);
        }
        return found;
      });
      expect(tooSmall, "text under 13 px").toEqual([]);

      const resolved = await page.evaluate(() => {
        const probe = document.createElement("div");
        document.body.append(probe);
        const read = (property: string): number => {
          probe.style.fontSize = `var(${property})`;
          return parseFloat(getComputedStyle(probe).fontSize);
        };
        const values = {
          hero: read("--text-hero-fluid"),
          display: read("--text-display-fluid"),
          title: read("--text-title-fluid"),
          "3xl": read("--text-3xl-fluid"),
          "2xl": read("--text-2xl-fluid"),
          section: read("--section-fluid"),
        };
        probe.remove();
        return values;
      });
      expect(resolved, "each fluid step at its unchanged minimum").toEqual({
        hero: STEPS.hero.min,
        display: STEPS.display.min,
        title: STEPS.title.min,
        "3xl": STEPS["3xl"].min,
        "2xl": STEPS["2xl"].min,
        section: STEPS.section.min,
      });

      const h1 = await boxOf(page, "main h1");
      expect(
        h1.top >= 0 && h1.bottom <= PHONE.height,
        `H1 ${JSON.stringify(h1)}`,
      ).toBe(true);
    });

    test(`${PAGE_TYPES[type]}: every <a> and <button> in <main> at least 24 × 24`, async ({
      page,
    }) => {
      const owner = pendingOwner(type, "target");
      test.fail(
        owner !== undefined,
        `first screen not yet rebuilt; owned by ${owner ?? ""}`,
      );
      await page.setViewportSize(PHONE);
      await open(page, type);

      const smallTargets = await page
        .locator("main a, main button")
        .evaluateAll((elements) =>
          elements
            .filter((element) =>
              element.checkVisibility({ visibilityProperty: true }),
            )
            .map((element) => ({
              text: (element.textContent ?? "").trim().slice(0, 40),
              box: element.getBoundingClientRect(),
            }))
            .filter(({ box }) => box.width > 0 && box.height > 0)
            .filter(({ box }) => box.width < 24 || box.height < 24)
            .map(
              ({ text, box }) =>
                `"${text}" ${box.width.toFixed(1)} × ${box.height.toFixed(1)}`,
            ),
        );
      expect(smallTargets, "targets under 24 × 24 px").toEqual([]);
    });

    test(`${PAGE_TYPES[type]}: the primary action at least 44 px tall`, async ({
      page,
    }) => {
      const owner = pendingOwner(type, "primaryTarget");
      test.fail(
        owner !== undefined,
        `first screen not yet rebuilt; owned by ${owner ?? ""}`,
      );
      await page.setViewportSize(PHONE);
      await open(page, type);
      // A price is not a control: the target that carries it is its link (the product card).
      const { action } = FIRST_SCREEN[type];
      await expect(page.locator(action).first(), action).toBeAttached();
      const height = await page
        .locator(action)
        .first()
        .evaluate(
          (element) =>
            (element.closest("a, button") ?? element).getBoundingClientRect()
              .height,
        );
      expect(height, `${action}'s target height`).toBeGreaterThanOrEqual(44);
    });
  }
});
