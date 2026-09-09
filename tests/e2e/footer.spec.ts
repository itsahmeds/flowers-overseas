/**
 * T-11 (browser half) / AC-9, and the footer's share of AC-14 and §8 (TASK-049).
 *
 * Runs in both Playwright e2e projects, so every assertion below is made at the mobile artboard
 * (Pixel 7) *and* the desktop one — the colophon is the component with the most collapsing to do
 * between the two canvases, and "the payment sentence is present on desktop only" is exactly the
 * class of regression a desktop-only suite misses.
 *
 * All four locales, because the copy is per catalogue and `de`/`pl` are machine drafts: a key that
 * failed to resolve renders as the key itself, which the `data-fo-*` -free assertions below would
 * not catch but the copy assertions do.
 *
 * What is deliberately **not** here: the cookie-settings control actually re-opening the consent
 * banner. AC-9's re-open clause is wired by TASK-051, which owns the islands; this file asserts
 * that the control exists, is keyboard reachable and carries the attribute the island binds to,
 * and TASK-051 adds the behavioural half.
 */
import { expect, test } from "@playwright/test";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** Copy that must appear in the footer of every locale, from `messages/<locale>.json`. */
const REQUIRED_TEXT: Record<(typeof LOCALES)[number], readonly string[]> = {
  en: ["Sending", "Company", "Cookie settings", "Stripe"],
  "en-gb": ["Sending", "Company", "Cookie settings", "Stripe"],
  // `de`/`pl` are `pnpm i18n:draft` echoes of the English source today (§7), so the brand name is
  // the locale-independent anchor; the per-locale copy is asserted by the visual baselines.
  de: ["Stripe"],
  pl: ["Stripe"],
};

for (const locale of LOCALES) {
  test.describe(`/${locale} footer`, () => {
    test("is a single `contentinfo` landmark with the colophon's parts", async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      const footer = page.getByRole("contentinfo");
      await expect(footer).toHaveCount(1);
      for (const text of REQUIRED_TEXT[locale]) {
        await expect(footer).toContainText(text);
      }
      // The link columns and the legal row are named navigation landmarks.
      expect(
        await footer.locator("nav[aria-labelledby], nav[aria-label]").count(),
      ).toBeGreaterThanOrEqual(3);
    });

    test("renders every unpublished target as text and links to no non-200 URL (AC-14)", async ({
      page,
      request,
    }) => {
      await page.goto(`/${locale}`);
      const hrefs = await page
        .getByRole("contentinfo")
        .locator("a[href]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        );

      // Only the language list and the `tel:` channel carry a URL in Phase 0.
      const internal = hrefs.filter((href) => href.startsWith("/"));
      expect(internal.length).toBeGreaterThan(0);
      for (const href of internal) {
        const response = await request.get(href, { maxRedirects: 0 });
        expect(response.status(), href).toBe(200);
      }
      for (const href of hrefs) {
        expect(href, href).not.toBe("#");
        expect(href, href).not.toBe("");
      }
      // No disabled-looking control stands in for an unpublished page.
      expect(
        await page
          .getByRole("contentinfo")
          .locator("a[aria-disabled], [role=link][aria-disabled]")
          .count(),
      ).toBe(0);
    });

    test("states no company registry data and no payment method (AC-9, §8)", async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      const text = (await page.getByRole("contentinfo").innerText()) ?? "";

      for (const forbidden of [
        "OÜ",
        "[COMPANY LEGAL NAME]",
        "[REGISTERED ADDRESS]",
        "[REGISTRATION NO]",
        "BLIK",
        "Klarna",
        "PayPal",
        "Visa",
        "Mastercard",
        "Apple Pay",
        "Trustpilot",
      ]) {
        expect(text, forbidden).not.toContain(forbidden);
      }
      // No third-party logo, and no image at all: the only vector in the footer is our own mark.
      expect(await page.getByRole("contentinfo").locator("img").count()).toBe(
        0,
      );
    });

    test("carries the cookie-settings control, keyboard reachable (AC-9)", async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      const control = page
        .getByRole("contentinfo")
        .locator("button[data-fo-consent-reopen]");
      await expect(control).toHaveCount(1);
      await expect(control).toBeVisible();
      await control.focus();
      await expect(control).toBeFocused();
      // ≥44 px tap target (§5.3).
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  });
}

test.describe("the occasion-reminder signup (design round 6)", () => {
  test("submits without JavaScript, stores nothing and returns to the footer", async ({
    browser,
  }) => {
    // The whole point of a plain form: it works with scripting off (§14 A1's zero-JS footer).
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en");

    await page.locator("#footer-reminder-email").fill("someone@example.test");
    await Promise.all([
      page.waitForURL(/\/en(?:#footer-reminders)?$/),
      page.getByRole("button", { name: "Remind me" }).click(),
    ]);

    // Back on the locale home, and not one cookie was set by the round trip.
    expect(new URL(page.url()).pathname).toBe("/en");
    expect(await context.cookies()).toEqual([]);
    await context.close();
  });

  test("refuses a body that is not a form post and never 5xxs on a bad one", async ({
    request,
  }) => {
    const asJson = await request.post("/api/reminders", {
      data: { email: "a@b.test" },
    });
    expect(asJson.status()).toBe(415);

    const invalid = await request.post("/api/reminders", {
      form: { email: "not-an-email", locale: "en" },
    });
    expect(invalid.status()).toBe(400);

    const unknownLocale = await request.post("/api/reminders", {
      form: { email: "a@b.test", locale: "fr" },
    });
    expect(unknownLocale.status()).toBe(400);
  });

  test("is never cached and never indexed", async ({ request }) => {
    const response = await request.post("/api/reminders", {
      form: { email: "a@b.test", locale: "en" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(response.headers()["location"]).toBe("/en#footer-reminders");
  });
});

test.describe("the footer adds no client JavaScript (§14 A1)", () => {
  test("the locale document still works entirely without scripting", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/de");
    expect(response?.status()).toBe(200);

    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    // The language list is four plain links: navigation, not a handler.
    await expect(
      footer.locator('nav[aria-label] a[href="/pl"]').first(),
    ).toBeVisible();
    await context.close();
  });
});

test.describe("the colophon's canvas metrics (`/review 30` item 4)", () => {
  /**
   * The four numbers `/review 30` measured as drift, asserted from the browser's own computed
   * values so they cannot drift back. Both e2e projects run this file, and the two artboards
   * disagree on every one of them, so each expectation is read from the viewport: `e2e-desktop`
   * (1280 px) is past the `md` breakpoint and gets the desktop artboard's numbers, `e2e-mobile`
   * (Pixel 7, 412 px) the mobile one's.
   *
   * Why computed styles rather than a screenshot: the visual baselines catch *any* change but
   * name none, and the wordmark in particular is an arbitrary-value utility (`text-[26px]`)
   * overriding a token class (`text-xl`) on the same element — a cascade order that a Tailwind
   * upgrade could reverse silently. This test names the canvas value that has to win.
   */
  test("sets the canvas's footer padding, wordmark, legal row and grid gaps", async ({
    page,
  }) => {
    await page.goto("/en");
    const wide = (page.viewportSize()?.width ?? 0) >= 768;

    const metrics = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) throw new Error("no footer");
      const block = footer.firstElementChild as HTMLElement;
      const stack = block.firstElementChild as HTMLElement;
      const grid = stack.firstElementChild as HTMLElement;
      const legal = stack.lastElementChild as HTMLElement;
      const wordmark = footer.querySelector(".display") as HTMLElement;
      const style = window.getComputedStyle;
      return {
        padBlockStart: style(block).paddingBlockStart,
        padInline: style(block).paddingInlineStart,
        padBlockEnd: style(block).paddingBlockEnd,
        wordmark: style(wordmark).fontSize,
        legal: style(legal).fontSize,
        gridColumnGap: style(grid).columnGap,
        gridRowGap: style(grid).rowGap,
      };
    });

    // `40px 56px 24px` (desktop artboard) / `32px 20px 20px` (mobile artboard), verbatim.
    expect(metrics.padBlockStart).toBe(wide ? "40px" : "32px");
    expect(metrics.padInline).toBe(wide ? "56px" : "20px");
    expect(metrics.padBlockEnd).toBe(wide ? "24px" : "20px");
    // The colophon wordmark is the one place the canvas fixes both ends of the type scale.
    expect(metrics.wordmark).toBe(wide ? "26px" : "22px");
    // `--text-xs`: one size for the whole legal row, links and language list alike.
    expect(metrics.legal).toBe("11px");
    // 40 px between the desktop columns; 16 px between the two mobile link columns, with the
    // stacked blocks a scale step (24 px) apart — the artboard's 22 px rounded to the token.
    expect(metrics.gridColumnGap).toBe(wide ? "40px" : "16px");
    expect(metrics.gridRowGap).toBe(wide ? "40px" : "24px");
  });
});
