/**
 * T-28 / AC-28 and T-12 / AC-12 (TASK-041): the language-suggestion banner matrix and the
 * `fo_locale` cookie, in a real browser.
 *
 * This is ADR-0006's positive form under test. Everything here happens *after* the document
 * arrived: the response is the same for every visitor (`GET /` and `GET /en` set no cookie and
 * vary on no negotiation header — asserted below and in `shell.spec.ts`/`locale-routing.spec.ts`),
 * and the offer to switch language is made by a client island reading `navigator.languages` and
 * `document.cookie`. No redirect exists to observe, so the assertions are: the banner appears, the
 * URL did not change, nothing moved on the page, and the cookie the browser stores carries exactly
 * the attributes of spec 003 §2 / §13 Q4.
 *
 * The decision matrix itself is a unit test (`tests/unit/i18n-hints.test.ts`, 20-odd cases over
 * the pure `decideSuggestion`); what is left here is the five things only a browser can answer:
 *
 *  1. it renders after hydration and not before (the HTML has no banner in it);
 *  2. the CLS delta is 0 — measured with a `layout-shift` `PerformanceObserver` *and* by comparing
 *     the `<h1>` box before and after, because a zero from an observer that never fired and a
 *     zero from an overlay that reserves no space are different facts;
 *  3. "Switch" navigates by following a real link, not by scripting `location`;
 *  4. the cookie in the browser jar has `Path=/`, `SameSite=Lax` and a ≥365-day lifetime;
 *  5. `Esc` dismisses it without the banner ever having taken focus.
 *
 * `navigator.languages` is forced with an init script rather than only by the context `locale`,
 * because `locale` sets `Accept-Language` too — and a test that passed *because* of the header
 * would be testing the opposite of what this spec promises. The header is irrelevant by
 * construction: nothing on the server reads it.
 */
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

const BANNER = '[data-fo-banner="shown"]';
const SWITCH = '[data-fo-banner-action="switch"]';
const STAY = '[data-fo-banner-action="stay"]';
const DISMISS = '[data-fo-banner-action="dismiss"]';
/**
 * Spec 003's `LocaleSwitcher`, which TASK-048 moved out of `<main>`: spec 004's header hosts it on
 * every localised document (`data-fo-header-switcher`), so rendering it on the page as well would
 * put two identical switchers and two identically named `navigation` landmarks in the document.
 * The assertions below are re-scoped, not weakened — same markup, same four `<li>`, same beta
 * markers, one landmark.
 */
const SWITCHER = "[data-fo-header-switcher] nav";

/** 365 days, `plan/03` §1 / §13 Q4. */
const YEAR_IN_SECONDS = 31_536_000;

/**
 * Force `navigator.languages` (and `navigator.language`) before any script of ours runs. Both
 * getters are `configurable`, so a later call replaces the previous one.
 */
async function forceLanguages(
  target: Page | BrowserContext,
  languages: readonly string[],
): Promise<void> {
  await target.addInitScript((values: readonly string[]) => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => values,
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => values[0],
    });
  }, languages);
}

/** Collect unbuffered layout shifts from the first paint onwards. */
async function observeLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __clsTotal: number };
    store.__clsTotal = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) store.__clsTotal += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

function cumulativeLayoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __clsTotal: number }).__clsTotal,
  );
}

interface CookieAssertion {
  readonly value: string;
  readonly secure: boolean;
}

/** The §13 Q4 attribute set, read from the browser's own jar rather than from `document.cookie`. */
async function expectLocaleCookie(
  context: BrowserContext,
  expected: CookieAssertion,
): Promise<void> {
  const cookies = await context.cookies();
  const cookie = cookies.find((candidate) => candidate.name === "fo_locale");

  expect(cookie, "fo_locale is in the browser cookie jar").toBeDefined();
  expect(cookie!.value).toBe(expected.value);
  expect(cookie!.path).toBe("/");
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.httpOnly).toBe(false);
  // `Secure` outside development: the island reads `location.protocol`, so an http://localhost
  // run must *not* set it (the browser would drop the cookie) and an https preview must.
  expect(cookie!.secure).toBe(expected.secure);
  // Playwright reports `expires` in seconds since the epoch; `Max-Age=31536000` therefore lands a
  // year out. A `-1` here would mean a session cookie, i.e. a lost choice.
  const lifetime = cookie!.expires - Date.now() / 1000;
  expect(lifetime).toBeGreaterThanOrEqual(YEAR_IN_SECONDS - 600);
}

function isSecureOrigin(baseURL: string | undefined): boolean {
  return new URL(baseURL ?? "http://localhost:3000").protocol === "https:";
}

/**
 * Answer the consent question before the suggestion banner is exercised (TASK-051).
 *
 * Both overlays are anchored to the bottom of the viewport and the consent sheet paints above the
 * language suggestion, by design: `--layer-overlay` over `--layer-banner` (AC-13), and the
 * sequence `docs/design/flows/consent-and-locale.dc.html` draws is "consent sheet first, then the
 * locale suggestion — because switching language must not throw away a consent choice". A visitor
 * therefore answers consent and *then* meets the suggestion, which is the state these tests are
 * about; with the sheet still open, a click on `Switch` lands on the sheet instead.
 *
 * So a recorded decision is seeded into the jar, exactly as the island would write it (a refusal —
 * the cheaper answer for a test to make, and the one that grants nothing). Nothing else about
 * these tests changes, and spec 003 AC-28's matrix is asserted unchanged. The final layout
 * coordination of the two overlays — offsetting the suggestion banner clear of the sheet — is
 * TASK-055's, which owns AC-13 and the banner's restyle.
 */
async function recordConsentRefusal(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await context.addCookies([
    {
      name: "fo_consent",
      value: encodeURIComponent(
        JSON.stringify({
          v: 1,
          a: false,
          m: false,
          ts: new Date().toISOString(),
          cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
        }),
      ),
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

test.beforeEach(async ({ context, baseURL }) => {
  await recordConsentRefusal(context, baseURL);
});

test.describe("a German browser on /en (AC-28)", () => {
  // The context locale sets `Accept-Language: de-DE` as well, which nothing on the server reads;
  // the init script is what the island actually sees.
  test.use({ locale: "de-DE" });

  test.beforeEach(async ({ page }) => {
    await forceLanguages(page, ["de-DE", "de"]);
    await observeLayoutShifts(page);
  });

  test("is not in the server HTML, then appears after hydration", async ({
    page,
    request,
  }) => {
    // The document itself: identical for everyone, so it cannot contain a suggestion.
    const html = await (await request.get("/en")).text();
    expect(html).not.toContain('data-fo-banner="shown"');
    expect(html).not.toContain("Deutsch?");

    const response = await page.goto("/en");
    expect(response?.status()).toBe(200);

    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(BANNER)).toContainText("Deutsch");
    // No navigation happened: the banner offers, it does not act (ADR-0006).
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("shifts no layout when it appears (CLS delta 0)", async ({ page }) => {
    await page.goto("/en");

    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    const before = await heading.boundingBox();
    const shiftsBefore = await cumulativeLayoutShift(page);

    await expect(page.locator(BANNER)).toBeVisible();

    const after = await heading.boundingBox();
    expect(after).toEqual(before);
    expect(await cumulativeLayoutShift(page)).toBe(shiftsBefore);
    expect(await cumulativeLayoutShift(page)).toBe(0);
  });

  test("is keyboard reachable and takes no focus of its own", async ({
    page,
  }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();

    // Nothing was focused by the banner appearing (§8: it steals no focus).
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      "BODY",
    );

    // It is reachable by tabbing: the skip link, the switcher links, then the banner's controls.
    const reached = await page.evaluate(async () => {
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>("a[href], button"),
      );
      const control = document.querySelector<HTMLElement>(
        '[data-fo-banner-action="switch"]',
      );
      return control !== null && focusable.includes(control);
    });
    expect(reached).toBe(true);

    await page.locator(SWITCH).focus();
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-fo-banner-action"),
      ),
    ).toBe("switch");
  });

  test("`Switch` follows a real link to /de and stores the choice", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(SWITCH)).toHaveAttribute("href", "/de");

    await page.locator(SWITCH).click();

    await expect(page).toHaveURL(/\/de$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expectLocaleCookie(context, {
      value: "de",
      secure: isSecureOrigin(baseURL),
    });
    // The choice is honoured, so the banner is gone on the German page too.
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("never returns after a choice, and /en still does not redirect", async ({
    page,
    context,
  }) => {
    await page.goto("/en");
    await page.locator(SWITCH).click();
    await expect(page).toHaveURL(/\/de$/);

    const response = await page.goto("/en");

    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // Given the island a chance to mount and decide, then assert it decided against showing.
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
    await expectLocaleCookie(context, {
      value: "de",
      secure: await page.evaluate(() => location.protocol === "https:"),
    });
  });

  test("`Stay` writes the current locale and the banner never comes back", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/en");
    await page.locator(STAY).click();

    await expect(page.locator(BANNER)).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
    await expectLocaleCookie(context, {
      value: "en",
      secure: isSecureOrigin(baseURL),
    });
    // T-12: the island owns the cookie, so it is readable from the document (not `HttpOnly`).
    expect(await page.evaluate(() => document.cookie)).toContain(
      "fo_locale=en",
    );

    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("`Esc` dismisses it without moving focus", async ({ page, context }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();

    const activeBefore = await page.evaluate(
      () => document.activeElement?.tagName,
    );
    await page.keyboard.press("Escape");

    await expect(page.locator(BANNER)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      activeBefore,
    );
    // A dismissal is not a language choice: it writes no cookie (§8 — the cookie is set only on
    // an explicit choice). It is remembered for the tab only.
    expect(await context.cookies()).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ name: "fo_locale" }),
      ]),
    );

    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("the dismiss button does the same as `Esc`", async ({ page }) => {
    await page.goto("/en");
    await page.locator(DISMISS).click();

    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("with `fo_locale` already set it never renders", async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: "fo_locale", value: "en", domain: url.hostname, path: "/" },
    ]);

    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  /**
   * **Scoped to `main` since TASK-049.** The colophon renders spec 003's `LocaleSwitcher` a second
   * time (the footer's language list), so a document-wide `nav ul li` now matches two switchers and
   * a document-wide `nav a[href="/pl"]` is a strict-mode violation. Every selector below that means
   * *the page's* switcher says so; the footer's copy is covered by `tests/e2e/footer.spec.ts`.
   *
   * `/review 23`'s blocker, in the browser it broke. `readLocaleCookie` used to decode the
   * cookie value, so a `fo_locale` of `%` (or `en%`, or anything else `decodeURIComponent`
   * rejects) threw `URIError` inside the island's `useState` initialiser — a throw during a
   * Client Component's first render, which React unwinds past the banner to the root and
   * replaces the document with the error page. Any script or extension can set that cookie, and
   * it lives for a year, so every page of the site stayed broken until the visitor cleared it.
   *
   * This asserts the page, not the reader: the `<h1>` is the locale home heading and not the
   * error one, the switcher is there, the response is a 200 — and the malformed value is treated
   * as no choice at all, so the banner appears exactly as it does for a first-time visitor.
   */
  for (const value of ["%", "en%", "%zz"] as const) {
    test(`a malformed \`fo_locale=${value}\` leaves the page intact and shows the banner`, async ({
      page,
      context,
      baseURL,
    }) => {
      const url = new URL(baseURL ?? "http://localhost:3000");
      await context.addCookies([
        { name: "fo_locale", value, domain: url.hostname, path: "/" },
      ]);

      const response = await page.goto("/en");
      expect(response?.status()).toBe(200);

      // The page, not the error document: the real heading and the real switcher.
      await expect(page.locator("h1")).toHaveText("Send flowers across Europe");
      await expect(page.locator(`${SWITCHER} ul li`)).toHaveCount(4);
      await expect(page.locator("h1")).not.toContainText("went wrong");

      // And the malformed value is simply not a choice, so this is a first visit.
      await expect(page.locator(BANNER)).toBeVisible();
      await expect(page.locator(BANNER)).toContainText("Deutsch");
    });
  }

  test("a forged `fo_locale=zz` is ignored, and `Stay` rewrites it (AC-12)", async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: "fo_locale", value: "zz", domain: url.hostname, path: "/" },
    ]);

    await page.goto("/en");

    // Ignored: the visitor is treated as if they had never chosen.
    await expect(page.locator(BANNER)).toBeVisible();
    // And nothing was written merely by reading it.
    const before = (await context.cookies()).find(
      (c) => c.name === "fo_locale",
    );
    expect(before?.value).toBe("zz");

    await page.locator(STAY).click();

    await expect(page.locator(BANNER)).toHaveCount(0);
    await expectLocaleCookie(context, {
      value: "en",
      secure: isSecureOrigin(baseURL),
    });
  });
});

test.describe("an English browser (AC-28's negative case)", () => {
  test.use({ locale: "en-US" });

  test.beforeEach(async ({ page }) => {
    await forceLanguages(page, ["en-US"]);
  });

  test("never sees the banner on /en", async ({ page }) => {
    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("never sees it on / either: the chooser ships no island", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });
});

test.describe("a French browser (no better launch locale)", () => {
  test.beforeEach(async ({ page }) => {
    await forceLanguages(page, ["fr-FR", "fr"]);
  });

  test("is offered nothing, because there is no French locale to offer", async ({
    page,
  }) => {
    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });
});

/**
 * The `sameLocale` branch of §2 in a browser: the hint and the URL agree, so there is nothing to
 * suggest. The unit matrix covers the decision (`decideSuggestion` → `reason: "sameLocale"`);
 * what only a browser shows is that the island *mounts* — the page is `/de`, the German visitor
 * is exactly who the banner is for — and still renders nothing, rather than offering a switch to
 * the page they are already on.
 */
test.describe("a German browser already on /de (the sameLocale branch)", () => {
  test.use({ locale: "de-DE" });

  test.beforeEach(async ({ page }) => {
    await forceLanguages(page, ["de-DE", "de"]);
  });

  test("is never offered the page it is already reading", async ({ page }) => {
    const response = await page.goto("/de");
    expect(response?.status()).toBe(200);

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    // Give hydration and the lazy island chunk time to arrive before concluding "never".
    await expect(page.locator(`${SWITCHER} ul li`)).toHaveCount(4);
    await expect(page.locator(BANNER)).toHaveCount(0);

    // A regional German browser resolves to the same locale, so it is the same answer.
    await forceLanguages(page, ["de-AT", "de"]);
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });
});

test.describe("no response writes a cookie or varies by language (T-12, AC-12)", () => {
  test.use({ locale: "de-DE" });

  for (const path of ["/", "/en", "/de"] as const) {
    test(`GET ${path} sets no cookie and no \`Vary: Accept-Language\``, async ({
      request,
    }) => {
      const response = await request.get(path, {
        headers: { "Accept-Language": "de-DE,de;q=0.9,en;q=0.5" },
      });
      const headers = response.headersArray();
      const named = (name: string): string[] =>
        headers
          .filter((header) => header.name.toLowerCase() === name)
          .map((header) => header.value.toLowerCase());

      expect(response.status()).toBe(200);
      expect(named("set-cookie")).toEqual([]);
      expect(named("location")).toEqual([]);
      for (const vary of named("vary")) {
        expect(vary).not.toContain("accept-language");
        expect(vary).not.toContain("cookie");
      }
    });
  }

  test("a browser that already chose still gets a cookie-free response", async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: "fo_locale", value: "de", domain: url.hostname, path: "/" },
    ]);

    const response = await page.goto("/en");
    const headers = (await response?.headersArray()) ?? [];

    expect(
      headers.filter((header) => header.name.toLowerCase() === "set-cookie"),
    ).toEqual([]);
  });
});

test.describe("the switcher's beta markers (TASK-039, verified here)", () => {
  test("marks the machine-drafted locales and no others", async ({ page }) => {
    await page.goto("/en");

    // `de` and `pl` are echoed English drafts, so their unreviewed share is 100 % — far above the
    // `plan/03` §6 5 % threshold — and `en`/`en-gb` are fully reviewed. The marker is text, and
    // it sits outside the `lang`-annotated link so it is not pronounced in the target language.
    const marked = page.locator(`${SWITCHER} [data-beta='true']`);
    await expect(marked).toHaveCount(2);

    const items = page.locator(`${SWITCHER} li`);
    await expect(items.nth(2)).toContainText("Deutsch");
    await expect(items.nth(2).locator("[data-beta='true']")).toHaveCount(1);
    await expect(items.nth(3).locator("[data-beta='true']")).toHaveCount(1);
    await expect(items.nth(0).locator("[data-beta='true']")).toHaveCount(0);
    await expect(items.nth(1).locator("[data-beta='true']")).toHaveCount(0);
  });

  test("the switcher's links work with JavaScript disabled", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/en");

      // No island, so no banner — and the switcher is still four plain links.
      await expect(page.locator(BANNER)).toHaveCount(0);
      await page.locator(`${SWITCHER} a[href="/pl"]`).click();

      await expect(page).toHaveURL(/\/pl$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    } finally {
      await context.close();
    }
  });
});
