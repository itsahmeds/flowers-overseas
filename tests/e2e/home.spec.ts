/**
 * T-12 / AC-10 (TASK-052, v2 by TASK-177, v3 by TASK-386 and TASK-387): the locale home, served.
 * The v1 finder, the v2 sentence picker, its promise band, occasion tiles, dated stamps and
 * trending row were retired with spec 004 §14 A-founder-2026-10-24a; the v3 home's own browser
 * cases (the picker, the first screen, the sections, the tabs, the labels) are
 * `tests/e2e/home-v3-products.spec.ts`. What stays here is what every version of the home owes:
 *
 *  - **one `<h1>` per document in all four locales**, inside the `main` landmark, and the hero
 *    photograph from `md` up (on a phone none is drawn above the first product, item 4.2);
 *  - the landmarks and the named sections;
 *  - the destinations, each with its state, a link exactly where its guide exists;
 *  - no verified-reviews section (AC-15), the FAQ's native disclosures, no cookie written;
 *  - the display-face swaps of the hero copy and the picker stay small.
 *
 * Both projects run every test: `e2e-desktop` is 1280 px and `e2e-mobile` is a Pixel 7 at 412 px,
 * so the two artboard geometries are covered without a second config.
 */
import { expect, test } from "@playwright/test";

import {
  HERO_COPY_REGION,
  ITALIC_PHRASE_REGION,
  PICKER_REGION,
  recordLayoutShifts,
  shiftInside,
} from "../support/layout-shift.ts";

const LOCALES = ["/en", "/en-gb", "/de", "/pl"] as const;

const HERO = "[data-fo-hero]";
/** TASK-054 replaced TASK-052's stand-in list with the artboards' grid, at the same id. */
const DESTINATIONS = "[data-fo-destinations]";
const REVIEWS = "[data-fo-reviews]";
/** The v3 home's product sections (`data-fo-home-section`), in DOM order. */
const SELECTION = '[data-fo-home-section="selection"]';
const OCCASIONS = '[data-fo-home-section="occasions"]';
const PRICE = '[data-fo-home-section="price"]';
const HOW_IT_WORKS = "[data-fo-how-it-works]";
const FAQ = "[data-fo-faq]";
/** The seven Phase-0 destinations of `src/config/countries.ts`, restated (AC-11). */
const DESTINATION_CODES = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"] as const;
const DESTINATIONS_COUNT = DESTINATION_CODES.length;

test.describe("the locale home, above the fold", () => {
  for (const path of LOCALES) {
    test(`${path} renders one h1 and the hero band's photograph`, async ({
      page,
      isMobile,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page.locator("main#main h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      // v3 (item 4.2): below `md` no photograph is drawn above the first product.
      if (isMobile) {
        await expect(page.locator("[data-fo-home-photo]")).toBeHidden();
        return;
      }
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
      isMobile,
    }) => {
      test.skip(isMobile, "no hero photograph below md (item 4.2)");
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
      // The picker itself never links: it is a form submission (item 4.2).
      await expect(page.locator(`[data-fo-home-picker] a[href]`)).toHaveCount(
        0,
      );
      // Spec 007 AC-20: a destination is a link exactly where its guide exists in this locale.
      // `/de` and `/pl` have none (§13 Q1), so they still link nothing at all — same markup,
      // one element different.
      // v3 (AC-73): a chip links its guide and nothing else; countries are data, so no one
      // destination gets a shop link of its own. `/de` and `/pl` have no guide, so no link.
      const expected = path === "/de" || path === "/pl" ? 0 : 7;
      await expect(page.locator(`${DESTINATIONS} a[href]`)).toHaveCount(
        expected,
      );
      if (expected > 0)
        await expect(
          page.locator(`${DESTINATIONS} [data-fo-destination="PL"] a`),
        ).toHaveAttribute("href", `${path}/send-flowers-to/poland`);
    });

    test(`${path} closes AC-10: the landmarks, the sections and one h1`, async ({
      page,
    }) => {
      await page.goto(path);

      // The three named landmarks of §5.3.
      await expect(page.locator("body > header[role='banner']")).toHaveCount(1);
      await expect(page.locator("main#main")).toHaveCount(1);
      await expect(page.locator("footer")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);

      // The v3 sections (TASK-386, TASK-387), each once.
      for (const selector of [
        SELECTION,
        OCCASIONS,
        PRICE,
        DESTINATIONS,
        HOW_IT_WORKS,
        FAQ,
      ]) {
        await expect(page.locator(selector), selector).toHaveCount(1);
      }
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
      ).toHaveCount(path === "/de" || path === "/pl" ? 0 : 7);
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
      await expect(entries).toHaveCount(3);
      // The first open on arrival, as both round-2 artboards draw it (TASK-232, QA-3 D-10); the
      // others closed.
      await expect(page.locator(`${FAQ} details[open]`)).toHaveCount(1);
      await expect(entries.first()).toHaveAttribute("open", "");

      await entries.first().locator("summary").click();
      await expect(page.locator(`${FAQ} details[open]`)).toHaveCount(0);
      await entries.nth(1).locator("summary").click();
      await expect(page.locator(`${FAQ} details[open]`)).toHaveCount(1);
      await entries.nth(1).locator("summary").click();
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
    // Choosing an occasion tab writes nothing either: the tabs are a radio group with no
    // script. The one cookie in the jar is the returning visitor's `fo_locale` the config seeds
    // (`tests/support/locale-choice.ts`), unchanged.
    await page.locator('[data-fo-occasion-tab="1"]').check({ force: true });
    expect(
      (await context.cookies()).map(({ name, value }) => ({ name, value })),
    ).toEqual([{ name: "fo_locale", value: "en" }]);
  });
});

test.describe("the home names VAT and delivery only in the one no-money line (spec 004 item 2)", () => {
  for (const path of LOCALES) {
    test(`${path} carries no other inclusion sentence anywhere in main`, async ({
      page,
    }) => {
      await page.goto(path);
      // The founder's 2026-10-04 "dont write this on home" gave way, on 2026-10-24, to item 2:
      // `shop.hub.noMoney` once, beside the picker, says why no price shows. Nowhere else.
      await expect(page.locator("main#main [data-fo-no-money]")).toHaveCount(1);
      const main = await page.locator("main#main").evaluate((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.querySelector("[data-fo-no-money]")?.remove();
        return copy.innerText || copy.textContent || "";
      });
      expect(main).not.toMatch(
        /\bVAT\b|MwSt|Mehrwertsteuer|delivery and VAT|VAT and delivery/iu,
      );
    });
  }
});

/**
 * The display face's swap stays small (spec 004 §14 A21 clause 3; TASK-177 escalation 7,
 * orchestrator ruling 2026-10-04). Measured first on the v2 sentence picker; since TASK-386 the
 * region is the v3 picker card, whose question is set in Fraunces, which the home never preloads.
 *
 * Why 0.001 and not the ruling's 0.005 (measured on `next start`, 2026-10-04, at 1280 and 390):
 * - matched fallbacks: at most 0.000055;
 * - the italic falling back to the roman face, i.e. main's fallbacks: up to 0.0030 (/pl at 1280);
 * - an unmatched stack (Georgia): up to 0.0033.
 * At 0.005 the second and third stay green, so the bound would not notice the fallback metrics
 * going away; at 0.001 they go red on at least one home.
 */
const SENTENCE_SHIFT_BOUND = 0.001;
const SENTENCE_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  // The language popup's 360 × 640 case (AC-39): there the H1's italic swap once added a line to
  // the cover's copy (0.158 in CI) until the phrase took its own line below 390 (TASK-231).
  { width: 360, height: 640 },
] as const;

/**
 * The hero copy's swap, under the same bound (TASK-231; spec 004 §14 A-founder-2026-10-14d). The
 * H1's italic phrase is Fraunces 300 italic, which A21 clause 3 never preloads, so when it swaps in
 * the balanced heading re-measures its lines: 0.00012 at 1280 on `next start`, 2026-10-15. The
 * header and consent tests exclude the hero copy with the sentence (`FONT_SWAP_REGIONS`), so this
 * is the one place that swap is measured.
 */
const SWAP_REGIONS = [
  ["the picker", PICKER_REGION],
  ["the headings' italic phrases", ITALIC_PHRASE_REGION],
  ["the hero copy", HERO_COPY_REGION],
] as const;

test.describe("the home's display-face swaps stay small", () => {
  for (const path of LOCALES) {
    for (const viewport of SENTENCE_VIEWPORTS) {
      for (const [name, region] of SWAP_REGIONS) {
        test(`${path} at ${String(viewport.width)} px: ${name} shifts by at most ${String(SENTENCE_SHIFT_BOUND)}`, async ({
          page,
        }, testInfo) => {
          await page.setViewportSize(viewport);
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "languages", {
              configurable: true,
              get: () => [],
            });
          });
          await recordLayoutShifts(page);

          const response = await page.goto(path);
          expect(response?.status()).toBe(200);
          await expect(page.locator(region).first()).toBeVisible();
          // Every face the page asked for has arrived, so the swap has happened, then two frames
          // and a settle for the entries to be reported.
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setTimeout(resolve, 500);
                });
              });
            });
          });

          const shift = await shiftInside(page, region);
          testInfo.annotations.push({
            type: "swap-shift",
            description: `${name} ${path} ${String(viewport.width)}: ${String(shift)}`,
          });
          // The measured value, in the log CI keeps, for the escalation's before/after record.
          console.log(
            `swap-shift ${name} ${path} ${String(viewport.width)} ${String(shift)}`,
          );
          expect(shift).toBeLessThanOrEqual(SENTENCE_SHIFT_BOUND);
        });
      }
    }
  }
});
