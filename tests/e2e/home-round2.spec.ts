/**
 * The home to its round-2 artboards (spec 004 §14 A21 clauses 1–4, A24 clause 1, A20; AC-14,
 * AC-43, AC-46, AC-49; TASK-231, TASK-232; `docs/design/wireframes/home-desktop.dc.html`,
 * `home-mobile.dc.html`, `chrome-desktop.dc.html`). The geometry a server render cannot show:
 *
 *  - **The country select never clips its value (TASK-231; QA-1 Q1-04, "Polana").** At 320, 360
 *    and 390 px in all four locales, every destination's label, selected in turn, inks inside the
 *    select's content box, and the drawn chevron starts after the ink. The ink is the canvas's
 *    `actualBoundingBoxRight` in the select's own computed font: an italic's last glyph inks past
 *    its advance, which is what `field-sizing: content` sizes to. Watched red with
 *    `SELECT_INK_ROOM` removed (the select back to its old width): "Poland" inks 4 px past it.
 *  - **The one italic phrase (TASK-231; AC-52, T-57's e2e half).** Every drawn home heading
 *    carries one `em` in Fraunces 300 italic poppy at 1440; on the phone cover the H1's phrase is
 *    sunflower.
 *  - **The notice bar (TASK-232 item 1).** No lead, the leaf mark before the promise, the promise
 *    in sunflower, and one line at 1024 and 1440 (QA-1 Q1-23).
 *  - **The date stamps (item 2).** At 768 and 820 every stamp's text lies inside its stamp, the rows
 *    are full, and the stamp with no page (Andrzejki) is no link and has no lift. Watched red with
 *    the five-column row back at `md`.
 *  - **"Occasions →" (item 3)** beside the heading at 1440 and under it at 390, answering 200.
 *  - **The FAQ (item 4)**: "All help topics" links to the help page where it exists (spec 041
 *    AC-21, TASK-182), the first question open.
 *  - **Popular choices on the phone (item 5A, TASK-284; AC-49)**: one sideways row of five, each
 *    card exactly the width its `sizes` states, the last reachable by swipe and by Tab, no page
 *    overflow. Watched red with the two-column grid back.
 *  - **The destination chips on the phone (item 6)**: one row that scrolls (AC-49).
 *  - **No price on Popular choices (AC-53, T-58)** in four locales at 1440 and 390.
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

test.describe("the country select renders every value whole (TASK-231; AC-43, AC-46)", () => {
  for (const path of LOCALES) {
    for (const width of [320, 360, 390] as const) {
      test(`${path} at ${String(width)} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await open(page, path);
        const select = page.locator("[data-fo-sentence-country]");
        await expect(select).toBeVisible();
        const labels = await select.evaluate((node) =>
          [...(node as HTMLSelectElement).options].map((option) =>
            option.disabled
              ? option.text.replace(/\s*\([^)]*\)$/u, "")
              : option.text,
          ),
        );
        expect(labels.length).toBe(7);

        for (const [index, label] of labels.entries()) {
          const fit = await select.evaluate((node, at) => {
            const element = node as HTMLSelectElement;
            const option = element.options[at];
            if (option === undefined) throw new Error("no option");
            // Select each destination in turn: a disabled one is enabled for the probe only, with
            // the label an open destination prints (its name, without the "(soon)" state), so
            // the box is measured as it renders once its flag flips (AC-11's case).
            if (option.disabled) {
              option.disabled = false;
              option.text = option.text.replace(/\s*\([^)]*\)$/u, "");
            }
            element.selectedIndex = at;
            const style = getComputedStyle(element);
            const context = document.createElement("canvas").getContext("2d");
            if (context === null) throw new Error("no canvas");
            context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            // The select's own tracking (the display face's), which the layout applies to every
            // glyph, the last one included.
            context.letterSpacing = style.letterSpacing;
            const ink = context.measureText(option.text);
            const box = element.getBoundingClientRect();
            const start =
              box.left +
              Number.parseFloat(style.borderLeftWidth) +
              Number.parseFloat(style.paddingLeft);
            const contentEnd =
              box.right -
              Number.parseFloat(style.borderRightWidth) -
              Number.parseFloat(style.paddingRight);
            const pick = element.parentElement;
            if (pick === null) throw new Error("no pick");
            const chevron = getComputedStyle(pick, "::after");
            const pickBox = pick.getBoundingClientRect();
            // The chevron: an 8 px box at `inset-inline-end`, turned 45°, so it spreads
            // 8 × (√2 − 1) / 2 px past its box on each side.
            const chevronStart =
              pickBox.right -
              Number.parseFloat(chevron.right) -
              Number.parseFloat(chevron.width) -
              (Number.parseFloat(chevron.width) * (Math.SQRT2 - 1)) / 2;
            return {
              inkStart: start - ink.actualBoundingBoxLeft,
              inkEnd: start + ink.actualBoundingBoxRight,
              start: box.left,
              contentEnd,
              chevronStart,
            };
          }, index);
          expect(
            fit.inkEnd,
            `${label}: ink ends at ${String(fit.inkEnd)}, the box at ${String(fit.contentEnd)}`,
          ).toBeLessThanOrEqual(fit.contentEnd + 0.25);
          expect(fit.inkStart, `${label}: ink start`).toBeGreaterThanOrEqual(
            fit.start - 0.25,
          );
          expect(
            fit.inkEnd,
            `${label}: the chevron starts at ${String(fit.chevronStart)}`,
          ).toBeLessThanOrEqual(fit.chevronStart);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);
      });
    }
  }
});

test.describe("one poppy italic phrase per drawn heading (TASK-231)", () => {
  const HEADINGS = [
    ["#trending-heading", "choices"],
    ["#occasion-dates-heading", "sending for"],
    ["#occasions-heading", "occasion?"],
    ["#how-it-works-heading", "None of them is a courier."],
    ["#promise-heading", "promise"],
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
    // AC-52: no other heading on the page carries an `em`.
    await expect(page.locator(":is(h1, h2, h3, h4, h5, h6) em")).toHaveCount(
      HEADINGS.length + 1,
    );
  });

  test("at 390: the cover's phrase is sunflower", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/en-gb");
    const sun = await tokenColour(page, "--color-on-inverse-accent");
    const em = page.locator("#hero-heading em");
    await expect(em).toHaveText("far away.");
    expect(await em.evaluate((node) => getComputedStyle(node).color)).toBe(sun);
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
    test(`at ${String(width)}: the phrase on its own line, three lines in either face`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, "/en");
      const web = await lines(page, "webfont");
      expect(web.phraseInset, "the phrase starts the line").toBeLessThan(1);
      expect(web.count).toBe(3);
      const fallback = await lines(page, "fallback");
      expect(fallback.phraseInset).toBeLessThan(1);
      expect(fallback.count).toBe(web.count);
    });
  }

  test("at 390: the phrase follows the drawn break, two lines in either face", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/en");
    const web = await lines(page, "webfont");
    expect(web.phraseInset, "after “someone”").toBeGreaterThan(100);
    expect(web.count).toBe(2);
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

test.describe("the date stamps fit and say which are links (TASK-232 item 2)", () => {
  for (const width of [768, 820, 1024, 1440] as const) {
    test(`at ${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "/en-gb");
      const stamps = page.locator("[data-fo-occasion-date]");
      const count = await stamps.count();
      expect(count).toBe(4);
      const geometry = await stamps.evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
          const spill: string[] = [];
          for (
            let node = walker.nextNode();
            node !== null;
            node = walker.nextNode()
          ) {
            if ((node.textContent ?? "").trim() === "") continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (
                rect.left < box.left + 11.5 ||
                rect.right > box.right - 11.5
              ) {
                spill.push(node.textContent ?? "");
              }
            }
          }
          return { top: Math.round(box.top), spill };
        }),
      );
      for (const stamp of geometry) {
        expect(stamp.spill, "text past the stamp's face").toEqual([]);
      }
      if (width < 1280) {
        // No half-empty row: every row holds the same number of stamps.
        const rows = new Map<number, number>();
        for (const stamp of geometry) {
          rows.set(stamp.top, (rows.get(stamp.top) ?? 0) + 1);
        }
        expect(
          new Set(rows.values()).size,
          `rows ${JSON.stringify([...rows])}`,
        ).toBe(1);
      }
      // The stamp with no page is no link and sits flat; a linked one keeps its lift.
      const andrzejki = page.locator('[data-fo-occasion-date="andrzejki"]');
      await expect(andrzejki.locator("a")).toHaveCount(0);
      expect(
        await andrzejki.evaluate((node) => getComputedStyle(node).filter),
      ).toBe("none");
      const linked = page.locator('[data-fo-stamp-linked="true"]').first();
      await expect(linked.locator("a")).toHaveCount(1);
      expect(
        await linked.evaluate((node) => getComputedStyle(node).filter),
      ).not.toBe("none");
      // No stray arrow in any foot.
      await expect(page.locator("[data-fo-occasion-dates]")).not.toContainText(
        "→",
      );
    });
  }
});

test.describe('"Occasions →" links the occasions index (TASK-232 item 3; AC-14)', () => {
  test("beside the heading at 1440, under it at 390, and it answers 200", async ({
    page,
    request,
  }) => {
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "/en-gb");
      const section = page.locator("[data-fo-occasions]");
      const link = section.getByRole("link", {
        name: "Occasions",
        exact: true,
      });
      await expect(link).toHaveCount(1);
      const href = await link.getAttribute("href");
      expect(href).toBe("/en-gb/occasions");
      const heading = await section.locator("#occasions-heading").boundingBox();
      const box = await link.boundingBox();
      if (heading === null || box === null) throw new Error("no box");
      if (width === 1440) {
        expect(box.x, "beside").toBeGreaterThan(heading.x + heading.width);
      } else {
        expect(box.y, "under").toBeGreaterThanOrEqual(
          heading.y + heading.height,
        );
      }
      expect((await request.get(href ?? "")).status()).toBe(200);
    }
  });
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

/**
 * Item 5A (TASK-284; AC-49 on the home): below `md` Popular choices is one row that scrolls
 * sideways, so no half row is left blank. The row is one card tall, each card 44 % of the screen
 * less its gutters (what the `trending` slot's `sizes` states), the row really scrolls, its last
 * card comes into view by a sideways swipe (the wheel's horizontal delta, the same scroll a touch
 * pan makes) and by Tab, and the page itself never scrolls sideways. From `md`, five across with
 * nothing to scroll. Watched red with the two-column grid back.
 */
test.describe("Popular choices on the phone (TASK-284 item 5A; AC-49)", () => {
  for (const width of [360, 390] as const) {
    test(`one sideways row of five at ${String(width)}, each card its stated width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, "/en-gb");
      const row = page.locator("[data-fo-trending] ul");
      const cards = page.locator("[data-fo-trending-pick]");
      await expect(cards).toHaveCount(5);
      const geometry = await row.evaluate((node) => ({
        overflowX: getComputedStyle(node).overflowX,
        scrolls: node.scrollWidth > node.clientWidth,
        tops: new Set(
          [...node.children].map((child) =>
            Math.round(child.getBoundingClientRect().top),
          ),
        ).size,
      }));
      expect(geometry).toEqual({ overflowX: "auto", scrolls: true, tops: 1 });
      // `sizes` below `md`: calc(44vw - 17.6px), i.e. 0.44 · (width − 2 · 20).
      const widths = await cards.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().width),
      );
      for (const cardWidth of widths) {
        expect(
          Math.abs(cardWidth - 0.44 * (width - 40)),
          "card vs sizes",
        ).toBeLessThanOrEqual(1);
      }
      expect(
        await page
          .locator("[data-fo-trending-pick] img")
          .first()
          .getAttribute("sizes"),
      ).toContain("calc(44vw - 17.6px)");
      // The first card starts on the page's 20 px frame.
      expect(
        Math.round((await cards.first().boundingBox())?.x ?? -1),
        "first card on the gutter",
      ).toBe(20);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);

      // Touch: a sideways pan over the row brings the last card fully into view.
      const last = cards.last();
      const before = await last.boundingBox();
      expect((before?.x ?? 0) + (before?.width ?? 0)).toBeGreaterThan(width);
      await row.evaluate((node) => {
        node.scrollIntoView({ block: "center" });
      });
      // Pan where the row itself is hit, not a fixed bar or the consent notice laid over it.
      const point = await row.evaluate((node) => {
        const box = node.getBoundingClientRect();
        for (let y = box.top + 12; y < box.bottom; y += 12) {
          const x = box.left + box.width / 2;
          const hit = document.elementFromPoint(x, y);
          if (hit !== null && node.contains(hit)) return { x, y };
        }
        return null;
      });
      expect(point, "a point where the row is hit").not.toBeNull();
      await page.mouse.move(point?.x ?? 0, point?.y ?? 0);
      await page.mouse.wheel(2000, 0);
      await expect
        .poll(async () => {
          const box = await last.boundingBox();
          return (box?.x ?? 0) + (box?.width ?? 0) <= width;
        })
        .toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);

      // Keyboard: back to the start, then Tab from the first card to the last scrolls it in.
      await row.evaluate((node) => {
        node.scrollLeft = 0;
      });
      const links = page.locator("[data-fo-trending-pick] a[href]");
      await expect(links).toHaveCount(5);
      await links.first().focus();
      for (let step = 0; step < 4; step += 1) await page.keyboard.press("Tab");
      await expect(links.last()).toBeFocused();
      await expect
        .poll(async () => {
          const box = await last.boundingBox();
          return (
            (box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width
          );
        })
        .toBe(true);
    });
  }

  test("five across at 1440, nothing to scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/en-gb");
    const row = page.locator("[data-fo-trending] ul");
    expect(
      await row.evaluate((node) => ({
        scrolls: node.scrollWidth > node.clientWidth,
        tops: new Set(
          [...node.children].map((child) =>
            Math.round(child.getBoundingClientRect().top),
          ),
        ).size,
      })),
    ).toEqual({ scrolls: false, tops: 1 });
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
 * T-58 (spec 004 §14 A-founder-2026-10-14g, AC-53; TASK-232 item 5): the Popular choices cards
 * carry no price on any locale home at either width, whatever the artboard draws: no currency
 * symbol or code, no figure formatted as money, no "all in", no inclusive VAT text and no
 * equivalents line. Watched red with a card rendering a from-price.
 */
test.describe("Popular choices carry no price (AC-53)", () => {
  const MONEY =
    /[€£$]|zł|\b(?:EUR|GBP|PLN|USD|RON|CHF)\b|\d+[.,]\d{2}\b|\ball in\b|\bVAT\b|\bMwSt\b|\bat the rate of\b|\babout\b/iu;
  for (const path of LOCALES) {
    for (const width of [1440, 390] as const) {
      test(`${path} at ${String(width)}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, path);
        const cards = page.locator("[data-fo-trending-pick]");
        expect(await cards.count()).toBeGreaterThan(0);
        for (const card of await cards.all()) {
          const words = (await card.innerText()).replaceAll(/\s+/gu, " ");
          expect(words, words).not.toMatch(MONEY);
        }
        await expect(
          page.locator("[data-fo-trending] [data-fo-price]"),
        ).toHaveCount(0);
      });
    }
  }
});
