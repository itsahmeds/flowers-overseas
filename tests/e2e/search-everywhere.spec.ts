/**
 * Search everything from a field in the nav bar (spec 045 §14 A-founder-2026-11-08a; AC-38,
 * AC-39, AC-40, AC-41, AC-42, AC-43, AC-44's browser halves; T-38 to T-44; TASK-520). Runs on the
 * built site in CI under `ci:full`; the unit halves are `tests/unit/header-search.test.tsx`,
 * `search-page.test.tsx` and `search-suggest.test.ts`.
 *
 * Countries are test data here; nothing under `src/` names one.
 */
import { expect, test } from "@playwright/test";

const FIELD = "header[data-fo-header] form[role=search] input[name=q]";
const HEADER_FORM =
  "header[data-fo-header] [data-fo-header-search-field] form[role=search]";

test.describe("the header form goes straight to results (AC-38)", () => {
  for (const [path, action] of [
    ["/en", "/en/search"],
    ["/en-gb/occasions/birthday", "/en-gb/search"],
    ["/pl/kwiaty/roze", "/pl/szukaj"],
  ] as const) {
    test(`${path}: action ${action}, no to, Enter loads the results`, async ({
      page,
    }) => {
      await page.goto(path);
      const form = page.locator(HEADER_FORM);
      await expect(form).toHaveAttribute("action", action);
      await expect(form.locator('input[name="to"]')).toHaveCount(0);
      const requests: string[] = [];
      page.on("request", (request) =>
        requests.push(new URL(request.url()).pathname),
      );
      await page.locator(FIELD).first().fill("roses");
      await page.locator(FIELD).first().press("Enter");
      await page.waitForURL(`**${action}?q=roses`);
      expect(
        requests.some((pathname) =>
          /\/(choose-country|wybierz-kraj)\//u.test(pathname),
        ),
      ).toBe(false);
    });
  }

  test("/en/poland/flowers: the form carries to=pl", async ({ page }) => {
    await page.goto("/en/poland/flowers");
    await expect(page.locator(`${HEADER_FORM} input[name="to"]`)).toHaveValue(
      "pl",
    );
  });
});

test.describe("the field is visible with no interaction (AC-41, AC-42)", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`${viewport.width} px: visible, no search details, nothing overflows`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/en");
      const field = page.locator(FIELD).first();
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(
        viewport.width < 768 ? 44 : 40,
      );
      await expect(page.locator("details[data-fo-header-search]")).toHaveCount(
        0,
      );
      await expect(page.locator('[data-fo-header-item="search"]')).toHaveCount(
        0,
      );
      const button = page.locator(`${HEADER_FORM} button[type=submit]`);
      const target = await button.boundingBox();
      expect(target?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
      const band = page.locator('[data-fo-header-band="masthead"]');
      const overflow = await band.evaluate(
        (node) => node.scrollWidth - node.clientWidth,
      );
      expect(overflow).toBe(0);
      const header = await page.locator("header[data-fo-header]").boundingBox();
      expect(Math.round(header?.height ?? 0)).toBe(
        viewport.width < 768 ? 122 : 114,
      );
      if (viewport.width >= 768) {
        const pill = await page.locator(HEADER_FORM).boundingBox();
        expect(pill?.width ?? 0).toBeGreaterThanOrEqual(240);
        expect(pill?.width ?? 0).toBeLessThanOrEqual(480);
      }
    });
  }

  test("390 px: the search row stays in view after a 2,000 px scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    await page.mouse.wheel(0, 2000);
    await expect(page.locator(FIELD).first()).toBeInViewport();
  });
});

test.describe("the results page (AC-39, AC-40, AC-43)", () => {
  test("the header field holds the words and the to; one search landmark", async ({
    page,
  }) => {
    await page.goto("/en/search?q=roses&to=pl");
    await expect(page.locator(FIELD).first()).toHaveValue("roses");
    await expect(page.locator(`${HEADER_FORM} input[name="to"]`)).toHaveValue(
      "pl",
    );
    await expect(page.locator("main form[role=search]")).toHaveCount(0);
    await expect(page.getByRole("search")).toHaveCount(1);
  });

  test("no country: groups, no money, remove and change are GET forms", async ({
    page,
  }) => {
    await page.goto("/en/search?q=roses");
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/€|£|zł|\bEUR\b|\bPLN\b|\bGBP\b/u);
    await expect(
      page.locator('[data-fo-search-group="categories"] a').first(),
    ).toBeVisible();
    await page.selectOption(
      '[data-fo-search-chip-change] select[name="to"]',
      "de",
    );
    await page
      .locator("[data-fo-search-chip-change] button[type=submit]")
      .click();
    await page.waitForURL("**/en/search?q=roses&to=de");
    await page
      .locator("[data-fo-search-chip-remove] button[type=submit]")
      .click();
    await page.waitForURL("**/en/search?q=roses");
  });

  test("no href in a results state carries q=", async ({ page }) => {
    for (const url of [
      "/en/search?q=roses",
      "/en/search?q=roses&to=pl",
      "/en/search?q=delivery",
    ]) {
      await page.goto(url);
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        );
      for (const href of hrefs) expect(href, url).not.toMatch(/[?&]q=/u);
    }
  });
});

test.describe("suggestions (AC-44, AC-45)", () => {
  test("ros: a listbox of at most 6, kind words, no price; keys per APG; POST with the words in the body", async ({
    page,
  }) => {
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    await page.goto("/en");
    const field = page.locator(FIELD).first();
    await field.click();
    const asked = page.waitForRequest((request) =>
      request.url().endsWith("/api/search/suggest"),
    );
    await field.pressSequentially("ros");
    const request = await asked;
    expect(request.method()).toBe("POST");
    expect(request.postDataJSON()).toMatchObject({ locale: "en", q: "ros" });
    const listbox = page.locator("#header-search-lb");
    await expect(listbox).toBeVisible({ timeout: 1000 });
    await expect(field).toHaveAttribute("role", "combobox");
    await expect(field).toHaveAttribute("aria-expanded", "true");
    const options = listbox.locator("[role=option] a");
    expect(await options.count()).toBeLessThanOrEqual(6);
    await expect(listbox).not.toContainText(/€|£|zł|EUR|PLN|GBP/u);
    await field.press("ArrowDown");
    await expect(field).toHaveAttribute(
      "aria-activedescendant",
      "header-search-lb-0",
    );
    await field.press("ArrowUp");
    await expect(field).not.toHaveAttribute("aria-activedescendant", /./u);
    await field.press("Escape");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(field).toBeFocused();
    await field.press("Enter");
    await page.waitForURL("**/en/search?q=ros");
    for (const url of urls) {
      if (url.includes("/en/search?q=ros")) continue;
      expect(url).not.toContain("ros");
    }
  });

  test("GET /api/search/suggest answers 405", async ({ request }) => {
    const response = await request.get("/api/search/suggest?q=ros");
    expect(response.status()).toBe(405);
  });
});
