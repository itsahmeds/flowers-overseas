/**
 * **The chrome-promise sweep, served** (spec 004 §14 A19, widened by `/review 70` required change
 * 3; spec 008 AC-6 / AC-9; spec 007 AC-19. TASK-120).
 *
 * `tests/unit/chrome-honesty.test.tsx` scans the catalogues and the components. This file scans
 * the thing a buyer and a crawler actually receive, over the **whole document** rather than
 * `<main>` — which is exactly the hole `/review 70` found: TASK-091's AC-19 scan was scoped to
 * `<main>` and passed while the header promised same-day delivery two bands above it.
 *
 * Every page type that exists in Phase 0 is covered, in every locale it exists in: the four
 * locale homes, the all-destinations hub in all four locales (TASK-092's
 * `destinationsHub`, whose segment is localised: `send-flowers-to` / `blumen-verschicken` /
 * `wyslij-kwiaty`), the corridor guides (`en` and `en-gb`, the two locales with authored guide
 * files) and the component gallery, which renders every chrome surface in every state and is
 * therefore the densest single document on the site.
 *
 * The assertion is an absence, so it is only worth making if it can fail: the last test plants a
 * promise into the served DOM and requires the same scan to catch it.
 */
import { type Page, expect, test } from "@playwright/test";

import {
  FORBIDDEN_DELIVERY_PROMISE_TEXT,
  FORBIDDEN_RANKING_TEXT,
} from "../support/listing-honesty.ts";

const PATTERNS = [
  ...FORBIDDEN_RANKING_TEXT,
  ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
];

/**
 * Every Phase 0 document, by page type (`/` is a 308 to `/en` since spec 003 §14 A16),
 * `destinations hub` is TASK-092's all-destinations page (spec 007 AC-20), `country shop root` is
 * TASK-109's, the two **hubs** are TASK-112's and `/dev/components` is the component gallery.
 */
const PAGES: readonly { readonly type: string; readonly path: string }[] = [
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
  // The destination-less hubs (TASK-112). They print no money at all, so a ranking claim would
  // have nothing to rank and a delivery promise nothing to promise — which is exactly why they
  // are scanned: the chrome around them is the same chrome, and A19's sweep is whole-document.
  { type: "category hub", path: "/en/flowers/roses" },
  { type: "category hub", path: "/en-gb/flowers/roses" },
  { type: "occasion hub", path: "/en/occasions/mothers-day" },
  { type: "occasion hub", path: "/en-gb/occasions/mothers-day" },
  { type: "gallery", path: "/dev/components" },
];

function offences(rendered: string): readonly string[] {
  return PATTERNS.filter(({ pattern }) => pattern.test(rendered)).map(
    ({ name }) => name,
  );
}

/**
 * What the gallery may lift: spec 009's `live` picker and summary fixtures (TASK-126) print the
 * cutoff line the product page may print and the chrome may not. Each is marked `data-fo-cutoff`,
 * as on the page, and lifted by that mark alone, the unit honesty scan's rule.
 */
const GALLERY_LIFT = "[data-fo-product-state] [data-fo-cutoff]";

/** A line planted for the sweep's own controls: its text, its host, and whether it is marked. */
interface Plant {
  readonly into: string;
  readonly text: string;
  readonly marked: boolean;
}

/**
 * **The one read every case here makes** — the sweep and its controls alike, so a control cannot
 * pass on a read the sweep does not make. In one synchronous `evaluate`: plant the control lines,
 * hide the `lift` set, read `body.innerText`, restore, remove the plants. Never a removal that
 * outlives the call: removing a server-rendered node before React has hydrated it is a hydration
 * mismatch (React #418), and React then re-renders the tree and puts the lifted lines back before
 * a later read — the race that went red on the slower `e2e-mobile` project only (`/review 135`
 * round 1, required change 4). Nothing can interleave with this function, and the DOM it leaves
 * is the one the server sent.
 *
 * `body`, not `main`: the header's utility strip, the category row and the footer are the three
 * places TASK-120's promises lived.
 */
async function sweptText(
  page: Page,
  { lift, plant = [] }: { lift: string | null; plant?: readonly Plant[] },
): Promise<{ lifted: number; text: string }> {
  const read = await page.evaluate(
    ({ lift, plant }) => {
      const added = plant.map(({ into, text, marked }) => {
        const host = document.querySelector(into);
        if (host === null) throw new Error(`no ${into} to plant into`);
        const line = document.createElement("p");
        line.textContent = text;
        if (marked) line.setAttribute("data-fo-cutoff", "");
        host.append(line);
        return line;
      });
      const hidden =
        lift === null ? [] : [...document.querySelectorAll<HTMLElement>(lift)];
      const display = hidden.map((node) => node.style.display);
      for (const node of hidden) node.style.display = "none";
      const body = document.body.innerText;
      hidden.forEach((node, index) => {
        node.style.display = display[index] ?? "";
      });
      for (const line of added) line.remove();
      return { lifted: hidden.length, text: body };
    },
    { lift, plant },
  );
  return { lifted: read.lifted, text: read.text.replaceAll(/\s+/g, " ") };
}

test.describe("A19: no same-day, cutoff or ranking promise renders while no destination is live", () => {
  for (const { type, path } of PAGES) {
    test(`${type} ${path} — whole document, chrome included`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const { lifted, text: rendered } = await sweptText(page, {
        lift: type === "gallery" ? GALLERY_LIFT : null,
      });
      if (type === "gallery") expect(lifted).toBeGreaterThan(0);

      expect(offences(rendered), rendered.slice(0, 600)).toEqual([]);
    });
  }

  test("the header prints no dates line and the gated rows are absent", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");

    // Spec 004 §14 A23 clause 12 (TASK-193): the dates-pending line is gone with nothing in its
    // place, so on the home (no price claim) the claims read the promise alone, with no stray
    // leading `·`, and on a page with prices they open at the price claim.
    const header = await page.locator("[data-fo-header-band]").first();
    await expect(header).not.toContainText("first florist");
    await expect(header).not.toContainText("Delivery dates");
    await expect(page.locator("[data-fo-notice-claims]")).toHaveText(
      "Fresh-flower promise",
      { useInnerText: true },
    );
    await expect(page.locator('[data-fo-header-item="same-day-delivery"]')) //
      .toHaveCount(0);
    await expect(page.locator('[data-fo-header-item="our-selection"]')) //
      .toHaveCount(1);
    await expect(page.locator("footer")).not.toContainText(
      "Delivery times and cutoffs",
    );
    await page.goto("/en/poland/flowers");
    await expect(page.locator("[data-fo-notice-claims]")).toHaveText(
      "Prices include delivery and VAT · Fresh-flower promise",
      { useInnerText: true },
    );
  });

  test("the scan catches a promise planted into the served DOM", async ({
    page,
  }) => {
    await page.goto("/en");
    const { text: rendered } = await sweptText(page, {
      lift: null,
      plant: [
        {
          into: "body",
          text: "Best sellers · Order by 14:00 in Warsaw for same-day delivery",
          marked: false,
        },
      ],
    });

    expect(offences(rendered).toSorted()).toEqual(
      ["delivery-timing claim", "order-by cutoff promise", "ranking claim"] //
        .toSorted(),
    );
  });

  test("on /dev/components the lift takes a marked cutoff line and leaves an unmarked one beside it", async ({
    page,
  }) => {
    // `/break 135` round 2 HOLE 9: the gallery's own controls, through the sweep's own read. Both
    // lines sit in the same product-state box; only the mark tells them apart.
    const response = await page.goto("/dev/components");
    expect(response?.status()).toBe(200);
    const host = "[data-fo-product-state]";
    const markedLine: Plant = {
      into: host,
      text: "Order by 14:00 in Warsaw for delivery today",
      marked: true,
    };
    const unmarkedLine: Plant = {
      into: host,
      text: "Order by 14:00 in Warsaw",
      marked: false,
    };

    const served = await sweptText(page, { lift: GALLERY_LIFT });
    expect(served.lifted).toBeGreaterThan(0);
    expect(offences(served.text)).toEqual([]);

    const marked = await sweptText(page, {
      lift: GALLERY_LIFT,
      plant: [markedLine],
    });
    expect(marked.lifted).toBe(served.lifted + 1);
    expect(offences(marked.text)).toEqual([]);

    const both = await sweptText(page, {
      lift: GALLERY_LIFT,
      plant: [markedLine, unmarkedLine],
    });
    expect(both.lifted).toBe(served.lifted + 1);
    expect(offences(both.text)).toEqual(["order-by cutoff promise"]);
  });
});
