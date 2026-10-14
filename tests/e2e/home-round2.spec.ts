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
 *  - **The one italic phrase (TASK-231).** Every drawn home heading carries one `em` in Fraunces
 *    300 italic poppy at 1440; on the phone cover the H1's phrase is sunflower.
 *  - **The notice bar (TASK-232 item 1).** No lead, the leaf mark before the promise, the promise
 *    in sunflower, and one line at 1024 and 1440 (QA-1 Q1-23).
 *  - **The date stamps (item 2).** At 768 and 820 every stamp's text lies inside its stamp, the rows
 *    are full, and the stamp with no page (Andrzejki) is no link and has no lift. Watched red with
 *    the five-column row back at `md`.
 *  - **"Occasions →" (item 3)** beside the heading at 1440 and under it at 390, answering 200.
 *  - **The FAQ (item 4)**: no "All help topics", the first question open.
 *  - **Popular choices on the phone (item 5)**: two columns of five, each card exactly the width its
 *    `sizes` states. Watched red with the scroller back.
 *  - **The destination chips on the phone (item 6)**: one row that scrolls (AC-49).
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
          [...(node as HTMLSelectElement).options].map((option) => option.text),
        );
        expect(labels.length).toBe(7);

        for (const [index, label] of labels.entries()) {
          const fit = await select.evaluate((node, at) => {
            const element = node as HTMLSelectElement;
            const option = element.options[at];
            if (option === undefined) throw new Error("no option");
            // Select each destination in turn: a disabled one is enabled for the probe only, so
            // the box is measured with that label as its value (a flag flip, AC-11's case).
            option.disabled = false;
            element.selectedIndex = at;
            const style = getComputedStyle(element);
            const context = document.createElement("canvas").getContext("2d");
            if (context === null) throw new Error("no canvas");
            context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
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

test.describe("the notice bar, round 2 (TASK-232 item 1)", () => {
  for (const width of [1024, 1440] as const) {
    for (const path of ["/en-gb", "/en-gb/occasions"] as const) {
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

test.describe("the FAQ (TASK-232 item 4; A20)", () => {
  test('no "All help topics", and the first question open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/en-gb");
    const faq = page.locator("[data-fo-faq]");
    await expect(faq).not.toContainText("All help topics");
    const open_ = await faq
      .locator("details")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLDetailsElement).open),
      );
    expect(open_).toEqual([true, false, false]);
  });
});

test.describe("Popular choices on the phone (TASK-232 item 5)", () => {
  for (const width of [360, 390] as const) {
    test(`a two-column grid of five at ${String(width)}, each card its stated width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, "/en-gb");
      const cards = page.locator("[data-fo-trending-pick]");
      await expect(cards).toHaveCount(5);
      const boxes = await cards.evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          return { left: Math.round(box.left), width: box.width };
        }),
      );
      expect(new Set(boxes.map((box) => box.left)).size, "columns").toBe(2);
      // `sizes` below `md`: calc(50vw - 27px).
      for (const box of boxes) {
        expect(
          Math.abs(box.width - (width / 2 - 27)),
          "card vs sizes",
        ).toBeLessThanOrEqual(1);
      }
      const sizes = await page
        .locator("[data-fo-trending-pick] img")
        .first()
        .getAttribute("sizes");
      expect(sizes).toContain("calc(50vw - 27px)");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
    });
  }
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
