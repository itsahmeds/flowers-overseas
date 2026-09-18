/**
 * T-28 / AC-28 and T-12 / AC-12, as spec 003 §14 A14 reshaped them (TASK-041, TASK-119): the
 * locale suggestion **popup** and the `fo_locale` cookie, in a real browser.
 *
 * This is ADR-0006's positive form under test, and the founder's 2026-09-16 ruling inside it.
 * Everything here happens *after* the document arrived: the response is the same for every
 * visitor — asserted below with and without `Accept-Language` **and** with and without
 * `cf-ipcountry` — and the offer to switch language is made by a client island that decides from
 * `navigator.languages`, `document.cookie` and, only when those say nothing, a country fetched
 * from `GET /api/geo`. No redirect exists to observe, so the assertions are: the dialog appears,
 * the URL did not change, nothing moved on the page, one tap goes back, and the cookie the
 * browser stores carries exactly the attributes of §13 Q4.
 *
 * The decision matrix itself is a unit test (`tests/unit/i18n-hints.test.ts`, 40-odd cases over
 * the pure `decideSuggestion`); what is left here is what only a browser can answer:
 *
 *  1. it renders after hydration and not before (the HTML has no dialog in it);
 *  2. the CLS delta is 0 — measured with a `layout-shift` `PerformanceObserver` *and* by comparing
 *     the `<h1>` box before and after, because a zero from an observer that never fired and a zero
 *     from a top-layer dialog are different facts;
 *  3. "Continue" navigates by following a real link, not by scripting `location`;
 *  4. `Esc` is "stay" — it records the current locale rather than leaving the question open;
 *  5. the cookie in the browser jar has `Path=/`, `SameSite=Lax` and a ≥365-day lifetime;
 *  6. the country pass happens **only** when the languages found nothing, and never on a page the
 *     visitor's own languages already match;
 *  7. the consent sheet waits for the dialog and then appears.
 *
 * `navigator.languages` is forced with an init script rather than only by the context `locale`,
 * because `locale` sets `Accept-Language` too — and a test that passed *because* of the header
 * would be testing the opposite of what this spec promises. The header is irrelevant by
 * construction: nothing on the server reads it.
 */
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

const BANNER = '[data-fo-banner="shown"]';
const CONTINUE = '[data-fo-banner-action="continue"]';
const STAY = '[data-fo-banner-action="stay"]';
const CONSENT = "[data-fo-consent]";
/**
 * Spec 003's `LocaleSwitcher`, which TASK-048 moved out of `<main>`: spec 004's header hosts it on
 * every localised document (`data-fo-header-switcher`), so a document-wide selector would match
 * two switchers (the footer renders one too).
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

/**
 * Answer `GET /api/geo` with a country, as an edge network in front of the app would.
 *
 * The route itself is unit-tested against real headers (`tests/unit/geo-route.test.ts`); a local
 * `pnpm start` sits behind no edge network, so the only way to exercise the *island's* country
 * pass in a browser is to fulfil the request the island makes. The shape fulfilled here is the
 * route's own shape, and the unit test is what keeps the two honest.
 */
async function answerGeoWith(
  page: Page,
  country: string | null,
): Promise<void> {
  await page.route("**/api/geo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ country }),
    });
  });
}

/** Record every `/api/geo` request the page makes, so "it never asked" is assertable. */
function recordGeoRequests(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/geo")) asked.push(request.url());
  });
  return asked;
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
 * Answer the consent question before the suggestion is exercised (TASK-051).
 *
 * Since TASK-119 the language dialog is shown **first** and the consent sheet waits for it (spec
 * 003 §14 A14), so a test about the dialog does not need the sheet out of the way — but a test
 * about the dialog's *actions* does, because after the dialog closes the sheet appears over the
 * page. Seeding a recorded refusal keeps these tests about one overlay at a time; the sequencing
 * itself has its own describe block at the end of the file.
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
    // The document itself: identical for everyone, so it renders no suggestion…
    const html = await (await request.get("/en")).text();
    expect(html).not.toContain('data-fo-banner="shown"');

    // …and identical *is* the claim, so it is asserted as byte equality across both hints the
    // island may use: the language header and the edge country header (AC-7, AC-9, T-09).
    const neutral = await request.get("/en", {
      headers: { "accept-language": "" },
    });
    const german = await request.get("/en", {
      headers: { "accept-language": "de-DE,de;q=0.9", "cf-ipcountry": "DE" },
    });
    expect(await neutral.text()).toBe(html);
    expect(await german.text()).toBe(html);
    for (const response of [neutral, german]) {
      expect(response.status()).toBe(200);
      const headers = response.headersArray();
      const named = (name: string): string[] =>
        headers
          .filter((header) => header.name.toLowerCase() === name)
          .map((header) => header.value.toLowerCase());
      expect(named("location")).toEqual([]);
      expect(named("set-cookie")).toEqual([]);
      for (const vary of named("vary")) {
        expect(vary).not.toContain("accept-language");
        expect(vary).not.toContain("ipcountry");
      }
    }

    const response = await page.goto("/en");
    expect(response?.status()).toBe(200);

    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(BANNER)).toContainText("Deutsch");
    // No navigation happened: the dialog offers, it does not act (ADR-0006).
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("is a modal dialog: focus moves to the offer and `Esc` is a real answer", async ({
    page,
  }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();

    // A native `<dialog>` opened with `showModal()`, so the browser owns the trap and the layer.
    expect(
      await page.evaluate(() =>
        document.querySelector<HTMLDialogElement>("dialog")?.matches(":modal"),
      ),
    ).toBe(true);
    // Focus is on the primary action (§14 A14), not left on the body behind the dim.
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-fo-banner-action"),
      ),
    ).toBe("continue");
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

  test("`Continue` follows a real link to /de and stores the choice", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(CONTINUE)).toHaveAttribute("href", "/de");

    await page.locator(CONTINUE).click();

    await expect(page).toHaveURL(/\/de$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expectLocaleCookie(context, {
      value: "de",
      secure: isSecureOrigin(baseURL),
    });
    // The choice is honoured, so nothing is offered on the German page either.
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("never returns after a choice, and /en still does not redirect", async ({
    page,
    context,
  }) => {
    await page.goto("/en");
    await page.locator(CONTINUE).click();
    await expect(page).toHaveURL(/\/de$/);

    const response = await page.goto("/en");

    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // Give the island a chance to mount and decide, then assert it decided against showing.
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
    await expectLocaleCookie(context, {
      value: "de",
      secure: await page.evaluate(() => location.protocol === "https:"),
    });
  });

  test("`Stay` is one tap back to English, and the popup never comes back", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/en");
    await expect(page.locator(STAY)).toHaveText("Stay in English");
    await page.locator(STAY).click();

    await expect(page.locator(BANNER)).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
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

  test("`Esc` records `stay` rather than leaving the question open (§14 A14)", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(BANNER)).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
    await expectLocaleCookie(context, {
      value: "en",
      secure: isSecureOrigin(baseURL),
    });

    // The question was answered, so a reload asks nothing — the two-action contract.
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("with `fo_locale` already set it never renders, and never asks for a country", async ({
    page,
    context,
    baseURL,
  }) => {
    const asked = recordGeoRequests(page);
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: "fo_locale", value: "en", domain: url.hostname, path: "/" },
    ]);

    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
    expect(asked).toEqual([]);
  });

  /**
   * `/review 23`'s blocker, in the browser it broke. `readLocaleCookie` used to decode the cookie
   * value, so a `fo_locale` of `%` threw `URIError` inside the island's `useState` initialiser — a
   * throw during a Client Component's first render, which React unwinds past the island to the
   * root and replaces the document with the error page. Any script or extension can set that
   * cookie, and it lives for a year.
   */
  for (const value of ["%", "en%", "%zz"] as const) {
    test(`a malformed \`fo_locale=${value}\` leaves the page intact and still offers`, async ({
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
      await expect(page.locator("h1")).toHaveText(
        "Flowers for someone far away.",
      );
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

test.describe("the country pass (§14 A14: languages first, country second)", () => {
  test("is never reached when the visitor's languages already answered", async ({
    page,
  }) => {
    const asked = recordGeoRequests(page);
    await forceLanguages(page, ["de-DE", "de"]);

    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();

    // German was named by the browser, so the island never geolocated anyone.
    expect(asked).toEqual([]);
  });

  test("offers the country's locale when the languages name none", async ({
    page,
    context,
    baseURL,
  }) => {
    await forceLanguages(page, ["fr-FR", "fr"]);
    await answerGeoWith(page, "PL");

    await page.goto("/en");

    const dialog = page.locator(BANNER);
    await expect(dialog).toBeVisible();
    // The copy is written in the language being offered, and names the country in that language.
    await expect(dialog).toContainText("Polska");
    await expect(dialog).toContainText("Polski");
    await expect(page.locator(CONTINUE)).toHaveAttribute("href", "/pl");
    await expect(page.locator(CONTINUE)).toHaveAttribute("lang", "pl");
    // Still no redirect and still the page that was asked for.
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.locator(CONTINUE).click();
    await expect(page).toHaveURL(/\/pl$/);
    await expectLocaleCookie(context, {
      value: "pl",
      secure: isSecureOrigin(baseURL),
    });
  });

  test("offers nothing when the country maps to the locale already on screen", async ({
    page,
  }) => {
    await forceLanguages(page, ["fr-FR", "fr"]);
    // France is unmapped, so it resolves to the x-default locale — which is this page.
    await answerGeoWith(page, "FR");

    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("offers nothing when the edge could not place the visitor", async ({
    page,
  }) => {
    await forceLanguages(page, ["fr-FR", "fr"]);
    await answerGeoWith(page, null);

    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("survives a failing `/api/geo` with no dialog and no error", async ({
    page,
  }) => {
    await forceLanguages(page, ["fr-FR", "fr"]);
    await page.route("**/api/geo", (route) => route.abort());

    const response = await page.goto("/en");

    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText(
      "Flowers for someone far away.",
    );
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("`/api/geo` itself is never cached and answers only a country", async ({
    request,
  }) => {
    const response = await request.get("/api/geo", {
      headers: { "cf-ipcountry": "DE" },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    // Behind a local `pnpm start` there is no edge network, so the forwarded header is what the
    // route reads; the unit suite covers the header matrix.
    expect(Object.keys(await response.json())).toEqual(["country"]);
  });
});

test.describe("an English browser (AC-28's negative case)", () => {
  test.use({ locale: "en-US" });

  test.beforeEach(async ({ page }) => {
    await forceLanguages(page, ["en-US"]);
  });

  test("never sees the popup on /en", async ({ page }) => {
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

/**
 * The `sameLocale` branch in a browser: the hint and the URL agree, so there is nothing to
 * suggest. The unit matrix covers the decision; what only a browser shows is that the island
 * *mounts* — the page is `/de`, the German visitor is exactly who the popup is for — and still
 * renders nothing, rather than offering the page they are already reading.
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

test.describe("no response writes a cookie or varies by hint (T-12, AC-12, T-09)", () => {
  test.use({ locale: "de-DE" });

  for (const path of ["/", "/en", "/de"] as const) {
    test(`GET ${path} sets no cookie and no \`Vary\` on a hint`, async ({
      request,
    }) => {
      const response = await request.get(path, {
        headers: {
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
          "cf-ipcountry": "DE",
        },
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
        expect(vary).not.toContain("ipcountry");
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

      // No island, so no popup — and the switcher is still four plain links.
      await expect(page.locator(BANNER)).toHaveCount(0);
      await page.locator(`${SWITCHER} a[href="/pl"]`).click();

      await expect(page).toHaveURL(/\/pl$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    } finally {
      await context.close();
    }
  });
});

/**
 * §14 A14's sequencing: "shown **before** the consent sheet, which waits for the dialog to close".
 *
 * The order is not a preference. A consent decision recorded in a language the visitor is about to
 * leave reads as the site ignoring the answer, and two sheets stacked at the bottom of a phone is
 * the interstitial Google penalises — which is why the artboard in
 * `docs/design/flows/consent-and-locale.dc.html` now draws the language question first. The
 * mechanism is a gate on `<html>` (`src/modules/i18n/ui/localeGate.ts`), and what is asserted here
 * is the observable consequence, not the attribute.
 *
 * This is the one describe block in the file with no recorded consent decision.
 */
test.describe("the two first-visit surfaces, in order (§14 A14)", () => {
  test.use({ locale: "de-DE" });

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await forceLanguages(page, ["de-DE", "de"]);
  });

  test("the language question is asked first and the sheet waits for it", async ({
    page,
  }) => {
    await page.goto("/en");

    await expect(page.locator(BANNER)).toBeVisible();
    // The sheet is not merely painted underneath: it is not in the document at all yet.
    await expect(page.locator(CONSENT)).toHaveCount(0);

    await page.locator(STAY).click();

    await expect(page.locator(BANNER)).toHaveCount(0);
    await expect(page.locator(CONSENT)).toBeVisible();
  });

  test("the sheet is not held back when there is no language question", async ({
    page,
  }) => {
    // An English browser on `/en`: the island decides "nothing to suggest" and releases at once.
    await forceLanguages(page, ["en-US"]);

    await page.goto("/en");

    await expect(page.locator(CONSENT)).toBeVisible();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("answering the language question with `Continue` lets the sheet through", async ({
    page,
  }) => {
    await page.goto("/en");
    await expect(page.locator(BANNER)).toBeVisible();

    await page.locator(CONTINUE).click();

    await expect(page).toHaveURL(/\/de$/);
    await expect(page.locator(CONSENT)).toBeVisible();
  });
});
