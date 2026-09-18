/**
 * **The chrome-promise sweep, served** (spec 004 §14 A19, widened by `/review 70` required change
 * 3; spec 008 AC-6 / AC-9; spec 007 AC-19. TASK-120).
 *
 * `tests/unit/chrome-honesty.test.tsx` scans the catalogues and the components. This file scans
 * the thing a buyer and a crawler actually receive, over the **whole document** rather than
 * `<main>` — which is exactly the hole `/review 70` found: TASK-091's AC-19 scan was scoped to
 * `<main>` and passed while the header promised same-day delivery two bands above it.
 *
 * Every page type that exists in Phase 0 is covered, in every locale it exists in: the locale
 * chooser, the four locale homes, the all-destinations hub in all four locales (TASK-092's
 * `destinationsHub`, whose segment is localised: `send-flowers-to` / `blumen-verschicken` /
 * `wyslij-kwiaty`), the corridor guides (`en` and `en-gb`, the two locales with authored guide
 * files) and the component gallery, which renders every chrome surface in every state and is
 * therefore the densest single document on the site.
 *
 * The assertion is an absence, so it is only worth making if it can fail: the last test plants a
 * promise into the served DOM and requires the same scan to catch it.
 */
import { expect, test } from "@playwright/test";

import {
  FORBIDDEN_DELIVERY_PROMISE_TEXT,
  FORBIDDEN_RANKING_TEXT,
} from "../support/listing-honesty.ts";

const PATTERNS = [
  ...FORBIDDEN_RANKING_TEXT,
  ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
];

/**
 * Every Phase 0 document, by page type. The locale chooser is the site root (spec 003),
 * `destinations hub` is TASK-092's all-destinations page (spec 007 AC-20), `country shop root` is
 * TASK-109's and `/dev/components` is the component gallery. Spec 008's category and occasion hubs
 * inherit this list the moment they have a URL.
 */
const PAGES: readonly { readonly type: string; readonly path: string }[] = [
  { type: "hub (locale chooser)", path: "/" },
  { type: "home", path: "/en" },
  { type: "home", path: "/en-gb" },
  { type: "home", path: "/de" },
  { type: "home", path: "/pl" },
  { type: "destinations hub", path: "/en/send-flowers-to" },
  { type: "destinations hub", path: "/en-gb/send-flowers-to" },
  { type: "destinations hub", path: "/de/blumen-verschicken" },
  { type: "destinations hub", path: "/pl/wyslij-kwiaty" },
  { type: "corridor", path: "/en/send-flowers-to/poland" },
  { type: "corridor", path: "/en-gb/send-flowers-to/poland" },
  { type: "corridor", path: "/en/send-flowers-to/germany" },
  // The country shop root (TASK-109): the first page type that prints money, and therefore the
  // first one where a ranking claim would have something to rank. Its default order is labelled
  // "Our order" with the disclosure sentence beside it and is never called a bestseller list
  // (spec 008 §2 "Sort", AC-9).
  { type: "country shop root", path: "/en/poland/flowers" },
  { type: "country shop root", path: "/en-gb/poland/flowers" },
  { type: "country shop root", path: "/de/polen/blumen" },
  { type: "country shop root", path: "/pl/polska/kwiaty" },
  // The country category (TASK-110): the densest listing document, and the one whose sibling chip
  // row prints twenty category names — the row the four forbidden chrome strings used to live in.
  // `de`/`pl` have no authored category slug yet (§13 Q10) and therefore no URL to sweep.
  { type: "country category", path: "/en/poland/flowers/roses" },
  { type: "country category", path: "/en-gb/poland/flowers/roses" },
  // The country occasion (TASK-111): the page type that prints a **date**, and therefore the one
  // where a delivery-timing promise would look most at home. The date it prints is the occasion's
  // own, never a delivery date, and no cutoff or same-day string may reach it.
  { type: "country occasion", path: "/en/poland/occasions/mothers-day" },
  { type: "country occasion", path: "/en-gb/poland/occasions/mothers-day" },
  { type: "country occasion", path: "/en/germany/occasions/mothers-day" },
  { type: "gallery", path: "/dev/components" },
];

function offences(rendered: string): readonly string[] {
  return PATTERNS.filter(({ pattern }) => pattern.test(rendered)).map(
    ({ name }) => name,
  );
}

test.describe("A19: no same-day, cutoff or ranking promise renders while no destination is live", () => {
  for (const { type, path } of PAGES) {
    test(`${type} ${path} — whole document, chrome included`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // `body`, not `main`: the header's utility strip, the category row and the footer are the
      // three places this task's promises lived.
      const rendered = (await page.locator("body").innerText()).replaceAll(
        /\s+/g,
        " ",
      );

      expect(offences(rendered), rendered.slice(0, 600)).toEqual([]);
    });
  }

  test("the header prints the honest form and the gated rows are absent", async ({
    page,
  }) => {
    await page.goto("/en");

    const header = await page.locator("[data-fo-header-band]").first();
    await expect(header).toContainText(
      "Delivery dates open when we confirm our first florist",
    );
    await expect(page.locator('[data-fo-header-item="same-day-delivery"]')) //
      .toHaveCount(0);
    await expect(page.locator('[data-fo-header-item="our-selection"]')) //
      .toHaveCount(1);
    await expect(page.locator("footer")).not.toContainText(
      "Delivery times and cutoffs",
    );
  });

  test("the scan catches a promise planted into the served DOM", async ({
    page,
  }) => {
    await page.goto("/en");
    await page.evaluate(() => {
      const planted = document.createElement("p");
      planted.textContent =
        "Best sellers · Order by 14:00 in Warsaw for same-day delivery";
      document.body.append(planted);
    });

    const rendered = (await page.locator("body").innerText()).replaceAll(
      /\s+/g,
      " ",
    );

    expect(offences(rendered).toSorted()).toEqual(
      ["delivery-timing claim", "order-by cutoff promise", "ranking claim"] //
        .toSorted(),
    );
  });
});
