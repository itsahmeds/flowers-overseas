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
 *
 * **The head** (TASK-145): `body.innerText` cannot see `<head>`, and since TASK-112 the hubs, and
 * since TASK-127 the product page, render authored `seoTitle`/`seoDescription` copy there. The
 * second `describe` reads `<title>`, the meta description, the `og:`/`twitter:` copy if emitted and
 * every JSON-LD prose string of the same pages with the same patterns, and plants a claim into
 * each of three places to prove the read sees them.
 */
import { type Page, expect, test } from "@playwright/test";

import {
  HEAD_META,
  HEAD_READ,
  type HeadPlant,
  type HeadRead,
  headOffences,
  headStrings,
} from "../support/head-honesty.ts";
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

/**
 * `PAGES` and the one product page, the third page type with authored head copy
 * (`/en/poland/product/<slug>`, TASK-127). The product page is not in `PAGES` because its body is
 * the buy section's, which the body sweep's lift design does not cover (spec 009).
 */
const HEAD_PAGES: readonly { readonly type: string; readonly path: string }[] =
  [...PAGES, { type: "product page", path: "/en/poland/product/amber-hour" }];

/**
 * The page types whose documents carry JSON-LD: the locale home (`Organization`, `WebSite`) and the
 * destinations hub and corridor guide (breadcrumbs, FAQ). `JsonLd` renders it **in `<body>`**, not
 * in `<head>`, so a read of `document.head` found none on any page and the scan below passed with
 * its subject missing (`/break` round 2, hole 1). The country shop, listing, hub and product pages
 * emit none today; the day one does, add its type here.
 */
const JSON_LD_TYPES: ReadonlySet<string> = new Set([
  "home",
  "destinations hub",
  "corridor",
]);

/** Ten page types and 26 documents: dropping either a type or a row must fail a count. */
const HEAD_PAGE_TYPES = [
  "category hub",
  "corridor",
  "country category",
  "country occasion",
  "country shop root",
  "destinations hub",
  "gallery",
  "home",
  "occasion hub",
  "product page",
] as const;

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
    // The mega menu replaced the category row (spec 004 §14 A-founder-2026-10-24a item 5;
    // TASK-383): six items, and no delivery-timing entry among them while no date is open.
    await expect(page.locator("[data-fo-mega-summary]")).toHaveCount(6);
    await expect(page.locator("[data-fo-header]")).not.toContainText(
      "Same-day",
    );
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

/** The head of the served document, optionally with claims planted and restored in the same call. */
async function readHead(page: Page, plant: HeadPlant = {}): Promise<HeadRead> {
  return page.evaluate(HEAD_READ, { plant, metas: HEAD_META });
}

test.describe("A19 and AC-19: the head makes no promise or review-shaped claim either", () => {
  test("the sweep covers every page type, the product page included", () => {
    expect([...new Set(HEAD_PAGES.map(({ type }) => type))].toSorted()).toEqual(
      [...HEAD_PAGE_TYPES],
    );
    expect(HEAD_PAGES).toHaveLength(26);
  });

  for (const { type, path } of HEAD_PAGES) {
    test(`${type} ${path} — title, description, og/twitter, JSON-LD`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const read = await readHead(page);
      const strings = headStrings(read);

      // The read saw something: a title, and for every indexable type a meta description. An
      // empty read would pass the absence below with its subject missing.
      expect(read.title.trim(), path).not.toBe("");
      if (type !== "gallery") {
        expect(
          read.metas.some(({ key }) => key === "description"),
          `${path}: no meta description`,
        ).toBe(true);
      }
      // The JSON-LD half of the read saw its subject: a page known to carry blocks yields them.
      if (JSON_LD_TYPES.has(type)) {
        expect(read.jsonLd.length, `${path}: no JSON-LD read`).toBeGreaterThan(
          0,
        );
        expect(read.jsonLd.length).toBe(
          await page.locator('script[type="application/ld+json"]').count(),
        );
      }
      expect(headOffences(read), JSON.stringify(strings)).toEqual([]);
    });
  }

  test("the scan catches a claim planted into the title, the description, an og tag and a JSON-LD block", async ({
    page,
  }) => {
    await page.goto("/en/send-flowers-to/poland");
    const served = await readHead(page);
    expect(headOffences(served)).toEqual([]);

    const title = await readHead(page, {
      title: "Best sellers: roses to Poland",
    });
    expect(headOffences(title)).toEqual(["title: ranking claim"]);

    const description = await readHead(page, {
      description: "Flowers to Warsaw with same-day delivery.",
    });
    expect(headOffences(description)).toEqual([
      "description: delivery-timing claim",
    ]);

    const jsonLd = await readHead(page, {
      jsonLd: { "@type": "WebPage", description: "Order by 14:00 in Warsaw." },
    });
    expect(headOffences(jsonLd)).toEqual([
      `json-ld[${served.jsonLd.length}].description: order-by cutoff promise`,
    ]);

    // The key form, planted into `<body>` as the app renders its blocks: a rating node's values
    // are numbers, which no text pattern reads.
    const at = `json-ld[${served.jsonLd.length}]`;
    const rating = await readHead(page, {
      jsonLd: {
        "@type": "Product",
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: 4.8,
          reviewCount: 120,
        },
      },
    });
    expect(headOffences(rating)).toEqual([
      `${at}.aggregateRating: review/rating key`,
      `${at}.aggregateRating.@type: review/rating type`,
      `${at}.aggregateRating.ratingValue: review/rating key`,
      `${at}.aggregateRating.reviewCount: review/rating key`,
    ]);

    // An `og:` tag the page does not carry: the read must look for one.
    const og = await readHead(page, {
      ogTitle: "Best sellers: roses to Poland",
    });
    expect(headOffences(og)).toEqual(["og:title: ranking claim"]);

    // The read restores what it planted: the head is the one the server sent.
    expect(await readHead(page)).toEqual(served);
  });

  test("a read of `body.innerText` is blind to a planted head claim", async ({
    page,
  }) => {
    // The control's own control: the failure the head read exists to fix, shown to be real. If
    // this ever sees the claim, the body sweep already covered the head and this file is moot.
    await page.goto("/en/send-flowers-to/poland");
    const body = await page.evaluate(() => {
      const before = document.title;
      document.title = "Best sellers: roses to Poland";
      const text = document.body.innerText;
      document.title = before;
      return text;
    });
    expect(offences(body.replaceAll(/\s+/g, " "))).toEqual([]);
  });
});
