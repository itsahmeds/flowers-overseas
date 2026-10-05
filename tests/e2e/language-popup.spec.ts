/**
 * The language popup in a browser (spec 003 §14 A14 Shape as amended by A16; AC-12 and AC-28 as
 * A16 clause 6 restates them, T-12 and T-28; spec 004 §14 A23 AC-39, T-41; TASK-119).
 *
 * Every test starts from a **first visit** (`NO_LOCALE_CHOICE`; the config seeds `fo_locale` for
 * every other suite) and enters through `/`, which is one 308 to `/en`.
 *
 *  (a) the popup opens after hydration: the heading, the four native names once each in registry
 *      order, English marked as the default;
 *  (b) the hint only highlights: `["de-DE","de"]` marks Deutsch and nothing navigates; with
 *      `cf-ipcountry: PL` and `["en-US"]` Polski carries no mark and nothing asks `/api/geo`;
 *  (c) the close button, `Esc` and a tap outside each close it at `/en` and set `fo_locale=en`,
 *      with the §13 Q4 attributes, and it does not reopen on reload;
 *  (d) choosing Deutsch follows its link to `/de` with `fo_locale=de`;
 *  (e) a valid cookie means it never renders; a forged `fo_locale=zz` means it opens, and the next
 *      act rewrites the value;
 *  (f) the consent sheet is never on screen with it (also `consent-banner.spec.ts`);
 *  (g) a top sheet at 360 × 640 and 390 × 844 (top edge y 0, ≤ 260 px, clear of the sentence card
 *      at 390), the page still scrolls under it, a centred card at 1280 × 800 and 1440 × 900, and
 *      no layout shift at any size;
 *  (h) a close button of at least 44 × 44 CSS px, and nothing left of the old strip.
 *
 * "Mark" in (b) means the popup's own marks (current, default, browser match). The "Beta" tag on
 * Deutsch and Polski is the registry's machine-draft tag the header switcher shows too, and it is
 * not a hint: it is there whatever the browser says.
 */
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import {
  SENTENCE_REGION,
  recordLayoutShifts,
  shiftOutside,
} from "../support/layout-shift.ts";
import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

test.use({ storageState: NO_LOCALE_CHOICE });

const POPUP = "dialog[data-fo-language-popup]";
const OPEN = `${POPUP}[open]`;
const CLOSE = "[data-fo-language-popup-close]";
const option = (code: string): string => `[data-fo-language-option="${code}"]`;
const CONSENT_SHOWN = '[data-fo-consent="shown"]';
const SENTENCE = "[data-fo-sentence]";

/** 365 days, `plan/03` §1 / §13 Q4. */
const YEAR_IN_SECONDS = 31_536_000;

/** `navigator.languages` as the test needs it, before any script of the page runs. */
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

/** The §13 Q4 attribute set, read from the browser's own jar. */
async function expectLocaleCookie(
  context: BrowserContext,
  value: string,
  baseURL: string | undefined,
): Promise<void> {
  const cookie = (await context.cookies()).find(
    (candidate) => candidate.name === "fo_locale",
  );
  expect(cookie, "fo_locale is in the browser cookie jar").toBeDefined();
  // One value, rewritten in place: a second `fo_locale` beside a forged one would not be a rewrite.
  expect(
    (await context.cookies()).filter(
      (candidate) => candidate.name === "fo_locale",
    ),
  ).toHaveLength(1);
  expect(cookie!.value).toBe(value);
  expect(cookie!.path).toBe("/");
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.httpOnly).toBe(false);
  expect(cookie!.secure).toBe(
    new URL(baseURL ?? "http://localhost:3000").protocol === "https:",
  );
  expect(cookie!.expires - Date.now() / 1000).toBeGreaterThanOrEqual(
    YEAR_IN_SECONDS - 600,
  );
}

/** The popup's marks on one option, by kind. */
async function marksOn(page: Page, code: string): Promise<string[]> {
  return page
    .locator(`${option(code)} [data-fo-mark]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-fo-mark") ?? ""),
    );
}

/** The layout shifts recorded since the last `clearShifts()`. */
async function sumOfShifts(page: Page): Promise<number> {
  return page.evaluate(() =>
    (
      (window as unknown as { __foShifts?: { value: number }[] }).__foShifts ??
      []
    ).reduce((total, entry) => total + entry.value, 0),
  );
}

async function clearShifts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __foShifts?: unknown[] };
    if (store.__foShifts !== undefined) store.__foShifts.length = 0;
  });
}

async function openFromRoot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(OPEN)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/en");
}

test.describe("(a) it opens on the first view of /en", () => {
  test("with L1, the four native names in registry order, and English the default", async ({
    page,
  }) => {
    await forceLanguages(page, ["en-US"]);
    await openFromRoot(page);

    await expect(page.locator(`${OPEN} h2`)).toHaveText(
      "Choose your preferred language",
    );
    const names = await page
      .locator(`${OPEN} a[data-fo-language-option] > span:first-child`)
      .allTextContents();
    expect(names).toEqual(["English", "English (UK)", "Deutsch", "Polski"]);
    expect(await marksOn(page, "en")).toEqual(["current", "default"]);
    await expect(
      page.locator(`${option("en")} [data-fo-mark="default"]`),
    ).toHaveText("Default");
    // It is a modal native dialog labelled by its heading.
    expect(
      await page.locator(POPUP).evaluate((node) => node.matches(":modal")),
    ).toBe(true);
    const labelledBy = await page
      .locator(POPUP)
      .getAttribute("aria-labelledby");
    await expect(page.locator(`[id="${labelledBy}"]`)).toHaveText(
      "Choose your preferred language",
    );
    // Focus moved in on open.
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.closest("dialog[data-fo-language-popup]") !=
          null,
      ),
    ).toBe(true);
  });
});

test.describe("(b) the hint only highlights", () => {
  test("a German browser gets Deutsch highlighted, and nothing navigates", async ({
    page,
  }) => {
    await forceLanguages(page, ["de-DE", "de"]);
    await page.goto("/");
    await expect(page.locator(OPEN)).toBeVisible();

    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    await page.waitForTimeout(1500);

    expect(navigations).toEqual([]);
    expect(new URL(page.url()).pathname).toBe("/en");
    expect(await marksOn(page, "de")).toEqual(["hint", "beta"]);
    await expect(page.locator(`${OPEN} [data-fo-mark="hint"]`)).toHaveCount(1);
    // The list is not reordered.
    const order = await page
      .locator(`${OPEN} [data-fo-language-option]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-fo-language-option")),
      );
    expect(order).toEqual(["en", "en-gb", "de", "pl"]);
    // And no cookie was written by highlighting.
    expect(
      (await page.context().cookies()).filter((c) => c.name === "fo_locale"),
    ).toEqual([]);
  });

  test("a country header picks nothing, and nothing asks /api/geo", async ({
    page,
  }) => {
    await forceLanguages(page, ["en-US"]);
    await page.setExtraHTTPHeaders({ "cf-ipcountry": "PL" });
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));

    await openFromRoot(page);
    await page.waitForLoadState("networkidle");

    expect(await marksOn(page, "pl")).toEqual(["beta"]);
    expect(await marksOn(page, "en-gb")).toEqual([]);
    expect(await marksOn(page, "de")).toEqual(["beta"]);
    await expect(page.locator(`${OPEN} [data-fo-mark="hint"]`)).toHaveCount(0);
    expect(requested.filter((url) => url.includes("/api/geo"))).toEqual([]);
  });
});

test.describe("(c) T-12: each way to close sets fo_locale=en and it never reopens", () => {
  const closers: readonly {
    readonly name: string;
    readonly close: (page: Page) => Promise<void>;
  }[] = [
    {
      name: "the close button",
      close: async (page) => page.locator(CLOSE).click(),
    },
    { name: "Esc", close: async (page) => page.keyboard.press("Escape") },
    {
      name: "a tap outside",
      close: async (page) => {
        const box = await page.locator(OPEN).boundingBox();
        const viewport = page.viewportSize();
        if (box === null || viewport === null) throw new Error("no box");
        // Below the sheet on a phone, beside the card on a desktop.
        const y = Math.min(viewport.height - 5, box.y + box.height + 40);
        await page.mouse.click(5, y);
      },
    },
  ];

  for (const { name, close } of closers) {
    test(`by ${name}`, async ({ page, context, baseURL }) => {
      await forceLanguages(page, ["de-DE"]);
      await openFromRoot(page);

      await close(page);

      await expect(page.locator(POPUP)).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe("/en");
      await expectLocaleCookie(context, "en", baseURL);

      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(POPUP)).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe("/en");
    });
  }

  test("closing returns focus to where it was", async ({ page }) => {
    await forceLanguages(page, ["en-US"]);
    await openFromRoot(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(POPUP)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.activeElement?.closest("dialog") == null,
      ),
    ).toBe(true);
  });
});

test.describe("(d) choosing follows a link", () => {
  test("Deutsch goes to /de with fo_locale=de, and nothing redirects on reload", async ({
    page,
    context,
    baseURL,
  }) => {
    await forceLanguages(page, ["de-DE"]);
    await openFromRoot(page);

    await Promise.all([
      page.waitForURL(/\/de$/u),
      page.locator(option("de")).click(),
    ]);
    await expectLocaleCookie(context, "de", baseURL);

    const response = await page.reload();
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/de");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(POPUP)).toHaveCount(0);
  });

  test("choosing the page's own language only closes it", async ({
    page,
    context,
    baseURL,
  }) => {
    await forceLanguages(page, ["en-US"]);
    await openFromRoot(page);
    await page.locator(option("en")).click();
    await expect(page.locator(POPUP)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/en");
    await expectLocaleCookie(context, "en", baseURL);
  });
});

test.describe("(e) the cookie decides whether it opens", () => {
  test("a valid fo_locale means it never renders", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "fo_locale",
        value: "pl",
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
    await page.goto("/en");
    // The island has run once the gate is released.
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.getAttribute("data-fo-locale-gate"),
        ),
      )
      .toBeNull();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(POPUP)).toHaveCount(0);
  });

  test("a forged fo_locale=zz opens it, and closing rewrites the value", async ({
    page,
    context,
    baseURL,
  }) => {
    // Forged the way any script on the page can, before the island reads it: once, on the first
    // document only, so the rewrite is what the jar holds afterwards.
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("forged") !== null) return;
      window.sessionStorage.setItem("forged", "1");
      document.cookie = "fo_locale=zz; Path=/; SameSite=Lax";
    });
    await openFromRoot(page);
    await page.locator(CLOSE).click();
    // The cookie is written in the dialog's `close` event, which the browser fires after the click.
    await expect(page.locator(POPUP)).toHaveCount(0);
    await expectLocaleCookie(context, "en", baseURL);
  });
});

test.describe("(f) never on screen with the consent sheet", () => {
  test("the sheet waits until the popup has closed, however long it stays open", async ({
    page,
  }) => {
    // Sample every frame from the first paint: was the sheet ever painted while the popup was
    // open? A state check at the end cannot see a sheet that came and went (`/break 205` hole 3).
    await page.addInitScript(() => {
      const store = window as unknown as { __foCoVisible?: boolean };
      store.__foCoVisible = false;
      const sample = (): void => {
        const popupOpen =
          document.querySelector("dialog[data-fo-language-popup][open]") !==
          null;
        const sheet = document.querySelector('[data-fo-consent="shown"]');
        if (popupOpen && sheet !== null && sheet.getClientRects().length > 0) {
          store.__foCoVisible = true;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await openFromRoot(page);
    await page.waitForLoadState("networkidle");
    // Past the loader's fail-open timer (`LOCALE_GATE_TIMEOUT_MS`, 4 s): a gate the open popup
    // did not hold would be released here and the sheet would paint over the popup.
    await page.waitForTimeout(5_500);
    await expect(page.locator(OPEN)).toBeVisible();
    await expect(page.locator(CONSENT_SHOWN)).toHaveCount(0);

    await page.locator(CLOSE).click();
    await expect(page.locator(CONSENT_SHOWN)).toBeVisible();
    await expect(page.locator(POPUP)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __foCoVisible?: boolean }).__foCoVisible,
      ),
    ).toBe(false);
  });
});

test.describe("(g) the shape, the scroll and CLS (AC-39)", () => {
  // Each case sets its own viewport; the mobile project's device emulation would fight it.
  test.skip(
    ({ isMobile }) => isMobile,
    "viewport-specific: runs in e2e-desktop",
  );
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test(`a top sheet at ${viewport.width} × ${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await recordLayoutShifts(page);
      await openFromRoot(page);

      const box = await page.locator(OPEN).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBe(0);
      expect(box!.height).toBeLessThanOrEqual(260);
      expect(box!.width).toBe(viewport.width);

      if (viewport.width === 390) {
        const card = await page.locator(SENTENCE).first().boundingBox();
        expect(card, "the sentence card is on the page").not.toBeNull();
        expect(card!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
      }

      // Not scroll-locked: nothing hides the overflow, and a wheel over the page moves it.
      const overflow = await page.evaluate(() => [
        getComputedStyle(document.documentElement).overflow,
        getComputedStyle(document.body).overflow,
      ]);
      expect(overflow).not.toContain("hidden");
      await page.mouse.move(viewport.width / 2, viewport.height - 40);
      await page.mouse.wheel(0, 400);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
      const after = await page.locator(OPEN).boundingBox();
      expect(after!.y).toBe(0);

      // Opening: nothing moved but the home's own sentence island, which every overlay test of
      // this repo excludes (`SENTENCE_REGION`) under the same 0.001 the consent sheet's AC-17
      // uses. Closing: exactly zero, measured from a cleared record.
      expect(await shiftOutside(page, SENTENCE_REGION)).toBeLessThanOrEqual(
        0.001,
      );
      await clearShifts(page);
      await page.locator(CLOSE).click();
      await expect(page.locator(POPUP)).toHaveCount(0);
      expect(await sumOfShifts(page), "shifts while closing").toBe(0);
    });
  }

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`a centred card at ${viewport.width} × ${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await recordLayoutShifts(page);
      await openFromRoot(page);

      const box = await page.locator(OPEN).boundingBox();
      expect(box).not.toBeNull();
      expect(
        Math.abs(box!.x + box!.width / 2 - viewport.width / 2),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(box!.y + box!.height / 2 - viewport.height / 2),
      ).toBeLessThanOrEqual(2);
      expect(box!.width).toBe(620);

      // Opening: nothing moved but the home's own sentence island, which every overlay test of
      // this repo excludes (`SENTENCE_REGION`) under the same 0.001 the consent sheet's AC-17
      // uses. Closing: exactly zero, measured from a cleared record.
      expect(await shiftOutside(page, SENTENCE_REGION)).toBeLessThanOrEqual(
        0.001,
      );
      await clearShifts(page);
      await page.keyboard.press("Escape");
      await expect(page.locator(POPUP)).toHaveCount(0);
      expect(await sumOfShifts(page), "shifts while closing").toBe(0);
    });
  }
});

test.describe("(h) the close button and the old strip", () => {
  test("the close button is at least 44 × 44 CSS px and is named L5", async ({
    page,
  }) => {
    await openFromRoot(page);
    const box = await page.locator(CLOSE).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(CLOSE)).toHaveAttribute("aria-label", "Close");
    await expect(page.locator("[data-fo-banner]")).toHaveCount(0);
    await expect(
      page.locator('[data-fo-live-region="locale-suggestion"]'),
    ).toHaveCount(0);
  });
});

test.describe("T-41: AC-39's boxes, links and strings", () => {
  // Each case sets its own viewport; the mobile project's device emulation would fight it.
  test.skip(
    ({ isMobile }) => isMobile,
    "viewport-specific: runs in e2e-desktop",
  );
  test("1440 × 900: a centred native dialog card with four real links and L1, L3, L4, L6", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await forceLanguages(page, ["de-DE"]);
    await openFromRoot(page);

    expect(await page.locator(OPEN).evaluate((node) => node.tagName)).toBe(
      "DIALOG",
    );
    const links = await page
      .locator(`${OPEN} a[data-fo-language-option]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          node.getAttribute("href"),
          node.getAttribute("lang"),
          node.getAttribute("hreflang"),
        ]),
      );
    expect(links).toEqual([
      ["/en", "en", "en"],
      ["/en-gb", "en-GB", "en-GB"],
      ["/de", "de", "de"],
      ["/pl", "pl", "pl"],
    ]);
    await expect(
      page.locator(`${option("en")} [data-fo-mark="current"]`),
    ).toHaveText("Current");
    // Both L4 wordings are in the DOM and CSS shows one: assert the visible one's text (the
    // marks are `text-transform: uppercase`, so `innerText` would read capitals).
    await expect(
      page.locator(`${option("de")} [data-fo-mark="hint"] > span:visible`),
    ).toHaveText("Matches your browser");
    await expect(page.locator(`${OPEN} p`).last()).toHaveText(
      "You can change it any time at the top of every page.",
    );
    await page.waitForLoadState("networkidle");
    await expect(page.locator(CONSENT_SHOWN)).toHaveCount(0);
  });

  test("390 × 844: a top sheet with the short L4", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await forceLanguages(page, ["de-DE"]);
    await openFromRoot(page);
    const box = await page.locator(OPEN).boundingBox();
    expect(box!.y).toBe(0);
    expect(box!.height).toBeLessThanOrEqual(260);
    await expect(
      page.locator(`${option("de")} [data-fo-mark="hint"] > span:visible`),
    ).toHaveText("Your browser");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(CONSENT_SHOWN)).toHaveCount(0);
  });
});

test.describe("each option is the same page in that locale (A14 Shape)", () => {
  test("on the Poland corridor, the options point at its own path, and English (UK) follows there", async ({
    page,
    context,
    baseURL,
  }) => {
    await forceLanguages(page, ["en-US"]);
    await page.goto("/en/send-flowers-to/poland");
    await expect(page.locator(OPEN)).toBeVisible();

    await expect(page.locator(option("en"))).toHaveAttribute(
      "href",
      "/en/send-flowers-to/poland",
    );
    await expect(page.locator(option("en-gb"))).toHaveAttribute(
      "href",
      "/en-gb/send-flowers-to/poland",
    );
    // Deutsch: no German Poland guide exists (`corridorAlternatePaths()` lists `en` and `en-gb`
    // only), so the option falls back to the German home rather than linking a 404.
    await expect(page.locator(option("de"))).toHaveAttribute("href", "/de");

    await Promise.all([
      page.waitForURL(/\/en-gb\/send-flowers-to\/poland$/u),
      page.locator(option("en-gb")).click(),
    ]);
    await expectLocaleCookie(context, "en-gb", baseURL);
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  });
});
