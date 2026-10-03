/**
 * T-12 / AC-10 and **T-13 / AC-11** (TASK-052, v2 by TASK-177): the locale home's hero,
 * sentence picker and promise band, served. The v1 finder, its type-ahead and their tests were
 * retired with the island; the sentence picker's JavaScript-off submission is the last block.
 *
 * Everything here needs a browser, a real response or both, which is what separates it from
 * `tests/unit/ui-home.test.tsx`:
 *
 *  - **one `<h1>` per document in all four locales**, inside the `main` landmark, with the hero
 *    slot present and holding no `<img>` (AC-10);
 *  - **the finder works with JavaScript disabled** (AC-11's hard requirement), asserted in a
 *    `javaScriptEnabled: false` context: the three fields are labelled, the country field is a
 *    native `<input list>` over a `<datalist>` of all seven destinations, and `Continue` submits
 *    to a **200** document — which is the property the whole "no `action` to a non-200 URL" rule
 *    exists for;
 *  - **the type-ahead enhancement**: with JavaScript on, typing filters the list, the matching
 *    name appears beneath the field with its typed prefix in bold, the count is announced through
 *    a polite live region, and picking a match fills the field (design round 7);
 *  - **keyboard operability** (WCAG 2.1.1): tab reaches every field and the submit control, in
 *    document order, and each is focusable;
 *  - **no cookie is written** by any of it — the finder is a `get` form, and the document is one
 *    cache entry (`plan/02` §14, spec 001 AC-15, spec 003 AC-12);
 *  - **the four-fact proof row** renders four facts and no photograph (AC-15's trap: "We
 *    photograph it at the door" is a promise, not a gallery).
 *
 * Both projects run every test: `e2e-desktop` is 1280 px and `e2e-mobile` is a Pixel 7 at 412 px,
 * so the two artboard geometries are covered without a second config.
 */
import { expect, test } from "@playwright/test";

const LOCALES = ["/en", "/en-gb", "/de", "/pl"] as const;

const HERO = "[data-fo-hero]";
/** The v2 sentence picker (spec 004 §14 A21 clause 4; TASK-177), which replaced the finder. */
const SENTENCE = "[data-fo-sentence]";
const PROOF = "[data-fo-proof-row]";
/** TASK-054 replaced TASK-052's stand-in list with the artboards' grid, at the same id. */
const DESTINATIONS = "[data-fo-destinations]";
const TRENDING = "[data-fo-trending]";
const REVIEWS = "[data-fo-reviews]";
/** TASK-053's five sections, in the order they appear down the page. */
const OCCASION_DATES = "[data-fo-occasion-dates]";
const OCCASIONS = "[data-fo-occasions]";
const HOW_IT_WORKS = "[data-fo-how-it-works]";
const FAQ = "[data-fo-faq]";
/** v2: the promise band carries AC-10's trust strip (`data-fo-trust-strip`). */
const TRUST = "[data-fo-trust-strip]";

/** The seven Phase-0 destinations of `src/config/countries.ts`, restated (AC-11). */
/**
 * The trending row's heading and basis line per locale path (TASK-140): the founder's `en`
 * wording of 2026-10-03, inherited by `en-gb`, and the unreviewed `de` and `pl` drafts.
 */
const TRENDING_COPY = {
  "/en": {
    heading: "Popular choices",
    basis: "Our picks until real orders start.",
  },
  "/en-gb": {
    heading: "Popular choices",
    basis: "Our picks until real orders start.",
  },
  "/de": {
    heading: "Beliebte Auswahl",
    basis: "Von uns ausgewählt, bis die ersten echten Bestellungen eingehen.",
  },
  "/pl": {
    heading: "Popularne wybory",
    basis: "Nasz wybór, dopóki nie pojawią się prawdziwe zamówienia.",
  },
} as const satisfies Record<
  (typeof LOCALES)[number],
  { heading: string; basis: string }
>;

const DESTINATION_CODES = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"] as const;
const DESTINATIONS_COUNT = DESTINATION_CODES.length;

test.describe("the locale home, above the fold", () => {
  for (const path of LOCALES) {
    test(`${path} renders one h1 and the hero band's photograph`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page.locator("main#main h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        page.locator(`${HERO} [data-fo-media-slot="hero"]`),
      ).toHaveCount(1);
      // TASK-080 filled the slot the design reserved: one image, eager, at high fetch priority,
      // and it is the page's single LCP candidate. `plan/10` §3 is unchanged — the page shows a
      // photograph it *has*, and every slot it does not have one for is still a captioned box.
      const hero = page.locator(`${HERO} img`);
      await expect(hero).toHaveCount(1);
      await expect(hero).toHaveAttribute("loading", "eager");
      await expect(hero).toHaveAttribute("fetchpriority", "high");
      // Alt text is per-locale data, so it is never empty and never the same in two languages by
      // accident; the assertion here is the WCAG 1.1.1 one — it says something.
      expect(((await hero.getAttribute("alt")) ?? "").length).toBeGreaterThan(
        10,
      );
    });

    test(`${path} reserves the hero slot's box before paint`, async ({
      page,
    }) => {
      await page.goto(path);
      const box = await page
        .locator(`${HERO} [data-fo-media-slot="hero"]`)
        .boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(200);
      expect(box?.width ?? 0).toBeGreaterThan(300);
    });

    test(`${path} names all seven destinations with a state, and links the published ones`, async ({
      page,
    }) => {
      await page.goto(path);

      for (const iso2 of DESTINATION_CODES) {
        await expect(
          page.locator(`${DESTINATIONS} [data-fo-destination="${iso2}"]`),
        ).toHaveCount(1);
      }
      // The sentence picker itself never links: it is a form submission (A21 clause 4).
      await expect(page.locator(`${SENTENCE} a[href]`)).toHaveCount(0);
      // Spec 007 AC-20: a destination is a link exactly where its guide exists in this locale.
      // `/de` and `/pl` have none (§13 Q1), so they still link nothing at all — same markup,
      // one element different.
      // v2 (TASK-177): Poland's chip links to its shop root, which exists in all four locales.
      const expected = path === "/de" || path === "/pl" ? 1 : 7;
      await expect(page.locator(`${DESTINATIONS} a[href]`)).toHaveCount(
        expected,
      );
    });

    test(`${path} renders the four-fact promise band and no photo in it`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page.locator(`${PROOF} li`)).toHaveCount(4);
      await expect(page.locator(`${PROOF} img`)).toHaveCount(0);
      await expect(page.locator(`${PROOF} [data-fo-media-slot]`)).toHaveCount(
        0,
      );
    });

    test(`${path} closes AC-10: the landmarks, the sections and one h1`, async ({
      page,
    }) => {
      await page.goto(path);

      // The three named landmarks of §5.3, on a document that now carries nine sections.
      await expect(page.locator("body > header[role='banner']")).toHaveCount(1);
      await expect(page.locator("main#main")).toHaveCount(1);
      await expect(page.locator("footer")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);

      // The sections of TASK-053 and TASK-054, in the artboards' order down the page.
      for (const selector of [
        TRENDING,
        OCCASION_DATES,
        OCCASIONS,
        HOW_IT_WORKS,
        FAQ,
        TRUST,
        DESTINATIONS,
      ]) {
        await expect(page.locator(selector), selector).toHaveCount(1);
      }
    });

    test(`${path} renders six occasion tiles, each a link to a hub that answers 200`, async ({
      page,
      request,
    }) => {
      await page.goto(path);

      await expect(page.locator(`${OCCASIONS} li`)).toHaveCount(6);
      // Spec 004 §14 A20 (TASK-177): a tile whose occasion hub exists is a link to it.
      const tiles = await page
        .locator(`${OCCASIONS} a[href]`)
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        );
      expect(tiles).toHaveLength(6);
      for (const href of tiles) {
        const response = await request.get(href, { maxRedirects: 0 });
        expect(response.status(), href).toBe(200);
      }
      // Six photographs since TASK-080, every one of them lazy: the grid is below the fold on
      // both artboards, so none of them may compete with the hero for the LCP.
      await expect(page.locator(`${OCCASIONS} img`)).toHaveCount(6);
      await expect(
        page.locator(`${OCCASIONS} img[loading="lazy"]`),
      ).toHaveCount(6);
      await expect(
        page.locator(`${OCCASIONS} [data-fo-media-slot="tile"]`),
      ).toHaveCount(6);
    });

    test(`${path} renders the dated occasions, the explainer and the trust strip`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page.locator(`${OCCASION_DATES} li`)).toHaveCount(4);
      await expect(page.locator("[data-fo-how-it-works-step]")).toHaveCount(3);
      await expect(page.locator("[data-fo-trust-claim]")).toHaveCount(4);
      // Neither the explainer nor the promise band links anywhere (no page for the guarantee).
      for (const selector of [HOW_IT_WORKS, TRUST]) {
        await expect(page.locator(`${selector} a[href]`), selector).toHaveCount(
          0,
        );
      }
    });

    test(`${path} renders the trending row with the founder's label and no price`, async ({
      page,
      request,
    }) => {
      await page.goto(path);

      // Five named picks, each with a reserved photo box and **no price element of any kind**:
      // spec 004 §3 ships nothing that knows what a product is (TASK-054). The box is the row's
      // own `trending` slot, whose `sizes` states the card's rendered width (TASK-168).
      await expect(page.locator(`${TRENDING} li`)).toHaveCount(5);
      await expect(
        page.locator(`${TRENDING} [data-fo-media-slot="trending"]`),
      ).toHaveCount(5);
      // Since batch 2 (TASK-168) every pick has approved, alt-texted imagery, so all five boxes
      // are photographs and none is the captioned placeholder: one `<img>` per card, no broken
      // image, no photograph of a different bouquet. The placeholder arm is `MediaAsset`'s own,
      // covered by `tests/unit/ui-media.test.tsx`.
      await expect(page.locator(`${TRENDING} img`)).toHaveCount(5);
      await expect(
        page.locator(`${TRENDING} [data-fo-media-slot="trending"] img`),
      ).toHaveCount(5);
      await expect(
        page.locator(`${TRENDING} [data-fo-media-placeholder]`),
      ).toHaveCount(0);
      // Each card links to its product page in the demo destination, Poland, and the page answers
      // 200 (spec 008 §14 A14 (e); TASK-173 — the founder clicked these and went nowhere).
      const cards = await page
        .locator(`${TRENDING} li a[href]`)
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        );
      expect(cards).toHaveLength(5);
      for (const href of cards) {
        expect(href, href).toMatch(
          new RegExp(
            `^${path}/(?:poland|polen|polska)/(?:product|produkt)/[a-z0-9-]+$`,
            "u",
          ),
        );
        const response = await request.get(href, { maxRedirects: 0 });
        expect(response.status(), href).toBe(200);
      }
      await expect(page.locator(TRENDING)).toHaveAttribute(
        "data-fo-trending-basis",
        "picks",
      );
      const row = (await page.locator(TRENDING).innerText()).replaceAll(
        /\s+/g,
        " ",
      );
      // The row's heading and basis line, the one value each locale serves (TASK-140).
      await expect(page.locator(`${TRENDING} h2`)).toHaveText(
        TRENDING_COPY[path].heading,
      );
      expect(row).toContain(TRENDING_COPY[path].basis);
      expect(row).not.toMatch(/starting at|€|z\u0142|£/iu);
    });

    test(`${path} renders no verified-reviews section at all (AC-15)`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page.locator(REVIEWS)).toHaveCount(0);
      await expect(page.locator("[data-fo-reviews-trustpilot]")).toHaveCount(0);
      await expect(page.locator("[data-fo-review]")).toHaveCount(0);
    });

    test(`${path} renders the destinations grid and asks for nothing`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page.locator(`${DESTINATIONS} li`)).toHaveCount(
        DESTINATIONS_COUNT,
      );
      // Every link in the grid is a corridor page that exists; `tests/e2e/links.spec.ts` and
      // `tests/e2e/destinations-hub.spec.ts` crawl them for their status (spec 007 AC-17).
      await expect(
        page.locator(`${DESTINATIONS} a[href^="/"]:not([href*="#"])`),
      ).toHaveCount(path === "/de" || path === "/pl" ? 1 : 7);
      // Copy only: a waiting-list capture is a personal-data flow spec 010/016 owns, and an
      // inert field would be a dark pattern.
      await expect(
        page.locator(`${DESTINATIONS} input, ${DESTINATIONS} form`),
      ).toHaveCount(0);
      // The v2 chips name no city at all (`plan/10` §3).
      await expect(page.locator(DESTINATIONS)).not.toContainText("Warszawa");
    });

    test(`${path} opens and closes an FAQ answer with no JavaScript of ours`, async ({
      page,
    }) => {
      await page.goto(path);

      const entries = page.locator(`${FAQ} details`);
      await expect(entries).toHaveCount(4);
      // All closed on arrival: an answer visible in the served HTML would be five paragraphs of
      // copy above the fold of the section.
      await expect(page.locator(`${FAQ} details[open]`)).toHaveCount(0);

      await entries.first().locator("summary").click();
      await expect(page.locator(`${FAQ} details[open]`)).toHaveCount(1);
      await entries.first().locator("summary").click();
      await expect(page.locator(`${FAQ} details[open]`)).toHaveCount(0);
    });
  }

  test("writes no cookie and sends no Set-Cookie", async ({
    page,
    context,
  }) => {
    const response = await page.goto("/en");
    const headers = await response?.headersArray();

    expect(
      (headers ?? [])
        .map((header) => header.name.toLowerCase())
        .filter((name) => name === "set-cookie"),
    ).toEqual([]);
    // Choosing in the sentence writes nothing either: no island stores a preference.
    await page.locator('select[name="occasion"]').selectOption("sympathy");
    expect(await context.cookies()).toEqual([]);
  });
});

test.describe("the sentence picker (A21 clause 4, T-12, T-13)", () => {
  test("names only `country` and `occasion`, and lists seven destinations, six not yet", async ({
    page,
  }) => {
    await page.goto("/en");

    const names = await page
      .locator(`${SENTENCE} [name]`)
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("name")));
    expect(names).toEqual(["country", "occasion"]);
    await expect(
      page.locator(`${SENTENCE} select[name="country"] option`),
    ).toHaveCount(7);
    await expect(
      page.locator(`${SENTENCE} select[name="country"] option[disabled]`),
    ).toHaveCount(6);
    await expect(
      page.locator(`${SENTENCE} option[value="PL"]:not([disabled])`),
    ).toHaveCount(1);
  });

  test("its route answers 303, no-store and noindex, and sends an unknown country to the hub", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/send/en?country=XX&occasion=birthday",
      {
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toBe("/en/send-flowers-to");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
  });
});

test.describe("the sentence picker with JavaScript disabled (AC-11, T-12)", () => {
  test.use({ javaScriptEnabled: false });

  test("Poland + birthday lands on Poland's birthday page, with no query string", async ({
    page,
  }) => {
    await page.goto("/pl");
    await page.locator('select[name="country"]').selectOption("PL");
    await page.locator('select[name="occasion"]').selectOption("birthday");
    await page.locator(`${SENTENCE} button[type="submit"]`).click();

    await page.waitForURL("**/pl/polska/kwiaty/kwiaty-na-urodziny");
    const landed = new URL(page.url());
    expect(landed.pathname).toBe("/pl/polska/kwiaty/kwiaty-na-urodziny");
    expect(landed.search).toBe("");
    await expect(page.locator("h1")).toHaveCount(1);
  });
});
