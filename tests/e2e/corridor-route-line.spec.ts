/**
 * T-19 (browser and HTTP halves), AC-19, with AC-4 and AC-5 for idea 6: the route line on the
 * corridor page as served (spec 042 §5.3.6; TASK-311; `docs/design/system/motion-interactions.dc.html`
 * motion 18).
 *
 * What only a browser can prove: the line is inside the first screen, beside the H1 and never on
 * its box, as wide as the hero's gap up to 180 px, not displayed on a phone; its mask's draw runs
 * once with the motion sheet's values and ends drawn; with reduced motion nothing moves and it is
 * drawn from the first frame; on `/ar-XB` the "you" dot is at the inline-start, the right. And
 * what only a request can: the document is the same bytes whatever the visitor's country, address
 * or language headers say (ADR-0006).
 *
 * The markup's own clauses (one SVG, its children, its bytes, the same SVG on every page) are
 * `tests/unit/corridor-route-line.test.tsx`; the CSS values are `tests/unit/interactions-css.test.ts`.
 */
import { expect, type Page, test } from "@playwright/test";

const URL = "/en-gb/send-flowers-to/poland";
const RTL_URL = "/ar-XB/send-flowers-to/poland";
const ROUTE = "svg[data-fo-route-line]";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Geometry {
  readonly route: Box | null;
  readonly h1: Box;
  /** The H1's column, columns 1 to 6 of the first screen. */
  readonly copy: Box;
  /** The first screen's three dates, the block across the gap. */
  readonly dates: Box;
  readonly hero: Box;
  readonly count: number;
  readonly bytes: number;
  readonly forbidden: number;
  readonly display: string;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate((selector) => {
    const box = (element: Element | null) => {
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y + scrollY,
        width: rect.width,
        height: rect.height,
      };
    };
    const routes = document.querySelectorAll(selector);
    const route = routes[0] ?? null;
    const must = (element: Element | null) => {
      const found = box(element);
      if (found === null) throw new Error("missing element");
      return found;
    };
    return {
      count: routes.length,
      route:
        route === null || getComputedStyle(route).display === "none"
          ? null
          : box(route),
      h1: must(document.querySelector("[data-fo-corridor] h1")),
      copy: must(
        document.querySelector("[data-fo-corridor] h1")?.parentElement ?? null,
      ),
      dates: must(
        document.querySelector(
          "[data-fo-corridor-first-screen] > section[aria-labelledby]",
        ),
      ),
      hero: must(document.querySelector("[data-fo-corridor-first-screen]")),
      bytes: new TextEncoder().encode(route?.outerHTML ?? "").length,
      forbidden:
        route?.querySelectorAll("text, image, a, foreignObject").length ?? -1,
      display: route === null ? "" : getComputedStyle(route).display,
    };
  }, ROUTE);
}

/**
 * The sizes are set per test, so one project is enough: the phone project would only repeat the
 * desktop windows with a touch screen. The 390 px case and the HTTP case run in both.
 */
const DESKTOP_ONLY = "e2e-desktop";

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test.describe("the route line at 1,440 × 900 (AC-19)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP_ONLY, "desktop windows only");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("one decorative SVG inside the first screen, beside the H1 and never on its box", async ({
    page,
  }) => {
    const response = await page.goto(URL);
    expect(response?.status()).toBe(200);
    const found = await geometry(page);
    expect(found.count).toBe(1);
    expect(found.forbidden).toBe(0);
    expect(found.bytes).toBeLessThanOrEqual(1024);
    await expect(page.locator(ROUTE)).toHaveAttribute("aria-hidden", "true");
    const route = found.route;
    expect(route).not.toBeNull();
    if (route === null) return;
    // Inside the first screen.
    expect(route.y + route.height).toBeLessThanOrEqual(900);
    expect(route.x).toBeGreaterThanOrEqual(0);
    expect(route.x + route.width).toBeLessThanOrEqual(1440);
    // Never on the H1's box, its column's, nor the dates'.
    expect(intersects(route, found.h1)).toBe(false);
    expect(intersects(route, found.copy)).toBe(false);
    expect(intersects(route, found.dates)).toBe(false);
  });

  test("the mask's draw runs once, 0.6 s after 0.5 s, and ends drawn; then the dot is in", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const log: string[] = [];
      Object.defineProperty(window, "__foRouteEvents", { value: log });
      for (const type of [
        "animationstart",
        "animationiteration",
        "animationend",
      ]) {
        document.addEventListener(type, (event) => {
          const { animationName } = event as AnimationEvent;
          if (animationName.startsWith("fo-route-"))
            log.push(`${type}:${animationName}`);
        });
      }
    });
    await page.goto(URL);
    const timing = await page
      .locator(`${ROUTE} [data-fo-route="mask"]`)
      .evaluate((mask) => {
        const style = getComputedStyle(mask);
        return {
          name: style.animationName,
          duration: style.animationDuration,
          delay: style.animationDelay,
          iterations: style.animationIterationCount,
        };
      });
    expect(timing).toEqual({
      name: "fo-route-draw",
      duration: "0.6s",
      delay: "0.5s",
      iterations: "1",
    });
    await page.waitForFunction(() => {
      const log = (window as unknown as { __foRouteEvents: string[] })
        .__foRouteEvents;
      return log.includes("animationend:fo-route-dot");
    });
    // An infinite draw never ends, so the wait above is itself the red case for "once".
    const events = await page.evaluate(
      () =>
        (window as unknown as { __foRouteEvents: string[] }).__foRouteEvents,
    );
    expect(
      events.filter((event) => event.startsWith("animationiteration")),
    ).toEqual([]);
    expect(
      events.filter((event) => event === "animationend:fo-route-draw"),
    ).toHaveLength(1);
    const end = await page.locator(ROUTE).evaluate((svg) => {
      const mask = svg.querySelector('[data-fo-route="mask"]');
      const dot = svg.querySelector('[data-fo-route="to"]');
      if (mask === null || dot === null) throw new Error("missing part");
      return {
        offset: Number.parseFloat(getComputedStyle(mask).strokeDashoffset),
        opacity: getComputedStyle(dot).opacity,
        running: svg.getAnimations({ subtree: true }).length,
      };
    });
    expect(end).toEqual({ offset: -1, opacity: "1", running: 0 });
  });

  test("draws with JavaScript off too: the draw is CSS", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    await page.goto(URL);
    await expect(page.locator(ROUTE)).toBeVisible();
    const name = await page
      .locator(`${ROUTE} [data-fo-route="mask"]`)
      .evaluate((mask) => getComputedStyle(mask).animationName);
    expect(name).toBe("fo-route-draw");
    await context.close();
  });
});

test.describe("as wide as the hero's gap less 15 px each side, up to 180 px (the PR 297 carry-forward)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP_ONLY, "desktop windows only");
  });

  for (const width of [768, 1024, 1280, 1440]) {
    test(`at ${String(width)} px it is centred in the gap, 74 px down, at 3∶2`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(URL);
      const found = await geometry(page);
      const route = found.route;
      expect(route).not.toBeNull();
      if (route === null) return;
      // The artboard's gap: from the end of column 6 (the H1's column) to the dates.
      const gapStart = found.copy.x + found.copy.width;
      const gapEnd = found.dates.x;
      const gap = gapEnd - gapStart;
      expect(gap).toBeGreaterThan(40);
      // The gap less 15 px each side (the artboard's 210 px gap and 180 px SVG at 1440), so
      // the box never meets the H1's column where the gap is narrower.
      expect(route.width).toBeCloseTo(Math.min(180, gap - 30), 0);
      expect(route.x - gapStart).toBeGreaterThanOrEqual(14.5);
      expect(route.height).toBeCloseTo((route.width * 2) / 3, 0);
      expect(route.x - gapStart).toBeCloseTo(
        gapEnd - (route.x + route.width),
        0,
      );
      expect(route.y - found.hero.y).toBeCloseTo(74, 0);
      expect(intersects(route, found.h1)).toBe(false);
      expect(intersects(route, found.dates)).toBe(false);
    });
  }
});

test("at 390 × 844 it is not displayed (§13 Q8 (d))", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  const found = await geometry(page);
  expect(found.count).toBe(1);
  expect(found.display).toBe("none");
  expect(found.route).toBeNull();
});

test("with reduced motion it is drawn from the first frame and nothing moves (AC-4)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== DESKTOP_ONLY, "desktop windows only");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL);
  const state = await page.locator(ROUTE).evaluate((svg) => {
    const mask = svg.querySelector('[data-fo-route="mask"]');
    const dot = svg.querySelector('[data-fo-route="to"]');
    if (mask === null || dot === null) throw new Error("missing part");
    return {
      animations: svg.getAnimations({ subtree: true }).length,
      name: getComputedStyle(mask).animationName,
      offset: Number.parseFloat(getComputedStyle(mask).strokeDashoffset),
      opacity: getComputedStyle(dot).opacity,
    };
  });
  expect(state).toEqual({
    animations: 0,
    name: "none",
    offset: -1,
    opacity: "1",
  });
});

test("on /ar-XB the 'you' dot is at the inline-start, the right, with no sideways scroll (AC-5)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== DESKTOP_ONLY, "desktop windows only");
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto(RTL_URL);
  expect(response?.status()).toBe(200);
  const dots = await page.locator(ROUTE).evaluate((svg) => {
    const centre = (selector: string): number => {
      const element = svg.querySelector(selector);
      if (element === null) throw new Error(selector);
      const rect = element.getBoundingClientRect();
      return rect.x + rect.width / 2;
    };
    return {
      you: centre('[data-fo-route="you"]'),
      to: centre('[data-fo-route="to"]'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(dots.you).toBeGreaterThan(dots.to);
  expect(dots.scrollWidth).toBe(dots.clientWidth);
  const found = await geometry(page);
  expect(found.route).not.toBeNull();
  if (found.route !== null) {
    expect(intersects(found.route, found.h1)).toBe(false);
    expect(intersects(found.route, found.dates)).toBe(false);
  }
});

test.describe("the same document for every visitor (AC-19, ADR-0006)", () => {
  const VARIANTS: readonly { name: string; headers: Record<string, string> }[] =
    [
      { name: "CF-IPCountry: DE", headers: { "CF-IPCountry": "DE" } },
      // A Berlin address (Strato AG's block), as a German visitor's proxy would forward it.
      {
        name: "X-Forwarded-For, German",
        headers: { "X-Forwarded-For": "85.214.132.117" },
      },
      { name: "Accept-Language: de", headers: { "Accept-Language": "de" } },
    ];

  test("is byte-identical with the geo and language headers varied", async ({
    request,
  }) => {
    const plain = await request.get(URL, { maxRedirects: 0 });
    expect(plain.status()).toBe(200);
    const body = await plain.text();
    expect(body).toContain("data-fo-route-line");
    for (const variant of VARIANTS) {
      const response = await request.get(URL, {
        maxRedirects: 0,
        headers: variant.headers,
      });
      expect(response.status(), variant.name).toBe(200);
      expect(await response.text(), variant.name).toBe(body);
    }
  });
});
