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
 *  6b. motion 6, premium (spec 004 §14 A-founder-2026-10-19e; TASK-277): every AC-44 bullet it
 *     adds, read after the link's `transitionend` (or 700 ms), on a fine and a coarse pointer, under
 *     both preferences, in `en` and `/ar-XB`, the priority card and the header's primary pill;
 *  7. motion 4 plays once, unless the form was touched first;
 *  8. the 2 px bar grows from the inline start, in both directions.
 *
 * The bytes the module costs are AC-25's (`tests/e2e/client-js-budget.spec.ts`,
 * `pnpm budget:client-js`), not this file's.
 */
import { expect, test, type Page } from "@playwright/test";

import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

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

test.describe("1d. a click the page handles itself never starts the bloom (motion 1)", () => {
  test.use({ storageState: NO_LOCALE_CHOICE });

  test("choosing the page's own language in the popup only closes it", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    const popup = page.locator("dialog[data-fo-language-popup][open]");
    await expect(popup).toBeVisible();
    // The island calls `preventDefault()` on its own locale's link (it closes, nothing loads);
    // the module must read that and not arm a bloom no navigation will ever clear.
    await popup.locator('[data-fo-language-option="en"]').click();
    await expect(popup).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(await loaderState(page)).toEqual(IDLE);
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
 * (`fetchpriority="high"`), the lead or first-card photograph the brief names, checked directly
 * and strictly: no transition may even be declared on it or an ancestor. The final LCP element,
 * where it is another element, may not be moving at all (opacity, transform, an animation, a
 * delay, or a transition running); on a listing a later card of the same size can win the LCP
 * race, and its motion 6 hover transition is declared but idle at its paint.
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
          const check = (element: Element, declared: boolean): string[] => {
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
                declared
                  ? style.transitionDuration
                      .split(",")
                      .some((value) => Number.parseFloat(value) > 0)
                  : node
                      .getAnimations()
                      .some((animation) => animation instanceof CSSTransition)
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
              problems: check(element, element === lead),
              priority:
                lead === null ? ["no priority image"] : check(lead, true),
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
    const { priority } = await lcpMotion(page);
    expect(priority.join(" ")).toMatch(/section transition opacity/u);
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
    const { priority } = await lcpMotion(page);
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
          // In and out, each past motion 6's 500 ms (A-founder-2026-10-19e).
          await card.hover();
          await page.waitForTimeout(700);
          await page.mouse.move(4, 4);
          await page.waitForTimeout(700);
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
    // The module loads after the LCP paint (TASK-244): submit once it has run.
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
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
          element.querySelector(":scope > span > svg") ?? element,
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
              centre("[data-fo-pending-bloom]") - centre(":scope > span > svg"),
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
          element.querySelector(":scope > span > svg") ?? element,
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
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
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
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
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

/** What motion 6 (premium; spec 004 §14 A-founder-2026-10-19e) moves on a card, read at once. */
async function cardState(page: Page) {
  const card = page.locator("a[data-fo-card-motion]").first();
  return card.evaluate((link) => {
    const style = (el: Element | null) =>
      getComputedStyle(el ?? document.documentElement);
    const img = link.querySelector("img");
    const shadow = link.querySelector("[data-fo-card-shadow]");
    const line = link.querySelector("[data-fo-card-line]");
    const heading = line?.parentElement ?? null;
    return {
      card: style(link).transform,
      photo: style(img).transform,
      shadow: style(shadow).opacity,
      shadowPaint: style(shadow).boxShadow,
      line: style(line).transform,
      lineOpacity: style(line).opacity,
      lineOriginX: style(line).transformOrigin.split(" ")[0],
      lineWidth: `${line?.getBoundingClientRect().width ?? -1}px`,
      decoration: style(heading).textDecorationLine,
      timing: [link, img, shadow, line].map((el) => {
        const s = style(el);
        return `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}`;
      }),
    };
  });
}

/**
 * A card that may move (never the priority card), hovered. The values are read after the link's
 * `transitionend`, or after 700 ms at most: a fixed wait under 500 ms reads a mid-transition value.
 */
async function hoveredCard(page: Page, path = SHOP) {
  await page.goto(path);
  await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
  const card = page.locator("a[data-fo-card-motion]").first();
  await card.scrollIntoViewIfNeeded();
  const rest = await cardState(page);
  const ended = card.evaluate(
    (link) =>
      new Promise<void>((done) => {
        // The link's own `transitionend`: the line's (320 ms) and the photograph's bubble up to it.
        link.addEventListener("transitionend", (event) => {
          if (event.target === link) done();
        });
        setTimeout(done, 700);
      }),
  );
  // Near the photograph's top corner: the consent sheet, which lands after load, sits over the
  // foot of the screen and would take the pointer from the card's centre.
  await card.hover({ position: { x: 24, y: 24 } });
  const firstFrame = await card.evaluate(
    (link) =>
      new Promise<string>((done) =>
        requestAnimationFrame(() =>
          done(
            getComputedStyle(link.querySelector("[data-fo-card-line]") ?? link)
              .opacity,
          ),
        ),
      ),
  );
  await ended;
  await page.waitForTimeout(100);
  return { rest, hovered: await cardState(page), firstFrame };
}

/**
 * `--shadow-letter` as Chromium computes it: two layers, `0 1px 1px` and `0 22px 44px -12px`, each
 * in `--color-shade` (ink at 12 %). The colour function Chromium prints for an oklch token varies
 * (`lab(…)`, `oklch(…)`, `rgba(…)`), so the geometry is read as written and the alpha as a number.
 */
function shadowLetter(computed: string): {
  geometry: string[];
  alphas: number[];
} {
  const layers = computed.split(/,(?![^(]*\))/u).map((layer) => layer.trim());
  return {
    geometry: layers.map((layer) => layer.replace(/^[a-z]+\([^)]*\)\s*/u, "")),
    alphas: layers.map((layer) => {
      const colour = /^([a-z]+)\(([^)]*)\)/u.exec(layer);
      const args = colour?.[2] ?? "";
      const slash = /\/\s*([\d.]+)(%?)/u.exec(args);
      if (slash !== null) {
        const value = Number(slash[1]);
        return slash[2] === "%" ? value / 100 : value;
      }
      // `rgba(r, g, b, a)`
      const parts = args.split(",");
      return parts.length === 4 ? Number(parts[3]) : 1;
    }),
  };
}

test.describe("6b. motion 6, premium (A-founder-2026-10-19e; AC-44, T-48)", () => {
  test("without the preference a card lifts 4 px, zooms 6 %, casts its shadow and draws its line", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "motion 6 is for a fine pointer's hover only");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const { rest, hovered } = await hoveredCard(page);
    expect(rest.card).toBe("none");
    expect(rest.photo).toBe("none");
    expect(rest.shadow).toBe("0");
    expect(shadowLetter(rest.shadowPaint)).toEqual({
      geometry: ["0px 1px 1px 0px", "0px 22px 44px -12px"],
      alphas: [0.12, 0.12],
    });
    expect(rest.line).toBe("matrix(0, 0, 0, 1, 0, 0)");
    expect(hovered.card).toBe("matrix(1, 0, 0, 1, 0, -4)");
    expect(hovered.photo).toBe("matrix(1.06, 0, 0, 1.06, 0, 0)");
    expect(hovered.shadow).toBe("1");
    expect(hovered.line).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(hovered.decoration).toBe("none");
    const PHOTO = "0.5s cubic-bezier(0.2, 0.7, 0.2, 1)";
    expect(hovered.timing).toEqual([
      `transform ${PHOTO}`,
      `transform ${PHOTO}`,
      `opacity ${PHOTO}`,
      "transform 0.32s cubic-bezier(0.3, 0, 0, 1)",
    ]);
    expect(hovered.lineOriginX).toBe("0px");
  });

  test("under /ar-XB the line draws from the inline-start, the right", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "motion 6 is for a fine pointer's hover only");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const { hovered } = await hoveredCard(page, "/ar-XB/poland/flowers");
    const origin = Number.parseFloat(hovered.lineOriginX ?? "");
    expect(origin).toBeGreaterThan(0);
    expect(
      Math.abs(origin - Number.parseFloat(hovered.lineWidth)),
    ).toBeLessThan(0.5);
  });

  test("under reduced motion nothing moves; the line shows at once", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "motion 6 is for a fine pointer's hover only");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { rest, hovered, firstFrame } = await hoveredCard(page);
    expect([hovered.card, hovered.photo, hovered.shadow]).toEqual([
      "none",
      "none",
      "0",
    ]);
    expect(rest.line).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(rest.lineOpacity).toBe("0");
    expect(hovered.line).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(firstFrame).toBe("1");
  });

  test("a tapped card on a coarse pointer neither lifts nor casts a shadow", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the phone project is the coarse pointer");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    const card = page.locator("a[data-fo-card-motion]").first();
    await card.scrollIntoViewIfNeeded();
    // Stop the navigation, so the tapped card's own styles are read.
    await card.evaluate((link) =>
      link.addEventListener("click", (event) => event.preventDefault()),
    );
    await card.tap({ position: { x: 24, y: 24 } });
    await page.waitForTimeout(700);
    const state = await cardState(page);
    expect([state.card, state.shadow]).toEqual(["none", "0"]);
  });

  test("the priority card has no motion, no layers, and underlines its name", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "hover is a fine pointer's");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    const priority = page.locator("[data-fo-product-card] a").first();
    expect(await priority.getAttribute("data-fo-card-motion")).toBeNull();
    await expect(
      priority.locator("[data-fo-card-shadow], [data-fo-card-line]"),
    ).toHaveCount(0);
    await priority.hover({ position: { x: 24, y: 24 } });
    await page.waitForTimeout(100);
    expect(
      await priority
        .locator("h2, h3")
        .first()
        .evaluate((h) => getComputedStyle(h).textDecorationLine),
    ).toBe("underline");
  });

  test("the header's primary pill fades its layer, presses in 120 ms and settles in 200 ms", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the header's pill shows from `md` up");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    const pill = page.locator("header a.fo-pill").first();
    // The page and the variant, named: the header's Send flowers is `Button` `primary`.
    expect(await pill.getAttribute("class")).toContain(
      "bg-accent text-on-accent",
    );
    const read = () =>
      pill.evaluate((el) => {
        const s = getComputedStyle(el);
        const layer = getComputedStyle(el, "::before");
        return {
          transform: s.transform,
          timing: `${s.transitionDuration} ${s.transitionTimingFunction}`,
          background: s.backgroundColor,
          layer: layer.opacity,
          layerTiming: `${layer.transitionDuration} ${layer.transitionTimingFunction}`,
        };
      });
    const rest = await read();
    await pill.hover();
    await page.waitForTimeout(400);
    const hovered = await read();
    expect(hovered.layer).toBe("1");
    expect(hovered.layerTiming).toBe("0.2s cubic-bezier(0.2, 0, 0.13, 1)");
    expect(hovered.background).toBe(rest.background);
    await page.mouse.down();
    await page.waitForTimeout(300);
    const held = await read();
    expect(held.transform).toBe("matrix(0.98, 0, 0, 0.98, 0, 0)");
    expect(held.timing).toBe("0.12s cubic-bezier(0.2, 0, 0.13, 1)");
    // Released away from the pill, so no navigation starts and its own style is read.
    await page.mouse.move(4, 400);
    await page.mouse.up();
    const released = await read();
    expect(released.timing).toBe("0.2s cubic-bezier(0.3, 0, 0, 1)");
    await page.waitForTimeout(400);
    expect((await read()).transform).toBe("none");
  });

  test("under reduced motion a held press leaves the pill where it is", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the header's pill shows from `md` up");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SHOP);
    const pill = page.locator("header a.fo-pill").first();
    await pill.hover();
    await page.mouse.down();
    await page.waitForTimeout(200);
    const transform = await pill.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    await page.mouse.move(4, 400);
    await page.mouse.up();
    expect(transform).toBe("none");
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

/*
 * TASK-283: the four motions TASK-194 left (spec 004 §14 A24 clause 9 (e); AC-44, AC-6; T-48,
 * T-06). Each limit is read in the browser under both preferences, and each section has a case
 * that goes red with its motion taken away.
 *
 *  9. motion 3 on every primary action: a primary link (the header's Send from `md`, the Menu's
 *     below it) takes `aria-busy` and `aria-disabled` at its own width, plays the bloom instead of
 *     motion 1's header bloom, and `pageshow` releases it; under reduced motion only `aria-busy`;
 * 10. motion 5: the home H1's underline draws once, 600 ms after a 500 ms delay, and the H1's box
 *     never moves; under reduced motion it is drawn from the start;
 * 11. motion 13: the 404's route cover, in the document's own paper, unrolls once over 1,200 ms;
 *     under reduced motion the route is drawn from the start;
 * 12. motion 10's close half: the Menu and the consent sheet run their open transition back
 *     (opacity and transform, or opacity alone at 120 ms under reduced motion) and leave only
 *     when it ends.
 */
const NOT_FOUND = "/en/does-not-exist";

/** Holds every document request to `pathname` for eight seconds, so the old page stays. */
async function holdDocument(page: Page, pathname: string): Promise<void> {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.continue();
    },
  );
}

/** The phone's Menu, opened and landed (motion 10's opening has finished). */
async function openMenu(page: Page): Promise<void> {
  await page.locator("[data-fo-menu-summary]").click();
  const panel = page.locator("[data-fo-menu-panel]");
  await expect(panel).toHaveCSS("opacity", "1");
  await expect(panel).toHaveCSS("transform", "none");
}

/** Clicks the first primary link a reader can see, from inside the page, and reads it twice. */
async function pressPrimaryLink(page: Page, isMobile: boolean) {
  await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
  if (isMobile) await openMenu(page);
  const link = page.locator("a[data-fo-pending]:visible").first();
  const before = await link.boundingBox();
  const href = (await link.getAttribute("href")) ?? "";
  await holdDocument(page, new URL(href, page.url()).pathname);
  const states = await link.evaluate(async (element) => {
    const read = () => ({
      busy: element.getAttribute("aria-busy"),
      disabled: element.getAttribute("aria-disabled"),
      width: element.getBoundingClientRect().width,
      bloom: getComputedStyle(
        element.querySelector("[data-fo-pending-bloom]") ?? element,
      ).opacity,
      stem: getComputedStyle(
        element.querySelector('[data-fo-bloom="stem"]') ?? element,
      ).animationName,
      nav: document.documentElement.getAttribute("data-fo-nav"),
    });
    (element as HTMLAnchorElement).click();
    // Past motion 1's 150 ms grace: its header bloom would be playing by now.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const during = read();
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    return { during, after: read() };
  });
  return { before, ...states };
}

test.describe("9. motion 3 on every primary action (TASK-283)", () => {
  test("a primary link: aria-busy and aria-disabled at the same width, its bloom and not motion 1's, released on pageshow", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    const { before, during, after } = await pressPrimaryLink(page, isMobile);
    expect(during).toEqual({
      busy: "true",
      disabled: "true",
      width: before?.width,
      bloom: "1",
      stem: "fo-bloom-stem",
      nav: null,
    });
    expect(after).toMatchObject({ busy: null, disabled: null, bloom: "0" });
  });

  test("under reduced motion only aria-busy changes: no bloom shows", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SHOP);
    const { during } = await pressPrimaryLink(page, isMobile);
    expect(during).toMatchObject({ busy: "true", bloom: "0", stem: "none" });
  });

  test("a link that is not a primary action keeps motion 1 (the case above is not vacuous)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await holdPageTwo(page);
    const state = await page.evaluate(async () => {
      const link = document.querySelector<HTMLElement>('a[href$="?page=2"]');
      const marked = link?.hasAttribute("data-fo-pending") ?? null;
      link?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        marked,
        nav: document.documentElement.getAttribute("data-fo-nav"),
      };
    });
    expect(state).toEqual({ marked: false, nav: "pending" });
  });
});

/**
 * What motion 5's path is told to do (its computed animation, which a finished run leaves in
 * place), whether its SVG is out of the H1's flow, and where its dash rests once the draw is over.
 */
async function underlineState(page: Page) {
  return page.evaluate(async () => {
    const heading = document.querySelector("#hero-heading");
    const svg = heading?.querySelector("[data-fo-em] > svg");
    const path = svg?.querySelector("path");
    if (heading === null || svg === undefined || svg === null || !path) {
      return null;
    }
    const style = getComputedStyle(path);
    const state = {
      name: style.animationName,
      delay: style.animationDelay,
      duration: style.animationDuration,
      iterations: style.animationIterationCount,
      dasharray: style.strokeDasharray,
      outOfFlow: getComputedStyle(svg).position === "absolute",
      headingAnimations: heading.getAnimations().length,
    };
    // 500 ms of delay and 600 ms of draw, from the first style, are over by now.
    await new Promise((resolve) => setTimeout(resolve, 1300));
    return {
      ...state,
      dashoffsetAtEnd: getComputedStyle(path).strokeDashoffset,
    };
  });
}

test.describe("10. motion 5: the home H1's underline draws once (TASK-283)", () => {
  test("without the preference: 500 ms, then 600 ms, once, out of the H1's flow", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    expect(await underlineState(page)).toEqual({
      name: "fo-underline-draw",
      delay: "0.5s",
      duration: "0.6s",
      iterations: "1",
      dasharray: "300px",
      outOfFlow: true,
      headingAnimations: 0,
      dashoffsetAtEnd: "0px",
    });
  });

  test("under reduced motion the underline is drawn from the start", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    expect(await underlineState(page)).toMatchObject({
      name: "none",
      dasharray: "none",
      outOfFlow: true,
      dashoffsetAtEnd: "0px",
    });
  });

  test("goes red with the draw taken away", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "#hero-heading [data-fo-em] path { animation: none !important; }";
        document.head.append(style);
      });
    });
    await page.goto(HOME);
    expect(await underlineState(page)).toMatchObject({ name: "none" });
  });
});

/** What motion 13's cover is told to do, whether it is the document's own paper, and where it rests. */
async function routeState(page: Page) {
  return page.evaluate(async () => {
    const cover = document.querySelector("[data-fo-notice-route-cover]");
    const route = document.querySelector("[data-fo-notice-route] path");
    const ground = document.querySelector("[data-fo-notice-404]");
    if (cover === null || route === null || ground === null) return null;
    const style = getComputedStyle(cover);
    const state = {
      name: style.animationName,
      delay: style.animationDelay,
      duration: style.animationDuration,
      iterations: style.animationIterationCount,
      routeAnimation: getComputedStyle(route).animationName,
      paper: style.stroke === getComputedStyle(ground).backgroundColor,
      dasharray: style.strokeDasharray,
    };
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return {
      ...state,
      dashoffsetAtEnd: getComputedStyle(cover).strokeDashoffset,
    };
  });
}

test.describe("11. motion 13: the 404's route draws once (TASK-283)", () => {
  test("without the preference: 1,200 ms, once, a cover in the document's paper rolling away", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const response = await page.goto(NOT_FOUND);
    expect(response?.status()).toBe(404);
    expect(await routeState(page)).toEqual({
      name: "fo-route-unroll",
      delay: "0s",
      duration: "1.2s",
      iterations: "1",
      routeAnimation: "none",
      paper: true,
      dasharray: "1px, 1px",
      dashoffsetAtEnd: "-1px",
    });
  });

  test("under reduced motion the route is drawn from the start", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(NOT_FOUND);
    expect(await routeState(page)).toMatchObject({
      name: "none",
      paper: true,
      dashoffsetAtEnd: "-1px",
    });
  });

  test("goes red with the unrolling taken away", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "[data-fo-notice-route-cover] { animation: none !important; }";
        document.head.append(style);
      });
    });
    await page.goto(NOT_FOUND);
    expect(await routeState(page)).toMatchObject({ name: "none" });
  });
});

/**
 * Closes something from inside the page and reads it at once and after its transitions end:
 * whether it was held, which properties ran and for how long, and whether it then left.
 */
async function closeAndRead(page: Page, what: "menu" | "consent") {
  return page.evaluate(async (kind) => {
    const box =
      kind === "menu"
        ? document.querySelector("details[data-fo-menu] [data-fo-menu-panel]")
        : document.querySelector('[data-fo-consent-sheet="fixed"]');
    const menu = document.querySelector<HTMLDetailsElement>(
      "details[data-fo-menu]",
    );
    if (box === null || (kind === "menu" && menu === null)) return null;
    const holder = kind === "menu" ? menu : box;
    if (kind === "menu") {
      menu?.querySelector("summary")?.click();
    } else {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    }
    const running = box.getAnimations();
    const marked = holder?.hasAttribute("data-fo-closing") ?? false;
    const transitions = running
      .map(
        (animation) =>
          `${(animation as CSSTransition).transitionProperty} ${String(animation.effect?.getComputedTiming().duration)}`,
      )
      .sort();
    const transforms = new Set<string>();
    const sample = (): void => {
      transforms.add(getComputedStyle(box).transform);
    };
    sample();
    const timer = setInterval(sample, 16);
    // Halfway through the longest transition (or 50 ms when none runs) it is still there: a
    // close that did not wait would have taken it away by now.
    const longest = Math.max(
      0,
      ...running.map((animation) =>
        Number(animation.effect?.getComputedTiming().duration ?? 0),
      ),
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(50, longest / 2)),
    );
    const held =
      marked && (kind === "menu" ? menu?.open === true : box.isConnected);
    await Promise.allSettled(running.map((animation) => animation.finished));
    clearInterval(timer);
    // The close itself lands after the transition's promise; give it a few frames.
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      held,
      transitions,
      moved: [...transforms].some((transform) => transform !== "none"),
      gone:
        kind === "menu"
          ? menu?.open === false && !menu.hasAttribute("data-fo-closing")
          : !box.isConnected,
    };
  }, what);
}

test.describe("12. motion 10's close half: the Menu and the consent sheet (TASK-283)", () => {
  test("the Menu rises out over 320 ms, held open until it ends", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the Menu is drawn below md");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    await openMenu(page);
    expect(await closeAndRead(page, "menu")).toEqual({
      held: true,
      transitions: ["opacity 320", "transform 320"],
      moved: true,
      gone: true,
    });
    // It opens again from its start state: the mark is gone.
    await openMenu(page);
  });

  test("under reduced motion the Menu only fades, in 120 ms", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the Menu is drawn below md");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SHOP);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    await page.locator("[data-fo-menu-summary]").click();
    await expect(page.locator("[data-fo-menu-panel]")).toHaveCSS(
      "opacity",
      "1",
    );
    expect(await closeAndRead(page, "menu")).toEqual({
      held: true,
      transitions: ["opacity 120"],
      moved: false,
      gone: true,
    });
  });

  test("Esc closes the Menu the same way and puts focus back on its summary", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the Menu is drawn below md");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    await openMenu(page);
    await page.locator("[data-fo-menu-item]").first().focus();
    await page.keyboard.press("Escape");
    await expect(
      page.locator("details[data-fo-menu][data-fo-closing]"),
    ).toHaveCount(1);
    await expect(page.locator("details[data-fo-menu][open]")).toHaveCount(0);
    await expect(page.locator("[data-fo-menu-summary]")).toBeFocused();
  });

  test("the consent sheet leaves the way it came: from its edge on the phone, 8 px from `sm`", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SHOP);
    const sheet = page.locator('[data-fo-consent-sheet="fixed"]');
    await expect(sheet).toHaveCSS("opacity", "1");
    await expect(sheet).toHaveCSS("transform", "none");
    const duration = isMobile ? 320 : 200;
    expect(await closeAndRead(page, "consent")).toEqual({
      held: true,
      transitions: [`opacity ${duration}`, `transform ${duration}`],
      moved: true,
      gone: true,
    });
    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);
  });

  test("standing on the phone's action bar, the consent sheet only fades", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the action bar is drawn below md");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    await expect(page.locator("[data-fo-action-bar]")).toHaveCount(1);
    const sheet = page.locator('[data-fo-consent-sheet="fixed"]');
    await expect(sheet).toHaveCSS("opacity", "1");
    expect(await closeAndRead(page, "consent")).toEqual({
      held: true,
      transitions: ["opacity 320"],
      moved: false,
      gone: true,
    });
  });

  test("under reduced motion the consent sheet only fades, in 120 ms", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SHOP);
    await expect(page.locator('[data-fo-consent-sheet="fixed"]')).toHaveCSS(
      "opacity",
      "1",
    );
    expect(await closeAndRead(page, "consent")).toEqual({
      held: true,
      transitions: ["opacity 120"],
      moved: false,
      gone: true,
    });
  });

  test("goes red with the close transition taken away (nothing held, nothing runs)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "[data-fo-consent-sheet][data-fo-closing] { transition: none !important; }";
        document.head.append(style);
      });
    });
    await page.goto(SHOP);
    await expect(page.locator('[data-fo-consent-sheet="fixed"]')).toHaveCSS(
      "opacity",
      "1",
    );
    expect(await closeAndRead(page, "consent")).toMatchObject({
      held: false,
      transitions: [],
    });
  });
});
