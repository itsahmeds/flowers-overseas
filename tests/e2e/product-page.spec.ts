/**
 * The product page over real requests (spec 009 §2, §5.3; AC-1, AC-7, AC-8, AC-9, AC-10, AC-20's
 * card link, AC-21, AC-22, AC-23, AC-25; T-01, T-07, T-08, T-09, T-10, T-21, T-22, T-23, T-25 e2e
 * halves; TASK-126, TASK-127).
 *
 * What only a served document can prove: which URLs answer 200 and which 404 **with no
 * `Location`**; that the picker is in the state the committed data puts it in (Poland `preview`,
 * the other six `unavailable`) in every launch locale; that a closed date's reason is in the
 * radio's **computed** accessible name, as a browser computes it; and that the hero's preload is
 * in `<head>`. The `live` state needs a florist, which no served build has — it is asserted in
 * `tests/unit/product-page.test.tsx` through spec 007's provider seam, on the same template.
 */
import { expect, test } from "@playwright/test";

import { skipsOnCaseInsensitiveHost } from "../support/case-insensitive-host.ts";

/** Amber Hour to Poland, in every launch locale: one authored slug shared by all four (§13 Q1). */
const POLAND_PDPS = [
  "/en/poland/product/amber-hour",
  "/en-gb/poland/product/amber-hour",
  "/de/polen/produkt/amber-hour",
  "/pl/polska/produkt/amber-hour",
] as const;

/**
 * Any clock time: `H:MM`, `HH:MM`, `H.MM`, `HH.MM`, `HH h MM` (`/break 151` round 1, hole 2) —
 * the unit suite's `ANY_TIME`, which proves each shape.
 */
const ANY_TIME = /(?<![\d.,])\d{1,2}(?:[:.]|\s?h\s?)\d{2}(?![\d.,])/gu;

/** A printed fee: an amount with its currency symbol or code before or after it. */
const MONEY =
  /[+\-\u2212]?(?:[£€]|PLN|EUR|GBP)\s?\d[\d.,\s\u00a0\u202f]*|[+\-\u2212]?\d[\d.,\u00a0\u202f]*[\s\u00a0\u202f]?(?:zł|PLN|EUR|GBP|€|£)/gu;

/** The same bouquet to a destination with no `operations` block. */
const UNAVAILABLE_PDP = "/en/germany/product/amber-hour";

/** One tier; photographed since TASK-168 approved photo batch 2 (it had none before). */
const ONE_TIER_PDP = "/en/poland/product/anthurium";

/**
 * The no-photograph gallery. Since TASK-168 no committed product lacks a photograph, so the
 * browser half of that state is `/dev/components`' product gallery, which renders the PDP's own
 * `Gallery` with `PRODUCT_GALLERY_PLACEHOLDER` (orchestrator ruling, 2026-10-03, TASK-168 brief);
 * the page-level branch is `tests/unit/product-page.test.tsx`'s `withoutMedia()` cases.
 */
const GALLERY_PAGE = "/dev/components";

test.describe("existence and the 404 shapes (AC-1, T-01)", () => {
  for (const url of [...POLAND_PDPS, UNAVAILABLE_PDP, ONE_TIER_PDP]) {
    test(`${url} is served`, async ({ request }) => {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
    });
  }

  test("an unknown slug, another locale's segment, an unknown country and an unknown locale 404 with no Location", async ({
    request,
  }) => {
    for (const url of [
      "/en/poland/product/no-such-bouquet",
      "/en/poland/produkt/amber-hour",
      "/pl/polska/product/amber-hour",
      "/en/atlantis/product/amber-hour",
      "/en/belgium/product/amber-hour",
      "/fr/poland/product/amber-hour",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("the trailing-slash form answers 308 to the bare product URL (§14 A7)", async ({
    request,
  }) => {
    // Spec 009 §14 A7: "trailing slash" left AC-1's 404 list. It is Next's platform-wide
    // `trailingSlash: false` redirect, as on the corridor (007 §14 A6) and listing (008 §14 A7)
    // pages: a permanent redirect whose `Location` is the bare path — never a 200 at both forms,
    // never a redirect to a guessed form. The six shapes above still 404 with no `Location`.
    for (const bare of [POLAND_PDPS[0], POLAND_PDPS[2]]) {
      const response = await request.get(`${bare}/`, { maxRedirects: 0 });
      expect(response.status(), `${bare}/`).toBe(308);
      expect(response.headers()["location"], `${bare}/`).toBe(bare);
    }
  });

  test("an uppercase variant is not a page (ADR-0006: no case-fixing rewrite)", async ({
    request,
    baseURL,
  }) => {
    test.skip(
      skipsOnCaseInsensitiveHost(baseURL),
      "case-insensitive target filesystem serves the mis-cased path from the real page's prerendered HTML",
    );
    const response = await request.get("/en/poland/product/Amber-Hour", {
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toBeUndefined();
    expect(response.status()).toBe(404);
  });

  test("a formerly on-demand product is served, and an unknown slug is the x-default 404 document with its lang (AC-3, T-03, §14 A6)", async ({
    request,
  }) => {
    // Outside the old top-24 prebuild: router 404s on a production build until A6 (TASK-127 E-1).
    for (const url of [
      "/en/poland/product/glass-morning",
      "/de/polen/produkt/glass-morning",
      "/en/poland/product/mantelpiece",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(200);
    }
    // The locale gate keeps a product 404 a real document: `not-found.tsx` in the x-default
    // locale, never the framework's bare `<html id="__next_error__">` with no language (spec 003
    // AC-8, WCAG 3.1.1) — which is what `dynamicParams = true` on the layout renders instead.
    for (const url of [
      "/en/poland/product/no-such-bouquet",
      "/de/polen/produkt/no-such-bouquet",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      const html = await response.text();
      const tag = /<html\b[^>]*>/iu.exec(html)?.[0] ?? "";
      expect(/\blang="([^"]*)"/u.exec(tag)?.[1], url).toBe("en");
      expect(tag, url).not.toContain("__next_error__");
    }
  });

  test("a listing card links to a product page that answers 200 (AC-20)", async ({
    page,
    request,
  }) => {
    await page.goto("/en/poland/flowers/roses");
    const card = page.locator('[data-fo-product-card-kind="link"] a').first();
    const href = await card.getAttribute("href");
    expect(href).toMatch(/^\/en\/poland\/product\/[a-z0-9-]+$/u);
    const response = await request.get(href ?? "", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });
});

test.describe("the picker is the data's state, in one template (AC-8, T-08)", () => {
  for (const url of POLAND_PDPS) {
    test(`${url} renders Poland's calendar as a preview: every date disabled`, async ({
      page,
    }) => {
      await page.goto(url);
      const picker = page.locator('[data-fo-picker-state="preview"]');
      await expect(picker).toHaveCount(1);
      const dates = picker.locator('input[name="date"]');
      expect(await dates.count()).toBeGreaterThan(0);
      await expect(picker.locator('input[name="date"]:enabled')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /date/iu })).toHaveCount(0);
      // Spec 009 §14 A8: `preview` states no cutoff time — only `live` does. Not as a line, and
      // not on a chip past the cutoff either (ruling E-1), whatever the clock says.
      await expect(page.locator("[data-fo-cutoff]")).toHaveCount(0);
      expect(
        (await picker.innerText()).replaceAll(MONEY, "").match(ANY_TIME),
      ).toBeNull();
      // The raw markup too, attributes included (`/break 151` round 1, hole 1): styling classes
      // are dropped and the chips' printed fees removed by their money shape, nothing else.
      const markup = await picker.evaluate((node) => {
        const copy = node.cloneNode(true) as Element;
        for (const styled of [copy, ...copy.querySelectorAll("[class]")]) {
          styled.removeAttribute("class");
        }
        return copy.outerHTML;
      });
      // `outerHTML` serialises a no-break space as an entity; the fee shape reads the character.
      expect(
        markup
          .replaceAll("&nbsp;", "\u00a0")
          .replaceAll(MONEY, "")
          .match(ANY_TIME),
      ).toBeNull();
    });
  }

  test(`${UNAVAILABLE_PDP} renders no date, no cutoff, and the honest sentence`, async ({
    page,
  }) => {
    await page.goto(UNAVAILABLE_PDP);
    await expect(
      page.locator('[data-fo-picker-state="unavailable"]'),
    ).toHaveCount(1);
    await expect(page.locator("[data-fo-date]")).toHaveCount(0);
    await expect(page.locator("[data-fo-cutoff]")).toHaveCount(0);
    await expect(
      page.getByText("Delivery dates for Germany open when ordering does."),
    ).toBeVisible();
  });
});

test.describe("a closed date says why, in its accessible name (AC-7, T-07)", () => {
  test("the Sunday rule and the shared preview sentence are in the radios' computed names", async ({
    page,
  }) => {
    await page.goto(POLAND_PDPS[0]);
    const sundays = page.getByRole("radio", {
      name: /We do not deliver on Sundays in Poland/u,
    });
    expect(await sundays.count()).toBeGreaterThan(0);
    await expect(sundays.first()).toBeDisabled();
    await expect(
      page
        .locator("[data-fo-date-why]", {
          hasText: "We do not deliver on Sundays in Poland",
        })
        .first(),
    ).toBeVisible();
    const shared = page.getByRole("radio", {
      name: /This is how delivery dates will work in Poland/u,
    });
    expect(await shared.count()).toBeGreaterThan(0);
    await expect(shared.first()).toBeDisabled();
  });
});

test.describe("one price, read-only add-ons, nothing unbacked (AC-9, AC-10, AC-21, AC-22, AC-23)", () => {
  for (const url of POLAND_PDPS) {
    test(`${url} prints one total, its rows and no relative day or countdown`, async ({
      page,
    }) => {
      await page.goto(url);
      await expect(page.locator("[data-fo-price-total]")).toHaveCount(1);
      const summary = page.locator("[data-fo-price-summary]");
      await expect(summary.locator('[data-fo-summary-row="vat"]')).toHaveCount(
        1,
      );
      await expect(
        summary.locator('[data-fo-summary-row="delivery"]'),
      ).toHaveCount(1);
      // v3 (spec 009 §14 A12): the status and the demo sentence are the buy section's action.
      await expect(
        page.locator("[data-fo-pdp-action] [data-fo-pdp-demo]"),
      ).toHaveCount(1);
      const main = (await page.locator("main").innerText()).toLowerCase();
      expect(main).not.toMatch(
        /\b(tomorrow|morgen|jutro)\b|order within|countdown/u,
      );
      expect(main).not.toMatch(/basket|warenkorb|koszyk|trustpilot|★/u);
      await expect(page.locator('main input[type="checkbox"]')).toHaveCount(0);
    });
  }

  // Spec 009 §14 A-founder-2026-10-14c, AC-34 (T-38's browser half): every add-on price in the
  // bouquet's currency, no VAT rate on a row, the card "Included", no input.
  for (const [url, symbol, foreign] of [
    ["/en/poland/product/amber-hour", "€", /zł|PLN|£/u],
    ["/en-gb/poland/product/amber-hour", "£", /zł|PLN|€/u],
    ["/pl/polska/produkt/amber-hour", "zł", /€|£|EUR|GBP/u],
    // From the 2026-10-18 site test (Q1-01: de showed złoty add-ons with "VAT 23%").
    ["/de/polen/produkt/amber-hour", "€", /zł|PLN|£/u],
  ] as const) {
    test(`${url}: the add-ons are in the bouquet's ${symbol}, with no VAT rate, the card Included, and no input`, async ({
      page,
    }) => {
      await page.goto(url);
      // With a stale rate the bouquet and every add-on quote the destination's złoty together.
      const stale =
        (await page
          .locator("[data-fo-price-summary]")
          .getAttribute("data-fo-fx-state")) === "fallback";
      const shown = stale ? "zł" : symbol;
      const other = stale ? /€|£|EUR|GBP/u : foreign;
      await expect(page.locator("[data-fo-pdp-price] bdi")).toContainText(
        stale ? /zł|PLN/u : symbol,
      );
      const list = page.locator("[data-fo-addon-list]");
      await expect(list.locator("input, button, select, textarea")).toHaveCount(
        0,
      );
      const rows = list.locator("[data-fo-addon]");
      expect(await rows.count()).toBeGreaterThan(1);
      for (const row of await rows.all()) {
        const text = await row.innerText();
        expect(text, text).not.toContain("%");
        expect(other.exec(text)?.[0], text).toBe(undefined);
        if ((await row.getAttribute("data-fo-addon")) === "card") continue;
        await expect(row.locator("[data-fo-addon-price]")).toContainText(
          shown === "zł" ? /zł|PLN/u : shown,
        );
      }
      const card = list.locator('[data-fo-addon="card"] [data-fo-addon-price]');
      await expect(card).not.toHaveText(/\d|[€£]|zł|PLN/u);
      await expect(card).not.toHaveText("");
      if (symbol !== "zł") {
        // The approved "included", its first letter set upright: it reads "Included".
        await expect(card).toHaveText(/^included$/iu);
        expect(
          await card.evaluate(
            (node) => getComputedStyle(node, "::first-letter").textTransform,
          ),
        ).toBe("uppercase");
      }
      // The section says once that its prices include VAT.
      await expect(page.locator("[data-fo-addon-vat]")).toHaveCount(1);

      // Item 8A (TASK-286): a plain ruled price list. The sentence sits above the rows, one rule
      // opens the list and one closes each row, and no row is filled, rounded, shadowed or pointed
      // at like a control, before or under the pointer.
      const vatAbove = await page
        .locator("[data-fo-addon-vat]")
        .evaluate((note) => {
          const target = document.querySelector("[data-fo-addon-list]");
          return (
            target !== null &&
            (note.compareDocumentPosition(target) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
              0
          );
        });
      expect(vatAbove).toBe(true);
      expect(
        await list.evaluate((node) => getComputedStyle(node).borderTopWidth),
      ).toBe("1px");
      for (const row of await rows.all()) {
        await row.hover();
        const look = await row.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            background: style.backgroundColor,
            radius: style.borderTopLeftRadius,
            shadow: style.boxShadow,
            cursor: style.cursor,
            rule: style.borderBottomWidth,
            top: style.borderTopWidth,
          };
        });
        expect(look).toEqual({
          background: "rgba(0, 0, 0, 0)",
          radius: "0px",
          shadow: "none",
          cursor: "auto",
          rule: "1px",
          top: "0px",
        });
      }
    });
  }
});

test.describe("one priority image with its preload, and none without a photograph (AC-25, T-25)", () => {
  test("the photographed hero is the one preloaded image", async ({ page }) => {
    await page.goto(POLAND_PDPS[0]);
    const preloads = page.locator('head link[rel="preload"][as="image"]');
    await expect(preloads).toHaveCount(1);
    await expect(
      page.locator('[data-fo-gallery="photos"] img[fetchpriority="high"]'),
    ).toHaveCount(1);
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(1);
  });

  test("the no-photo gallery renders no <img> and no honesty label", async ({
    page,
  }) => {
    // The PDP's own `Gallery` in its placeholder state, on the gallery page. That page carries
    // one deliberate `priority` image elsewhere (`MediaAsset · priority`), so the "no preload"
    // half is asserted on the gallery itself: nothing in it can be fetched, so nothing in it can
    // be nominated. The PDP's `<head>` with a photographed hero is the case above.
    await page.goto(GALLERY_PAGE);
    const gallery = page.locator('[data-fo-gallery="placeholder"]');
    await expect(gallery).toHaveCount(1);
    await expect(gallery.locator("img")).toHaveCount(0);
    await expect(gallery.locator("picture, source")).toHaveCount(0);
    await expect(gallery).not.toContainText("Example arrangement");
    await expect(gallery).toContainText("Photography to supply");
  });
});

/**
 * The two products whose photographs showed another plant (TASK-190; audit 2026-10-04 finding 15).
 * Both pairs are `rejected` in `seed/data/media.json`, so each page renders the gallery's
 * placeholder: no `<img>`, `<source>` or preload names the withdrawn assets, and nothing is
 * nominated (spec 008 §14 A11's zero, which binds the product page).
 */
const WITHDRAWN_PDPS = [
  { url: "/en/poland/product/peace-lily", asset: "fo-pt-004-" },
  { url: "/en/poland/product/olive-sapling", asset: "fo-pt-006-" },
] as const;

test.describe("a withdrawn photograph is not served, and nothing is preloaded (TASK-190; spec 006 AC-18)", () => {
  for (const { url, asset } of WITHDRAWN_PDPS) {
    test(`${url} renders the placeholder gallery, no ${asset}* image and zero preloads`, async ({
      page,
    }) => {
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.locator('[data-fo-gallery="placeholder"]')).toHaveCount(
        1,
      );
      await expect(page.locator('[data-fo-gallery="photos"]')).toHaveCount(0);
      // The asset id is the URL segment of every variant (`/media/{assetId}/…`), so no `src`,
      // `srcset`, `imagesrcset` or `href` on the page may carry it.
      await expect(
        page.locator(
          `img[src*="${asset}"], img[srcset*="${asset}"], source[srcset*="${asset}"], link[imagesrcset*="${asset}"], link[href*="${asset}"]`,
        ),
      ).toHaveCount(0);
      await expect(
        page.locator('head link[rel="preload"][as="image"]'),
      ).toHaveCount(0);
      await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(0);
    });
  }
});

test.describe('v3: the one total stays in "The price"; the phone\'s sticky element is the docked bar (AC-9, spec 009 §14 A12)', () => {
  test("at 390 px the one total row is in the flow, and the bar (asserted in product-v3.spec.ts) repeats the price", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(POLAND_PDPS[0]);
    const row = page.locator("[data-fo-summary-total]");
    await expect(row).toHaveCount(1);
    await expect(page.locator("[data-fo-price-total]")).toHaveCount(1);
    await expect(row.locator("[data-fo-price-total]")).toHaveCount(1);
    expect(await row.evaluate((node) => getComputedStyle(node).position)).toBe(
      "static",
    );
    await expect(page.locator("[data-fo-action-bar]")).toHaveCount(1);
  });
});

test.describe("the fresh-flower promise names no number of days (spec 009 §14 A11, TASK-172)", () => {
  // The served guarantee node, in four locales, for a 5-day and a 7-day product (their
  // `freshnessDays` in `src/config/catalogue/products.data.ts`): no number token equals the
  // product's `freshnessDays`. The 72-hour photo window passes; "5" or "7" fails.
  const PRODUCTS = [
    { slug: "farewell-wreath", freshnessDays: 5 },
    { slug: "amber-hour", freshnessDays: 7 },
  ] as const;
  const PREFIXES = [
    "/en/poland/product",
    "/en-gb/poland/product",
    "/de/polen/produkt",
    "/pl/polska/produkt",
  ] as const;

  for (const prefix of PREFIXES) {
    for (const { slug, freshnessDays } of PRODUCTS) {
      test(`${prefix}/${slug}: the guarantee node carries "72" and never ${String(freshnessDays)}`, async ({
        page,
      }) => {
        await page.goto(`${prefix}/${slug}`);
        const nodes = page.locator("[data-fo-pdp-trust]");
        expect(await nodes.count()).toBeGreaterThan(0);
        const text = (await nodes.allTextContents()).join(" ");
        const numbers = text.match(/\d+/gu) ?? [];
        expect(numbers).toContain("72");
        expect(numbers).not.toContain(String(freshnessDays));
      });
    }
  }
});

// Spec 009 §14 A11 bullet 1, spec 041 §6 (TASK-287): where `infoPageExists("guarantee", locale)`
// holds, the fresh-flower promise's title links to the guarantee page, and that page answers;
// in a locale without the page the trust block carries no link at all.
test.describe("the fresh-flower promise links to the guarantee page where it exists (TASK-287)", () => {
  for (const [url, href] of [
    ["/en/poland/product/amber-hour", "/en/guarantee"],
    ["/en-gb/poland/product/amber-hour", "/en-gb/guarantee"],
  ] as const) {
    test(`${url}: the promise links to ${href}`, async ({ page }) => {
      await page.goto(url);
      const links = page.locator("[data-fo-pdp-trust] a");
      await expect(links).toHaveCount(1);
      const link = page.locator("[data-fo-pdp-trust] h3 a");
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveText("Fresh-flower promise");
      const response = await page.request.get(href);
      expect(response.status(), href).toBe(200);
    });
  }

  for (const url of [
    "/de/polen/produkt/amber-hour",
    "/pl/polska/produkt/amber-hour",
  ] as const) {
    test(`${url}: no guarantee page in the locale, so the promise is plain text`, async ({
      page,
    }) => {
      await page.goto(url);
      const trust = page.locator("[data-fo-pdp-trust]");
      await expect(trust).toHaveCount(1);
      await expect(trust).toContainText("72");
      await expect(trust.locator("a")).toHaveCount(0);
    });
  }
});
