/**
 * Spec 042 T-7, T-8 and T-9 / AC-7, AC-8, AC-9: motion 14, the photo morph (TASK-307;
 * `docs/design/system/motion-interactions.dc.html`, motion 14). Chromium, the desktop project only;
 * every case sets its own viewport.
 *
 * Every document records its `pagereveal` (an init script): whether a view transition came with
 * it, and, where a case asks, its pseudo-elements' animations paused at `ready`, so the group can
 * be read at 0 ms and at 320 ms with `getComputedStyle(…, '::view-transition-group(…)')`.
 *
 *  - **T-7 (AC-7).** On `/en-gb/poland/flowers` at 1440 × 900 the third card's link starts exactly
 *    one view transition; its only named group is that product's photograph (the hero's asset id),
 *    the root is not captured; the group runs 320 ms on `--ease-emphasised`, its width and height
 *    are the same at both ends (transform only), it starts on the card's box as the buyer saw it
 *    and ends on the hero's box, within 1 px. Not run on `/ar-XB`: no RTL locale has alt text in
 *    `seed/data/alt/`, so its cards draw spec 006's placeholder (AC-18) and there is no photograph
 *    to fly; the mirrored origin is read from the shipped CSS (`tests/unit/interactions-css.test.ts`).
 *    Red with the group at `--duration-base`, with the root crossfade left on (a second group),
 *    and with the card box left at its own size (the width keyframes then differ).
 *  - **T-8 (AC-8).** No view transition on a first load or a reload of the product page, on a
 *    header, breadcrumb or pagination link, on a card click under reduced motion or at 390 × 844;
 *    no card carries a name before a click; a product in two home rails (a cloned rail card, since
 *    the seed has none) morphs from either card, once, and its `finished` resolves. Red with
 *    `navigation: auto` in the shared stylesheet (the header link transitions), with the `lg`
 *    condition removed (the phone click transitions), with a static name per card (the duplicate
 *    aborts). The WebKit half is not run: the config has no WebKit project (brief carry-forward).
 *  - **T-9 (AC-9).** The product page's LCP render time at 1440 × 900 on arrival by a card click,
 *    five runs with the morph and five without, medians within 50 ms. The arm without skips the
 *    transition in the listing's `pageswap`, so both arms fetch the same document by the same path:
 *    a Playwright route on the product document (to strip its `<style data-fo-morph>`) stops
 *    Chromium from starting any cross-document view transition, so the arm with would never morph.
 *    The style left in the arm without is inert with no inbound transition. The medians are
 *    printed for the brief's `## Result`.
 */
import { expect, type Page, test } from "@playwright/test";

const LISTING = "/en-gb/poland/flowers";
const HOME = "/en-gb";
const PDP = "/en-gb/poland/product/amber-hour";
const DESKTOP = { width: 1440, height: 900 } as const;
const LAPTOP = { width: 1280, height: 800 } as const;
const PHONE = { width: 390, height: 844 } as const;

/** What the init script leaves on `window` for each document. */
interface MorphProbe {
  reveal: boolean | null;
  animations?: Animation[];
  finished?: boolean;
  error?: string;
  lcp?: number;
}

declare global {
  interface Window {
    __morph?: MorphProbe;
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "Chromium desktop only: each case sets its own viewport",
  );
  await page.addInitScript(() => {
    const probe: MorphProbe = { reveal: null };
    window.__morph = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    addEventListener("pagereveal", (event) => {
      const transition = event.viewTransition;
      probe.reveal = transition !== null;
      if (transition === null) return;
      transition.ready.then(
        () => {
          const animations = document
            .getAnimations()
            .filter(
              (animation) =>
                (animation.effect as KeyframeEffect | null)?.pseudoElement,
            );
          if (sessionStorage.getItem("fo-test-pause") === "1") {
            for (const animation of animations) animation.pause();
          }
          probe.animations = animations;
        },
        (error: unknown) => {
          probe.error = String(error);
        },
      );
      transition.finished.then(
        () => {
          probe.finished = true;
        },
        (error: unknown) => {
          probe.error = String(error);
        },
      );
    });
  });
});

/** The motion module has run (it arms the morph before it marks `<html>`). */
async function motionsReady(page: Page): Promise<void> {
  await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
}

/** The document's `pagereveal` has fired; returns whether it came with a view transition. */
async function revealed(page: Page): Promise<boolean> {
  await page.waitForFunction(() => window.__morph?.reveal !== null);
  return page.evaluate(() => window.__morph?.reveal === true);
}

/** On the page a card is clicked from: what `pageswap` left on the card's box. */
async function recordSwap(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.setItem("fo-test-pause", "1");
    // Added after the module's own listener, so it runs after it.
    addEventListener("pageswap", () => {
      const boxes = document.querySelectorAll<HTMLElement>(
        "[data-fo-morph-from]",
      );
      const box = boxes[0];
      sessionStorage.setItem(
        "fo-test-swap",
        JSON.stringify({
          count: boxes.length,
          name: box?.style.viewTransitionName ?? null,
          rect: box?.getBoundingClientRect().toJSON() as unknown,
        }),
      );
    });
  });
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The view transition read back on the product page, paused at `ready`. */
async function readTransition(page: Page) {
  await page.waitForFunction(() => window.__morph?.animations !== undefined);
  return page.evaluate(() => {
    const animations = window.__morph?.animations ?? [];
    const pseudos = animations.map(
      (animation) => (animation.effect as KeyframeEffect).pseudoElement ?? "",
    );
    const groups = pseudos.filter((pseudo) =>
      pseudo.startsWith("::view-transition-group("),
    );
    const name = /\((.*)\)/.exec(groups[0] ?? "")?.[1] ?? "";
    const group = animations.find(
      (animation) =>
        (animation.effect as KeyframeEffect).pseudoElement ===
        `::view-transition-group(${name})`,
    );
    const at = (time: number) => {
      for (const animation of animations) animation.currentTime = time;
      const style = getComputedStyle(
        document.documentElement,
        `::view-transition-group(${name})`,
      );
      const width = Number.parseFloat(style.width);
      const height = Number.parseFloat(style.height);
      const [a = 1, , , d = 1, e = 0, f = 0] = (
        /matrix\(([^)]+)\)/.exec(style.transform)?.[1] ?? "1,0,0,1,0,0"
      )
        .split(",")
        .map(Number);
      const [ox = 0, oy = 0] = style.transformOrigin
        .split(" ")
        .map((value) => Number.parseFloat(value));
      return {
        box: {
          x: e + ox - a * ox,
          y: f + oy - d * oy,
          width: a * width,
          height: d * height,
        },
        duration: style.animationDuration,
        easing: style.animationTimingFunction,
      };
    };
    const start = at(0);
    const end = at(320);
    const keyframes = (group?.effect as KeyframeEffect | undefined)
      ?.getKeyframes()
      .map((frame) => ({
        width: String(frame.width),
        height: String(frame.height),
      }));
    const hero = document.querySelector<HTMLElement>(
      "[data-fo-gallery-image=hero] [data-fo-media-asset]",
    );
    const heroBox = hero
      ?.querySelector("img")
      ?.getBoundingClientRect()
      .toJSON() as unknown;
    for (const animation of animations) animation.finish();
    return {
      pseudos,
      groups,
      name,
      start,
      end,
      keyframes,
      hero: heroBox,
      heroAsset: hero?.dataset.foMediaAsset ?? "",
      // The token as the browser computes it (`0.3`, not the authored `.3`), read off a probe.
      ease: (() => {
        const probe = document.createElement("i");
        probe.style.animationTimingFunction = "var(--ease-emphasised)";
        document.body.append(probe);
        const value = getComputedStyle(probe).animationTimingFunction;
        probe.remove();
        return value;
      })(),
      swap: JSON.parse(sessionStorage.getItem("fo-test-swap") ?? "null") as {
        count: number;
        name: string | null;
        rect: Box;
      } | null,
    };
  });
}

function expectBox(actual: Box, expected: Box, label: string): void {
  expect(Math.abs(actual.x - expected.x), `${label} x`).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y), `${label} y`).toBeLessThanOrEqual(1);
  expect(
    Math.abs(actual.width - expected.width),
    `${label} width`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(actual.height - expected.height),
    `${label} height`,
  ).toBeLessThanOrEqual(1);
}

test.describe("T-7 / AC-7: a card's photograph flies into the hero", () => {
  // AC-7's 1440 × 900, and the laptop band's 1280 × 800, where the hero's width is computed anew.
  for (const viewport of [DESKTOP, LAPTOP]) {
    test(`${LISTING} at ${String(viewport.width)} × ${String(viewport.height)}: the third card`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(LISTING);
      await motionsReady(page);
      expect(await revealed(page)).toBe(false);
      await recordSwap(page);
      const link = page.locator("[data-fo-product-card] a").nth(2);
      const photo = link.locator("[data-fo-media-asset]").first();
      const asset = await photo.getAttribute("data-fo-media-asset");
      // Rest the pointer on the card until motion 6's lift has settled, as a buyer's would be.
      await link.hover();
      await page.waitForTimeout(700);
      const seen = await photo.boundingBox();

      await link.click();
      await page.waitForURL(/\/product\//u);
      expect(await revealed(page)).toBe(true);
      const read = await readTransition(page);

      // Exactly one named group, the product's photograph; the root is not captured, so no other
      // card of the old page is in the transition.
      expect(read.name).toBe(`photo-${String(asset)}`);
      expect(read.heroAsset).toBe(asset);
      expect(read.groups).toEqual([`::view-transition-group(${read.name})`]);
      for (const pseudo of read.pseudos) {
        expect(pseudo).toContain(`(${read.name})`);
      }
      expect(read.swap?.count).toBe(1);
      expect(read.swap?.name).toBe(read.name);

      // 320 ms on the emphasised curve.
      expect(read.end.duration).toBe("0.32s");
      // The token resolved (an unset one would compute to the default `ease`, as the group's would).
      expect(read.ease).toMatch(/^cubic-bezier\(/u);
      expect(read.end.easing.replaceAll(" ", "")).toBe(
        read.ease.replaceAll(" ", ""),
      );

      // Transform only: the group is one size at both ends.
      expect(read.keyframes).toHaveLength(2);
      const [from, to] = read.keyframes ?? [];
      expect(
        Math.abs(
          Number.parseFloat(from?.width ?? "") -
            Number.parseFloat(to?.width ?? ""),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          Number.parseFloat(from?.height ?? "") -
            Number.parseFloat(to?.height ?? ""),
        ),
      ).toBeLessThanOrEqual(1);

      // It starts where the card's photograph was, and the card did not move to be measured.
      expect(seen).not.toBeNull();
      expectBox(read.swap?.rect as Box, seen as Box, "the card after pageswap");
      expectBox(read.start.box, read.swap?.rect as Box, "the group at 0 ms");
      // It ends on the hero's box.
      expectBox(read.end.box, read.hero as Box, "the group at 320 ms");
    });
  }
});

test.describe("T-8 / AC-8: no transition anywhere else", () => {
  test("a first load and a reload of the product page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(PDP);
    expect(await revealed(page)).toBe(false);
    await motionsReady(page);
    await page.reload();
    expect(await revealed(page)).toBe(false);
  });

  test("no card carries a name before a click", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(LISTING);
    await motionsReady(page);
    const names = await page
      .locator("[data-fo-product-card] [data-fo-media-asset]")
      .evaluateAll((boxes) =>
        boxes.map((box) => getComputedStyle(box).viewTransitionName),
      );
    expect(names.length).toBeGreaterThan(2);
    expect(new Set(names)).toEqual(new Set(["none"]));
  });

  test("a header link", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(LISTING);
    await motionsReady(page);
    // The first visible header link to another page of the site.
    const links = page.locator(`[data-fo-header] a[href^="/"]:visible`);
    const index = await links.evaluateAll(
      (nodes, here) =>
        nodes.findIndex((node) => {
          const href = node.getAttribute("href") ?? "";
          return !href.includes("#") && href !== here;
        }),
      LISTING,
    );
    expect(index).toBeGreaterThan(-1);
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL((url) => url.pathname === href);
    expect(await revealed(page)).toBe(false);
  });

  test("a breadcrumb link from the product page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(PDP);
    await motionsReady(page);
    const link = page.locator("[data-fo-pdp-trail] a[href^='/']").last();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL((url) => url.pathname === href);
    expect(await revealed(page)).toBe(false);
  });

  test("a pagination link", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/en/poland/flowers");
    await motionsReady(page);
    await page
      .locator("main nav[data-fo-pagination] a[href^='/']")
      .first()
      .click();
    await page.waitForURL(/[?&]page=/u);
    expect(await revealed(page)).toBe(false);
  });

  test("a card click under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(DESKTOP);
    await page.goto(LISTING);
    await motionsReady(page);
    await page.locator("[data-fo-product-card] a").nth(2).click();
    await page.waitForURL(/\/product\//u);
    expect(await revealed(page)).toBe(false);
  });

  test("a card click at 390 × 844", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(LISTING);
    await motionsReady(page);
    const response = page.waitForResponse((res) =>
      res.url().includes("/product/"),
    );
    await page.locator("[data-fo-product-card] a").nth(2).click();
    await page.waitForURL(/\/product\//u);
    expect((await response).status()).toBe(200);
    expect(await revealed(page)).toBe(false);
  });

  test("a product in two home rails morphs from either card, once each", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    for (const which of ["original", "copy"] as const) {
      await page.goto(HOME);
      await motionsReady(page);
      // The fixture: the first linked trending card again, as a second rail would render it.
      const target = await page.evaluate((pick) => {
        const item = document
          .querySelector("[data-fo-trending-pick] a[href]")
          ?.closest("li");
        if (!item?.parentElement) return null;
        const copy = item.cloneNode(true) as HTMLElement;
        item.parentElement.append(copy);
        const chosen = pick === "copy" ? copy : item;
        chosen.setAttribute("data-fo-test-target", "");
        return chosen.querySelector("a")?.getAttribute("href") ?? null;
      }, which);
      expect(target, "a linked trending card").not.toBeNull();
      await page.locator("[data-fo-test-target] a").click();
      await page.waitForURL((url) => url.pathname === target);
      expect(await revealed(page), which).toBe(true);
      await page.waitForFunction(
        () => window.__morph?.finished === true || window.__morph?.error,
      );
      const result = await page.evaluate(() => ({
        finished: window.__morph?.finished ?? false,
        error: window.__morph?.error ?? null,
        groups: (window.__morph?.animations ?? [])
          .map((a) => (a.effect as KeyframeEffect).pseudoElement ?? "")
          .filter((p) => p.startsWith("::view-transition-group(")),
      }));
      expect(result.error, which).toBeNull();
      expect(result.finished, which).toBe(true);
      expect(result.groups, which).toHaveLength(1);
    }
  });
});

test.describe("T-9 / AC-9: the product page's LCP with and without the morph", () => {
  test("five card arrivals each, medians within 50 ms", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(DESKTOP);
    const arrive = async (
      morph: boolean,
    ): Promise<{ lcp: number; morphed: boolean }> => {
      await page.goto(LISTING);
      await motionsReady(page);
      if (!morph) {
        // After the module's own listener: the card is named and sized as ever, then let go.
        await page.evaluate(() => {
          addEventListener("pageswap", (event) => {
            event.viewTransition?.skipTransition();
          });
        });
      }
      await page.locator("[data-fo-product-card] a").nth(2).click();
      await page.waitForURL(/\/product\//u);
      const morphed = await revealed(page);
      await page.waitForTimeout(800);
      const lcp = await page.evaluate(() => window.__morph?.lcp ?? -1);
      return { lcp, morphed };
    };
    const runs: Record<"on" | "off", number[]> = { on: [], off: [] };
    for (let run = 0; run < 5; run += 1) {
      for (const arm of ["on", "off"] as const) {
        const { lcp, morphed } = await arrive(arm === "on");
        expect(morphed, `${arm} run ${String(run + 1)}`).toBe(arm === "on");
        expect(lcp, `${arm} run ${String(run + 1)}`).toBeGreaterThan(0);
        runs[arm].push(lcp);
      }
    }
    const median = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
    };
    const on = median(runs.on);
    const off = median(runs.off);
    const note = `AC-9 LCP medians at 1440 × 900 by card click: morph on ${on.toFixed(0)} ms, off ${off.toFixed(0)} ms, delta ${(on - off).toFixed(0)} ms (on ${runs.on.map((v) => v.toFixed(0)).join(", ")}; off ${runs.off.map((v) => v.toFixed(0)).join(", ")})`;
    console.log(note);
    test.info().annotations.push({ type: "AC-9", description: note });
    expect(Math.abs(on - off)).toBeLessThanOrEqual(50);
  });
});
