/**
 * The home's round-2 geometry that outlived the v3 rebuild (spec 004 §14 A21, A24 clause 1, A20;
 * AC-43, AC-49, AC-52, AC-53; TASK-231, TASK-232; v3 by TASK-386 and TASK-387). The sentence's
 * select, the date stamps, the occasion tiles and Popular choices' phone scroller were retired
 * with spec 004 §14 A-founder-2026-10-24a; their cases went with them. What stays:
 *
 *  - **The one italic phrase (TASK-231; AC-52, T-57's e2e half).** Every drawn home heading
 *    carries one `em` in Fraunces 300 italic poppy, at 1440 and at 390 (the phone cover, and its
 *    sunflower phrase, is gone).
 *  - **The H1 breaks the same way in either face** (TASK-231), now one line at 390 as drawn.
 *  - **The notice bar (TASK-232 item 1).**
 *  - **The FAQ (item 4)**: "All help topics" links to the help page, the first question open.
 *  - **The destination chips on the phone (item 6)**: one row that scrolls (AC-49).
 *  - **No price on any home card (AC-53, T-58; spec 004 AC-75)** in four locales at 1440 and 390.
 */
import { type Page, expect, test } from "@playwright/test";

const LOCALES = ["/en", "/en-gb", "/de", "/pl"] as const;

async function open(page: Page, path: string): Promise<void> {
  expect((await page.goto(path))?.status(), path).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

/** The computed colour a token resolves to, read from a probe element in the page. */
async function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

test.describe("one poppy italic phrase per drawn heading (TASK-231)", () => {
  const HEADINGS = [
    ["#selection-heading", "choices"],
    ["#occasions-heading", "occasion?"],
    ["#how-it-works-heading", "None of them is a courier."],
    ["#faq-heading", "ask first"],
    ["#destinations-heading", "send flowers"],
  ] as const;

  test("at 1440: each heading's `em` is Fraunces 300 italic in poppy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/en-gb");
    const poppy = await tokenColour(page, "--color-accent");
    for (const [selector, phrase] of [
      ["#hero-heading", "far away."] as const,
      ...HEADINGS,
    ]) {
      const heading = page.locator(selector);
      await expect(heading, selector).toHaveCount(1);
      const em = heading.locator("em");
      await expect(em, selector).toHaveCount(1);
      await expect(em, selector).toHaveText(phrase);
      const style = await em.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          fontStyle: computed.fontStyle,
          fontWeight: computed.fontWeight,
          color: computed.color,
        };
      });
      expect(style.fontStyle, selector).toBe("italic");
      expect(style.fontWeight, selector).toBe("300");
      expect(style.color, selector).toBe(poppy);
    }
    // "Coming up" is dated, so it is drawn only while an occasion qualifies; when it is, its
    // heading carries the phrase too.
    const comingUp = await page.locator("#coming-up-heading").count();
    if (comingUp > 0)
      await expect(page.locator("#coming-up-heading em")).toHaveText(
        "sending for",
      );
    // AC-52: no other heading on the page carries an `em`.
    await expect(page.locator(":is(h1, h2, h3, h4, h5, h6) em")).toHaveCount(
      HEADINGS.length + 1 + comingUp,
    );
  });

  test("at 390: the H1's phrase is poppy, on paper (no cover since v3)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/en-gb");
    const poppy = await tokenColour(page, "--color-accent");
    const em = page.locator("#hero-heading em");
    await expect(em).toHaveText("far away.");
    expect(await em.evaluate((node) => getComputedStyle(node).color)).toBe(
      poppy,
    );
  });
});

/**
 * The H1's line breaks do not depend on which face drew them (TASK-231; AC-39's CLS on the phone
 * cover). At 360 px the drawn break ("Flowers for / someone far away.") left the second line 318 of
 * 320 px long, so a sub-pixel difference in advances decided whether "far away." wrapped: on Linux
 * the metric-matched fallback kept it on line 2 and Fraunces pushed it to line 3, the bottom-anchored
 * hero copy rose a line when the italic swapped in, and the language popup's CLS case read 0.158
 * in CI. Below the artboard's 390 px the phrase starts its own line, so the heading has the same
 * three lines in the fallback and in Fraunces; from 390 it follows "someone" as drawn, with 30 px to
 * spare. "The fallback" is the heading's own stack from its first metric-matched face, which is
 * what the browser paints before the swap. Watched red without the break: at 360 the phrase begins
 * after "someone".
 */
test.describe("the hero H1 breaks the same way before and after the swap (TASK-231)", () => {
  /** The heading's line count and where its phrase starts, in the page's face or in the fallback. */
  async function lines(
    page: Page,
    face: "webfont" | "fallback",
  ): Promise<{ count: number; phraseInset: number }> {
    return page.evaluate((which) => {
      const heading = document.querySelector<HTMLElement>("#hero-heading");
      const em = heading?.querySelector<HTMLElement>("em");
      if (heading == null || em == null) throw new Error("no hero heading");
      if (which === "fallback") {
        for (const node of [heading, em]) {
          const families = getComputedStyle(node)
            .fontFamily.split(",")
            .map((family) => family.trim());
          const first = families.findIndex((family) =>
            family.includes("Fallback"),
          );
          if (first < 0) throw new Error("no metric-matched fallback");
          node.style.fontFamily = families.slice(first).join(", ");
          node.style.fontVariationSettings = "normal";
        }
      }
      const lineHeight = Number.parseFloat(
        getComputedStyle(heading).lineHeight,
      );
      const box = heading.getBoundingClientRect();
      const phrase = em.getClientRects()[0];
      if (phrase === undefined) throw new Error("the phrase is not rendered");
      return {
        count: Math.round(box.height / lineHeight),
        phraseInset: phrase.left - box.left,
      };
    }, face);
  }

  for (const width of [320, 360, 375, 389] as const) {
    test(`at ${String(width)}: the phrase on its own line, the same lines in either face`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, "/en");
      const web = await lines(page, "webfont");
      expect(web.phraseInset, "the phrase starts the line").toBeLessThan(1);
      expect(web.count).toBe(2);
      const fallback = await lines(page, "fallback");
      expect(fallback.phraseInset).toBeLessThan(1);
      expect(fallback.count).toBe(web.count);
    });
  }

  test("at 390: one line as drawn (v3), in either face", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/en");
    const web = await lines(page, "webfont");
    expect(web.phraseInset, "after “someone”").toBeGreaterThan(100);
    expect(web.count).toBe(1);
    const fallback = await lines(page, "fallback");
    expect(fallback.phraseInset).toBeGreaterThan(100);
    expect(fallback.count).toBe(web.count);
  });
});

test.describe("the notice bar, round 2 (TASK-232 item 1)", () => {
  // One line at 1024 on the home (QA-1 Q1-23). A page with the price claim also fits from 1440;
  // at 1024 its claims meet the four-locale switcher, which TASK-237 narrows to the shown locales
  // (spec 004 §14 A-founder-2026-10-14e), so that page is held to one line at 1440 here.
  for (const [width, path] of [
    [1024, "/en-gb"],
    [1440, "/en-gb"],
    [1440, "/en-gb/occasions"],
  ] as const) {
    {
      test(`${path} at ${String(width)}: no lead, the leaf, the sunflower promise, one line`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, path);
        const bar = page.locator("[data-fo-notice-bar]");
        await expect(bar).not.toContainText("A note from us");
        const promise = bar.locator("[data-fo-notice-promise]");
        await expect(promise).toHaveText("Fresh-flower promise");
        // The leaf is the promise's first child, before its words.
        expect(
          await promise.evaluate(
            (node) =>
              node.firstElementChild?.tagName.toLowerCase() === "svg" &&
              node.firstElementChild.getAttribute("viewBox") === "0 0 34 34",
          ),
        ).toBe(true);
        expect(
          await promise.evaluate((node) => getComputedStyle(node).color),
        ).toBe(await tokenColour(page, "--color-on-inverse-accent"));
        // One line: the claims paragraph is one line box tall (QA-1 Q1-23).
        const lines = await bar.locator("p").evaluate((node) => {
          const style = getComputedStyle(node);
          return (
            node.getBoundingClientRect().height /
            Number.parseFloat(style.lineHeight)
          );
        });
        expect(lines, "line boxes in the claims").toBeLessThan(1.5);
      });
    }
  }
});

test.describe("the FAQ (TASK-232 item 4; A20; spec 041 AC-21)", () => {
  test('"All help topics" links to the help page, and the first question open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/en-gb");
    const faq = page.locator("[data-fo-faq]");
    // The help page exists in `en-gb` (TASK-182), so the label is a link to it and the pending
    // sentence is gone; where the page does not exist the label is not drawn (A20).
    await expect(
      faq.getByRole("link", { name: "All help topics" }),
    ).toHaveAttribute("href", "/en-gb/help");
    await expect(faq).not.toContainText("Our help pages are being written");
    const open_ = await faq
      .locator("details")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLDetailsElement).open),
      );
    expect(open_).toEqual([true, false, false]);
  });
});

test.describe("the destination chips on the phone (TASK-232 item 6; AC-49)", () => {
  test("one row that scrolls at 390, wrapped at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/en-gb");
    const row = page.locator("[data-fo-destination-chips]");
    const phone = await row.evaluate((node) => ({
      overflowX: getComputedStyle(node).overflowX,
      wrap: getComputedStyle(node).flexWrap,
      scrolls: node.scrollWidth > node.clientWidth,
      tops: new Set(
        [...node.children].map((child) =>
          Math.round(child.getBoundingClientRect().top),
        ),
      ).size,
    }));
    expect(phone).toEqual({
      overflowX: "auto",
      wrap: "nowrap",
      scrolls: true,
      tops: 1,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await row.evaluate((node) => getComputedStyle(node).flexWrap)).toBe(
      "wrap",
    );
  });
});

/**
 * T-58 (spec 004 §14 A-founder-2026-10-14g, AC-53; TASK-232 item 5; spec 004 AC-75 since v3): the
 * home's cards, in every product section, carry no price on any locale home at either width, whatever the artboard draws: no currency
 * symbol or code, no figure formatted as money, no "all in", no inclusive VAT text and no
 * equivalents line. Watched red with a card rendering a from-price.
 */
test.describe("the home's cards carry no price (AC-53, AC-75)", () => {
  const MONEY =
    /[€£$]|zł|\b(?:EUR|GBP|PLN|USD|RON|CHF)\b|\d+[.,]\d{2}\b|\ball in\b|\bVAT\b|\bMwSt\b|\bat the rate of\b|\babout\b/iu;
  for (const path of LOCALES) {
    for (const width of [1440, 390] as const) {
      test(`${path} at ${String(width)}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, path);
        const cards = page.locator("[data-fo-home-section] article");
        expect(await cards.count()).toBeGreaterThan(0);
        for (const card of await cards.all()) {
          const words = (await card.innerText()).replaceAll(/\s+/gu, " ");
          expect(words, words).not.toMatch(MONEY);
        }
        await expect(
          page.locator("[data-fo-home-section] [data-fo-price]"),
        ).toHaveCount(0);
      });
    }
  }
});
