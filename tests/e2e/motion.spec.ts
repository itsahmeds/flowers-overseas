/**
 * T-48 (e2e half) and T-06's reduced-motion case / AC-44, AC-6 as spec 004 §14 A24 clause 9 amends
 * them (TASK-194; `docs/design/system/motion.dc.html`).
 *
 * Each limit of the brief's "Binding" list, in a browser, on the home, a country listing, its
 * `?page=2` (rendered per request) and the product page, in both the desktop and the phone
 * projects:
 *
 *  1. no loader over server HTML on a first load, a reload, a JavaScript-off load and `?page=2`;
 *     a client navigation that has not painted after 150 ms shows it;
 *  2. the LCP element and its ancestors carry no animation, transition or delay, and the element
 *     paints at opacity 1 with no transform (red with a fade on the hero photograph);
 *  3. CLS 0 across the motions (sections rising, a card's hover, the Menu);
 *  4. motion 12 never hides a section in the first viewport, and hides none without JavaScript;
 *  5. motion 3: `aria-busy` and `disabled` on submit, the same width, re-enabled on `pageshow`;
 *  6. reduced motion: nothing moves; the one change over time is motion 10's opacity, 120 ms or
 *     less (red with that fade at 300 ms).
 *
 * The 4.5 KB the module costs is AC-25's (`tests/e2e/client-js-budget.spec.ts`,
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
    // Hold the next document for two seconds, so the old page is still on screen.
    await page.route(
      (url) => url.pathname === SHOP && url.searchParams.get("page") === "2",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      },
    );
    await page.locator('a[href$="?page=2"]:visible').first().click();
    await expect(page.locator('html[data-fo-nav="pending"]')).toHaveCount(1);
    const state = await loaderState(page);
    expect(state.barAnimation).toBe("fo-nav-bar");
    const stem = await page
      .locator('[data-fo-header-logo] [data-fo-bloom="stem"]')
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(stem).toBe("fo-bloom-stem");
    // The next document arrives clean: the mark is never in the server's HTML.
    await page.waitForURL(/page=2/u);
    await page.waitForLoadState("load");
    expect(await loaderState(page)).toEqual(IDLE);
  });
});

/** The LCP element's and every ancestor's motion at its first paint. */
async function lcpMotion(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<{ tag: string; problems: string[] }>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1] as unknown as {
            element?: Element;
          };
          const element = last?.element;
          if (element === undefined) return;
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
          resolve({ tag: element.tagName, problems });
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }),
  );
}

test.describe("2. the LCP element paints at once (AC-44)", () => {
  for (const path of [HOME, "/en-gb", SHOP, PDP]) {
    test(`${path}: no animation, transition or delay on it or its ancestors`, async ({
      page,
    }) => {
      await page.goto(path);
      const { tag, problems } = await lcpMotion(page);
      expect(tag).not.toBe("");
      expect(problems).toEqual([]);
    });
  }

  test("goes red with a fade-in on the hero photograph", async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "[data-fo-hero-photo] img, [data-fo-hero] h1 { animation: fo-shimmer 1s both; transition: opacity 1s; }";
        document.head.append(style);
      });
    });
    await page.goto(HOME);
    const { problems } = await lcpMotion(page);
    expect(problems.join(" ")).toMatch(/animation fo-shimmer/u);
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

test.describe("4. motion 12 never hides the first viewport (A24 clause 9 (g))", () => {
  test("only sections that start below the fold wait, and each plays once in view", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(HOME);
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    const states = await page.evaluate(() =>
      [...document.querySelectorAll("[data-fo-reveal]")].map((section) => ({
        value: section.getAttribute("data-fo-reveal"),
        top: section.getBoundingClientRect().top + window.scrollY,
        fold: window.innerHeight,
      })),
    );
    expect(states.length).toBeGreaterThan(3);
    for (const state of states) {
      if (state.top < state.fold)
        expect(state.value, String(state.top)).toBe("");
      else expect(state.value, String(state.top)).toBe("pending");
    }
    expect(states.some((state) => state.value === "pending")).toBe(true);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
        window.scrollTo(0, y);
        await new Promise((resolve) =>
          requestAnimationFrame(() => setTimeout(resolve, 30)),
        );
      }
    });
    await expect(page.locator('[data-fo-reveal="pending"]')).toHaveCount(0);
  });
});

test.describe("5. motion 3: the pending button", () => {
  test("Continue takes aria-busy and disabled at the same width, and pageshow releases it", async ({
    page,
  }) => {
    await page.goto(HOME);
    const button = page.locator("button[data-fo-pending]");
    await button.scrollIntoViewIfNeeded();
    const before = await button.boundingBox();
    await page.route(
      (url) => url.pathname.includes("/api/") || url.pathname !== HOME,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      },
    );
    await button.click();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toBeDisabled();
    const during = await button.boundingBox();
    expect(during?.width).toBe(before?.width);
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    await expect(button).not.toHaveAttribute("aria-busy", "true");
    await expect(button).toBeEnabled();
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
    expect(await page.locator("html[data-fo-motion]").count()).toBe(0);
    expect(await page.locator('[data-fo-reveal="pending"]').count()).toBe(0);
    expect(await page.locator("[data-fo-shimmer]").count()).toBe(0);
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
