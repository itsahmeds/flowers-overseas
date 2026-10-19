/**
 * T-48 (e2e half) and T-06's reduced-motion case / AC-44, AC-6 as spec 004 §14 A24 clause 9 amends
 * them (TASK-194; `docs/design/system/motion.dc.html`).
 *
 * Each limit of the brief's "Binding" list, in a browser, on the home, a country listing, its
 * `?page=2` (rendered per request) and the product page, in both the desktop and the phone
 * projects:
 *
 *  1. no loader over server HTML on a first load, a reload, a JavaScript-off load and `?page=2`;
 *     a navigation that has not painted after 150 ms shows it, and not before; `pageshow` (the
 *     back/forward cache) clears it; a modifier click or a new-tab link never starts it;
 *  2. the final LCP element, and the priority card's photograph, carry no animation, transition
 *     or delay on themselves or any ancestor, and paint at opacity 1 with no transform (red with
 *     a fade on the hero photograph, and with a 200 ms transition on the priority card);
 *  3. CLS 0 across the motions (sections rising, a card's hover, the Menu);
 *  4. motions 11 and 12 never hold back anything that starts in the first viewport (every
 *     element the module ever marks `pending` is recorded, on viewports where marked elements
 *     do start on screen), and hide nothing without JavaScript; the listing pages' sections play;
 *  5. motion 3: `aria-busy` and `disabled` on submit, the same width, the bloom in the arrow's
 *     slot, re-enabled on `pageshow`; under reduced motion the arrow stays;
 *  6. reduced motion: nothing moves; the one change over time is motion 10's opacity, 120 ms or
 *     less (red with that fade at 300 ms); a card neither lifts nor zooms;
 *  7. motion 4 plays once, unless the form was touched first;
 *  8. the 2 px bar grows from the inline start, in both directions.
 *
 * The bytes the module costs are AC-25's (`tests/e2e/client-js-budget.spec.ts`,
 * `pnpm budget:client-js`), not this file's.
 */
import { expect, test, type Page } from "@playwright/test";

const HOME = "/en";
const SHOP = "/en/poland/flowers";
const SHOP_PAGE_2 = `${SHOP}?page=2`;
const PDP = "/en-gb/poland/product/amber-hour";
const PAGES = [HOME, "/en-gb", SHOP, SHOP_PAGE_2, PDP] as const;

/** Is a loader showing? The `<html>` mark, or the bar painting. */
async function loaderState(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-fo-nav-bar]");
    const style = bar === null ? null : getComputedStyle(bar);
    return {
      nav: document.documentElement.getAttribute("data-fo-nav"),
      barOpacity: style?.opacity ?? null,
      barAnimation: style?.animationName ?? null,
      pendingButtons: document.querySelectorAll(
        '[data-fo-pending][aria-busy="true"]',
      ).length,
    };
  });
}

const IDLE = {
  nav: null,
  barOpacity: "0",
  barAnimation: "none",
  pendingButtons: 0,
};

test.describe("1. no loader in front of server HTML (A24 clause 9 (f))", () => {
  for (const path of PAGES) {
    test(`${path}: first load and reload paint no loader`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(await loaderState(page)).toEqual(IDLE);
      await page.reload();
      expect(await loaderState(page)).toEqual(IDLE);
    });
  }

  test("JavaScript off: no loader and every section and image visible", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    for (const path of [HOME, SHOP_PAGE_2]) {
      await page.goto(path);
      expect(await loaderState(page)).toEqual(IDLE);
      const hidden = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll(
              "[data-fo-reveal] > *, img[data-fo-fade]",
            ),
          ].filter((element) => getComputedStyle(element).opacity !== "1")
            .length,
      );
      expect(hidden, path).toBe(0);
      expect(await page.locator("html[data-fo-motion]").count()).toBe(0);
    }
    await context.close();
  });

  test("a navigation that has not painted after 150 ms shows the bloom and the bar", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await holdPageTwo(page);
    // Click and look from inside the page: a Playwright `click()` or locator waits for the held
    // navigation to commit, and by then the old document, with its loader, is gone.
    const during = await page.evaluate(async () => {
      document.querySelector<HTMLElement>('a[href$="?page=2"]')?.click();
      // At 100 ms the 150 ms grace has not run out: still nothing.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const before = document.documentElement.getAttribute("data-fo-nav");
      await new Promise((resolve) => setTimeout(resolve, 300));
      const animation = (selector: string): string | null => {
        const element = document.querySelector(selector);
        return element === null
          ? null
          : getComputedStyle(element).animationName;
      };
      return {
        before,
        nav: document.documentElement.getAttribute("data-fo-nav"),
        bar: animation("[data-fo-nav-bar]"),
        stem: animation('[data-fo-header-logo] [data-fo-bloom="stem"]'),
        petal: animation('[data-fo-header-logo] [data-fo-bloom="petal"]'),
      };
    });
    // Nothing at 100 ms: the 150 ms grace comes first. Then the bloom and the bar.
    expect(during).toEqual({
      before: null,
      nav: "pending",
      bar: "fo-nav-bar",
      stem: "fo-bloom-stem",
      petal: "fo-bloom-petal",
    });
    // The next document arrives clean: the mark is never in the server's HTML.
    await page.waitForURL(/page=2/u);
    await page.waitForLoadState("load");
    expect(await loaderState(page)).toEqual(IDLE);
  });
});

/**
 * Holds the next document (`?page=2`) for two seconds, so the old page is still on screen, and
 * waits for the module's mark, so a click is never read before hydration.
 */
async function holdPageTwo(page: Page): Promise<void> {
  await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
  await page.route(
    (url) => url.pathname === SHOP && url.searchParams.get("page") === "2",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    },
  );
}

test.describe("1c. the bloom clears, and never starts for another tab (motion 1)", () => {
  test("a back/forward restore (`pageshow`) clears a bloom that was playing", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await holdPageTwo(page);
    const states = await page.evaluate(async () => {
      document.querySelector<HTMLElement>('a[href$="?page=2"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const armed = document.documentElement.getAttribute("data-fo-nav");
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      return {
        armed,
        after: document.documentElement.getAttribute("data-fo-nav"),
      };
    });
    expect(states).toEqual({ armed: "pending", after: null });
  });

  for (const [name, init] of [
    ["a Cmd-click", { metaKey: true }],
    ["a Ctrl-click", { ctrlKey: true }],
    ["a Shift-click", { shiftKey: true }],
    ["a middle click", { button: 1 }],
    ["a `target=_blank` link", { blank: true }],
  ] as const) {
    test(`${name} opens elsewhere and never starts the bloom`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(SHOP);
      await holdPageTwo(page);
      const nav = await page.evaluate(async (options) => {
        // The window's listener runs after the module's (the document's), so the browser opens
        // nothing while the module sees the click exactly as a reader's.
        addEventListener("click", (event) => event.preventDefault());
        addEventListener("auxclick", (event) => event.preventDefault());
        const link =
          document.querySelector<HTMLAnchorElement>('a[href$="?page=2"]');
        if (link === null) return "no link";
        if ("blank" in options) link.target = "_blank";
        const mouse = "blank" in options ? {} : options;
        link.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            ...mouse,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        return document.documentElement.getAttribute("data-fo-nav");
      }, init);
      expect(nav).toBeNull();
    });
  }

  test("the same plain click does start it (the cases above are not vacuous)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await holdPageTwo(page);
    const nav = await page.evaluate(async () => {
      addEventListener("click", (event) => event.preventDefault());
      document
        .querySelector<HTMLAnchorElement>('a[href$="?page=2"]')
        ?.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );
      await new Promise((resolve) => setTimeout(resolve, 400));
      return document.documentElement.getAttribute("data-fo-nav");
    });
    expect(nav).toBe("pending");
  });
});

test.describe("1b. a jump inside the page is not a navigation", () => {
  test("clicking the header's #send on the home shows no loader", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('a[href$="#send"]')?.click();
    });
    await page.waitForTimeout(400);
    expect(await loaderState(page)).toEqual(IDLE);
  });
});

/**
 * The **final** LCP element's motion: after the load and the network have settled, the last
 * buffered `largest-contentful-paint` entry, never a provisional one (on a listing the H1 paints
 * first and the priority photograph wins later). Beside it, the priority photograph
 * (`fetchpriority="high"`) checked directly, so a page whose LCP is its H1 still has its lead
 * photograph held still.
 */
async function lcpMotion(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle");
  return page.evaluate(
    async () =>
      new Promise<{ tag: string; problems: string[]; priority: string[] }>(
        (resolve) => {
          // What makes an element move at its paint: its own opacity and transform, and any
          // animation, transition or delay on it or an ancestor.
          const check = (element: Element): string[] => {
            const problems: string[] = [];
            const self = getComputedStyle(element);
            if (self.opacity !== "1") problems.push(`opacity ${self.opacity}`);
            if (self.transform !== "none")
              problems.push(`transform ${self.transform}`);
            for (
              let node: Element | null = element;
              node !== null;
              node = node.parentElement
            ) {
              const style = getComputedStyle(node);
              const name = `${node.tagName.toLowerCase()}${node.id === "" ? "" : `#${node.id}`}`;
              if (style.animationName !== "none")
                problems.push(`${name} animation ${style.animationName}`);
              if (
                style.transitionDuration
                  .split(",")
                  .some((value) => Number.parseFloat(value) > 0)
              ) {
                problems.push(`${name} transition ${style.transitionProperty}`);
              }
              if (
                style.animationDelay
                  .split(",")
                  .some((value) => Number.parseFloat(value) !== 0)
              ) {
                problems.push(`${name} delay ${style.animationDelay}`);
              }
            }
            return problems;
          };
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1] as unknown as {
              element?: Element;
            };
            const element = last?.element;
            if (element === undefined) return;
            const lead = document.querySelector('img[fetchpriority="high"]');
            resolve({
              tag: element.tagName,
              problems: check(element),
              priority: lead === null ? ["no priority image"] : check(lead),
            });
          }).observe({ type: "largest-contentful-paint", buffered: true });
        },
      ),
  );
}

test.describe("2. the LCP element paints at once (AC-44)", () => {
  for (const path of [HOME, "/en-gb", SHOP, PDP]) {
    test(`${path}: no animation, transition or delay on it or its ancestors`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(path);
      const { tag, problems, priority } = await lcpMotion(page);
      expect(tag).not.toBe("");
      expect(problems).toEqual([]);
      expect(priority).toEqual([]);
    });
  }

  test("reads the final LCP on a listing: the priority photograph, not the H1", async ({
    page,
  }) => {
    await page.goto(SHOP);
    expect((await lcpMotion(page)).tag).toBe("IMG");
  });

  test("goes red with a fade-in on the hero photograph", async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "[data-fo-hero] { transition: opacity 1s; }";
        document.head.append(style);
      });
    });
    await page.goto(HOME);
    const { problems } = await lcpMotion(page);
    expect(problems.join(" ")).toMatch(/section transition opacity/u);
  });

  test("goes red with a 200 ms transition on the priority card (the guard on motion 6 removed)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "[data-fo-product-card] > a, [data-fo-product-card] > a img { transition: transform 200ms; }";
        document.head.append(style);
      });
    });
    await page.goto(SHOP);
    const { problems, priority } = await lcpMotion(page);
    expect(problems.join(" ")).toMatch(/^img transition transform/u);
    expect(priority.join(" ")).toMatch(/^img transition transform/u);
  });
});

test.describe("3. CLS 0 across the motions", () => {
  test("scrolling every section in, hovering a card and the Menu shift nothing", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const path of [HOME, SHOP]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => {
        const shifts: number[] = [];
        (window as unknown as { __shifts: number[] }).__shifts = shifts;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as unknown as {
              value: number;
              hadRecentInput: boolean;
            };
            if (!shift.hadRecentInput) shifts.push(shift.value);
          }
        }).observe({ type: "layout-shift" });
      });
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      for (let y = 0; y < height; y += 400) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(600);
      if (!isMobile) {
        const card = page.locator("a[data-fo-card-motion]").first();
        if ((await card.count()) > 0) {
          await card.scrollIntoViewIfNeeded();
          await card.hover();
          await page.waitForTimeout(400);
        }
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator("[data-fo-menu-summary]").click();
        await page.waitForTimeout(500);
      }
      const total = await page.evaluate(() =>
        (window as unknown as { __shifts: number[] }).__shifts.reduce(
          (a, b) => a + b,
          0,
        ),
      );
      expect(total, path).toBe(0);
    }
  });
});

/**
 * Records every element the module ever marks `pending` (motion 11's images, motion 12's
 * sections), with its top and the viewport's height at that moment, from before the first paint.
 * Reading the end state is not enough: a section marked and then revealed leaves no trace, but it
 * flashed hidden on the first screen.
 */
async function recordPending(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const marked: { what: string; top: number; fold: number }[] = [];
    (window as unknown as { __pending: typeof marked }).__pending = marked;
    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target as Element;
        if (
          record.attributeName !== null &&
          element.getAttribute(record.attributeName) === "pending"
        ) {
          marked.push({
            what: `${element.tagName.toLowerCase()}[${record.attributeName}]`,
            top: element.getBoundingClientRect().top + window.scrollY,
            fold: window.innerHeight,
          });
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-fo-reveal", "data-fo-fade"],
    });
  });
}

/** The marked elements that start inside the first viewport, and how many could have been. */
async function firstScreen(page: Page) {
  return page.evaluate(() => {
    const marked = (
      window as unknown as {
        __pending: { what: string; top: number; fold: number }[];
      }
    ).__pending;
    const candidates = [
      ...document.querySelectorAll("[data-fo-reveal],img[data-fo-fade]"),
    ].filter(
      (element) =>
        element.getBoundingClientRect().top + window.scrollY <
        window.innerHeight,
    ).length;
    return {
      candidates,
      held: marked
        .filter((mark) => mark.top < mark.fold)
        .map(
          (mark) => `${mark.what} at ${Math.round(mark.top)} < ${mark.fold}`,
        ),
      marked: marked.length,
    };
  });
}

test.describe("4. motions 11 and 12 never hold back the first viewport (A24 clause 9 (g))", () => {
  // Each viewport puts a marked element on the first screen, so the guard is exercised: at
  // 1280 × 1000 the home's first `data-fo-reveal` section starts at about 971 px; the listing's and
  // the product page's first-screen card photographs carry `data-fo-fade`.
  for (const { path, viewport } of [
    { path: HOME, viewport: { width: 1280, height: 1000 } },
    { path: SHOP, viewport: { width: 1280, height: 720 } },
    { path: PDP, viewport: { width: 412, height: 839 } },
  ]) {
    test(`${path} at ${viewport.width} × ${viewport.height}: nothing on the first screen is ever marked pending`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize(viewport);
      await recordPending(page);
      await page.goto(path);
      await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
      await page.waitForLoadState("load");
      const { candidates, held, marked } = await firstScreen(page);
      expect(candidates, "a marked element starts on screen").toBeGreaterThan(
        0,
      );
      expect(held).toEqual([]);
      if (path === HOME) expect(marked).toBeGreaterThan(0);
    });
  }

  for (const path of [HOME, SHOP]) {
    test(`${path}: sections below the fold wait, and each plays once in view`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(path);
      await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
      await expect(
        page.locator('[data-fo-reveal="pending"]').first(),
      ).toBeAttached();
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
          window.scrollTo(0, y);
          await new Promise((resolve) =>
            requestAnimationFrame(() => setTimeout(resolve, 30)),
          );
        }
      });
      await expect(page.locator('[data-fo-reveal="pending"]')).toHaveCount(0);
      await expect(
        page.locator('[data-fo-reveal="in"]').first(),
      ).toBeAttached();
    });
  }
});

test.describe("5. motion 3: the pending button", () => {
  test("Continue takes aria-busy and disabled at the same width, and pageshow releases it", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    const button = page.locator("button[data-fo-pending]");
    await button.scrollIntoViewIfNeeded();
    const before = await button.boundingBox();
    await page.route(
      (url) => url.pathname.includes("/api/") || url.pathname !== HOME,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        await route.continue();
      },
    );
    // Submit and look from inside the page: a locator waits for the held navigation to commit,
    // and the pending state belongs to the document that is still on screen.
    const states = await button.evaluate(async (element) => {
      const read = () => ({
        busy: element.getAttribute("aria-busy"),
        disabled: (element as HTMLButtonElement).disabled,
        width: element.getBoundingClientRect().width,
        bloom: getComputedStyle(
          element.querySelector("[data-fo-pending-bloom]") ?? element,
        ).opacity,
        stem: getComputedStyle(
          element.querySelector('[data-fo-bloom="stem"]') ?? element,
        ).animationName,
        arrow: getComputedStyle(
          element.querySelector("[data-fo-pending-arrow]") ?? element,
        ).opacity,
        // The bloom takes the arrow's slot: their centres within a pixel.
        inArrowSlot: (() => {
          const centre = (selector: string) => {
            const box = element
              .querySelector(selector)
              ?.getBoundingClientRect();
            return box === undefined ? Number.NaN : box.left + box.width / 2;
          };
          return (
            Math.abs(
              centre("[data-fo-pending-bloom]") -
                centre("[data-fo-pending-arrow] svg"),
            ) <= 1
          );
        })(),
      });
      (element as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const during = read();
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      return { during, after: read() };
    });
    expect(states.during).toEqual({
      busy: "true",
      disabled: true,
      width: before?.width,
      bloom: "1",
      stem: "fo-bloom-stem",
      arrow: "0",
      inArrowSlot: true,
    });
    expect(states.after).toMatchObject({
      busy: null,
      disabled: false,
      bloom: "0",
      arrow: "1",
    });
  });

  test("under reduced motion the arrow stays and only aria-busy changes", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    const button = page.locator("button[data-fo-pending]");
    await page.route(
      (url) => url.pathname.includes("/api/") || url.pathname !== HOME,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        await route.continue();
      },
    );
    const during = await button.evaluate(async (element) => {
      (element as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        busy: element.getAttribute("aria-busy"),
        arrow: getComputedStyle(
          element.querySelector("[data-fo-pending-arrow]") ?? element,
        ).opacity,
        bloom: getComputedStyle(
          element.querySelector("[data-fo-pending-bloom]") ?? element,
        ).opacity,
      };
    });
    expect(during).toEqual({ busy: "true", arrow: "1", bloom: "0" });
  });
});

/**
 * Records every transition and animation that starts on the page, with the property it moves and
 * its computed duration, from before the first paint. Under reduced motion only opacity at
 * ≤ 120 ms may remain; the 0.01 ms the base layer collapses everything else to is not motion.
 */
async function recordMotions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: { what: string; duration: number; iterations: string }[] = [];
    (window as unknown as { __motions: typeof seen }).__motions = seen;
    const longest = (list: string): number =>
      Math.max(
        ...list.split(",").map((value) => {
          const number = Number.parseFloat(value);
          return value.trim().endsWith("ms") ? number : number * 1000;
        }),
      );
    const record = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const pseudo = (event as TransitionEvent).pseudoElement || null;
      const style = getComputedStyle(target, pseudo);
      if (event instanceof TransitionEvent) {
        seen.push({
          what: event.propertyName,
          duration: longest(style.transitionDuration),
          iterations: "1",
        });
      } else if (event instanceof AnimationEvent) {
        seen.push({
          what: `@keyframes ${event.animationName}`,
          duration: longest(style.animationDuration),
          iterations: style.animationIterationCount,
        });
      }
    };
    document.addEventListener("transitionrun", record, true);
    document.addEventListener("animationstart", record, true);
  });
}

async function recorded(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __motions: { what: string; duration: number; iterations: string }[];
        }
      ).__motions,
  );
}

function reducedViolations(
  motions: Awaited<ReturnType<typeof recorded>>,
): string[] {
  return motions
    .filter((motion) => motion.duration > 0.01 || motion.iterations !== "1")
    .filter((motion) => !(motion.what === "opacity" && motion.duration <= 120))
    .map(
      (motion) => `${motion.what} ${motion.duration}ms ×${motion.iterations}`,
    );
}

test.describe("6. reduced motion (AC-6, T-06): opacity of 120 ms or less only", () => {
  test("the consent sheet, the Menu, the sections and the sentence: a fade at most", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordMotions(page);
    await page.goto(HOME);
    await expect(page.locator('[data-fo-consent="shown"]')).toBeVisible();
    if (isMobile) await page.locator("[data-fo-menu-summary]").click();
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1200);
    const motions = await recorded(page);
    expect(reducedViolations(motions)).toEqual([]);
    // The consent sheet's fade is the one motion left, and it did run.
    expect(motions.some((motion) => motion.what === "opacity")).toBe(true);
    // The module still marks the page (the media query, not script, is the gate), and nothing it
    // marked is held back or offset: every section's children and every image sit at opacity 1
    // with no transform, and the sentence's shimmer line draws nothing.
    expect(
      await page.evaluate(() => {
        const held = [
          ...document.querySelectorAll(
            "[data-fo-reveal] > *, img[data-fo-fade]",
          ),
        ]
          .map((element) => getComputedStyle(element))
          .filter(
            (style) => style.opacity !== "1" || style.transform !== "none",
          )
          .map((style) => `${style.opacity} ${style.transform}`);
        const shimmer = [...document.querySelectorAll("[data-fo-pick]")]
          .map((pick) => getComputedStyle(pick, "::before").animationName)
          .filter((name) => name !== "none");
        return [...held, ...shimmer];
      }),
    ).toEqual([]);
  });

  test("without the preference the same page moves (the check is not vacuous)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await recordMotions(page);
    await page.goto(HOME);
    await expect(page.locator('[data-fo-consent="shown"]')).toBeVisible();
    await page.waitForTimeout(1500);
    const motions = await recorded(page);
    expect(reducedViolations(motions).length).toBeGreaterThan(0);
    expect(motions.map((motion) => motion.what)).toContain(
      "@keyframes fo-shimmer",
    );
  });

  test("goes red with motion 10's reduced fade at 300 ms", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordMotions(page);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          '@layer base { @media (prefers-reduced-motion: reduce) { [data-fo-consent-sheet="fixed"] { transition-duration: 300ms !important; } } }';
        document.head.append(style);
      });
    });
    await page.goto(HOME);
    await expect(page.locator('[data-fo-consent="shown"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect(reducedViolations(await recorded(page))).toContain(
      "opacity 300ms ×1",
    );
  });
});

/** A card that may move (never the priority card), hovered, after its transition has had time. */
async function hoveredCard(page: Page) {
  await page.goto(SHOP);
  await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
  const card = page.locator("a[data-fo-card-motion]").first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await page.waitForTimeout(400);
  return card.evaluate((link) => ({
    card: getComputedStyle(link).transform,
    photo: getComputedStyle(link.querySelector("img") ?? link).transform,
  }));
}

test.describe("6b. motion 6 under reduced motion: no lift and no zoom", () => {
  test("a hovered card stays put and its photograph keeps its size", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "motion 6 is for a fine pointer's hover only");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await hoveredCard(page)).toEqual({ card: "none", photo: "none" });
  });

  test("without the preference the same hover lifts and zooms (not vacuous)", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "motion 6 is for a fine pointer's hover only");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const moved = await hoveredCard(page);
    expect(moved.card).toBe("matrix(1, 0, 0, 1, 0, -2)");
    expect(moved.photo).toBe("matrix(1.03, 0, 0, 1.03, 0, 0)");
  });
});

test.describe("7. motion 4: once, 800 ms after load, unless the form was touched", () => {
  test("a reader who touches the sentence first gets no shimmer", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    const shimmer = await page.evaluate(async () => {
      document
        .querySelector<HTMLSelectElement>("form[data-fo-sentence] select")
        ?.focus();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return document
        .querySelector("form[data-fo-sentence]")
        ?.getAttribute("data-fo-shimmer");
    });
    expect(shimmer).toBeNull();
  });

  test("an untouched sentence shimmers once (not vacuous)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    await expect(page.locator("form[data-fo-sentence]")).toHaveAttribute(
      "data-fo-shimmer",
      "",
    );
  });
});

test.describe("8. the 2 px bar grows from the inline start", () => {
  for (const { path, from } of [
    { path: SHOP, from: "start" },
    { path: "/ar-XB/poland/flowers", from: "end" },
  ] as const) {
    test(`${path}: its transform origin is the ${from === "start" ? "left" : "right"} edge`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status(), "is ENABLE_PSEUDO_LOCALES=true?").toBe(200);
      const { origin, width } = await page
        .locator("[data-fo-nav-bar]")
        .evaluate((bar) => ({
          origin: getComputedStyle(bar).transformOrigin.split(" ")[0],
          width: bar.getBoundingClientRect().width,
        }));
      expect(width).toBeGreaterThan(0);
      expect(origin).toBe(from === "start" ? "0px" : `${width}px`);
    });
  }
});
