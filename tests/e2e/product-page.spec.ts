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

/** The same bouquet to a destination with no `operations` block. */
const UNAVAILABLE_PDP = "/en/germany/product/amber-hour";

/** One tier, no photograph: the common Phase 0 case. */
const NO_PHOTO_PDP = "/en/poland/product/anthurium";

test.describe("existence and the 404 shapes (AC-1, T-01)", () => {
  for (const url of [...POLAND_PDPS, UNAVAILABLE_PDP, NO_PHOTO_PDP]) {
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
      page.getByText(
        "We are still choosing florists in Germany, so we cannot offer delivery dates yet.",
      ),
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
      await expect(page.locator("[data-fo-demo-summary]")).toHaveCount(1);
      const main = (await page.locator("main").innerText()).toLowerCase();
      expect(main).not.toMatch(
        /\b(tomorrow|morgen|jutro)\b|order within|countdown/u,
      );
      expect(main).not.toMatch(/basket|warenkorb|koszyk|trustpilot|★/u);
      await expect(page.locator('main input[type="checkbox"]')).toHaveCount(0);
    });
  }

  test("the add-ons are rows with a price and a VAT rate, the card a zero line, and no input", async ({
    page,
  }) => {
    await page.goto(POLAND_PDPS[0]);
    const list = page.locator("[data-fo-addon-list]");
    await expect(list.locator("input, button, select, textarea")).toHaveCount(
      0,
    );
    const rows = list.locator("[data-fo-addon]");
    expect(await rows.count()).toBeGreaterThan(1);
    for (const row of await rows.all()) {
      await expect(row.locator("[data-fo-addon-price]")).toHaveText(/\d/u);
      await expect(row).toContainText("VAT ");
    }
    await expect(
      list.locator('[data-fo-addon="card"] [data-fo-addon-price]'),
    ).toHaveText(/^\D*0[.,]00\D*$/u);
  });
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
    await page.goto(NO_PHOTO_PDP);
    const gallery = page.locator('[data-fo-gallery="placeholder"]');
    await expect(gallery).toHaveCount(1);
    await expect(gallery.locator("img")).toHaveCount(0);
    await expect(gallery).not.toContainText("Example arrangement");
    await expect(
      page.locator('head link[rel="preload"][as="image"]'),
    ).toHaveCount(0);
  });
});

test.describe("the sticky summary is the summary's own total, docked (AC-9, the 390 px artboard)", () => {
  test("at 390 px the one total row docks at the bottom edge and the page keeps room for it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(POLAND_PDPS[0]);
    const row = page.locator("[data-fo-summary-total]");
    await expect(row).toHaveCount(1);
    await expect(page.locator("[data-fo-price-total]")).toHaveCount(1);
    await expect(row.locator("[data-fo-price-total]")).toHaveCount(1);
    expect(await row.evaluate((node) => getComputedStyle(node).position)).toBe(
      "fixed",
    );
    const box = await row.boundingBox();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
    // The bar names the size beside the amount, and the document's own padding clears it, so
    // the footer's last line is reachable above the bar.
    await expect(
      row.locator('[data-fo-summary-docked="selection"]'),
    ).toBeVisible();
    const reserved = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.body).paddingBottom),
    );
    expect(reserved).toBeGreaterThanOrEqual(
      box?.height ?? Number.POSITIVE_INFINITY,
    );
    // Above the artboard width it is back in the summary's flow, and the selection line is gone.
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await row.evaluate((node) => getComputedStyle(node).position)).toBe(
      "static",
    );
    await expect(
      row.locator('[data-fo-summary-docked="selection"]'),
    ).toBeHidden();
  });
});
