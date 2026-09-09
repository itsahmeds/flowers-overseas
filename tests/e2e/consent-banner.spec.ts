/**
 * T-19 / AC-17, T-21 / AC-19, T-22 / AC-20 and the post-accept halves of T-20 / T-23 / T-24
 * (TASK-051): the consent sheet in a real browser, on all four launch locales, in both the
 * desktop and the mobile project.
 *
 * What only a browser can answer, and is therefore here rather than in
 * `tests/unit/consent-islands.test.tsx`:
 *
 *  1. the sheet is **not in the HTML** and appears after hydration, so the cached document is
 *     identical for every visitor and carries no `Set-Cookie` (§5.4);
 *  2. the CLS delta is 0 — measured with a `layout-shift` observer *and* by comparing the `<h1>`
 *     box before and after, because a zero from an observer that never fired and a zero from an
 *     overlay that reserves no space are different facts (the pattern `banner.spec.ts` set);
 *  3. focus is not stolen on appearance, and every control is operable from the keyboard;
 *  4. `Esc` records **nothing** and the sheet returns on the next page view (dismissal is not
 *     consent, §8);
 *  5. the cookie in the browser's own jar carries the register's attributes and its asymmetric
 *     lifetime — 12 months for an acceptance, 6 for a refusal;
 *  6. `POST /api/consent` receives a body that parses under `ConsentDecisionSchema`, with no page
 *     URL and no cookie attached;
 *  7. `gtag('consent','update',…)` reaches `dataLayer` with exactly the grants the visitor gave;
 *  8. the three controls are **equal in computed width, font size, weight and contrast** (AC-20),
 *     asserted from `getComputedStyle` and a contrast ratio computed from the resolved colours —
 *     not from a screenshot;
 *  9. the footer's "Cookie settings" control re-opens the sheet after a decision (AC-9's clause);
 * 10. a forged `fo_consent` is treated as no consent **and deleted**.
 *
 * `navigator.languages` is emptied in every test: the language-suggestion island would otherwise
 * paint over the same corner of the viewport and its own dismissal would be part of these
 * assertions. The two banners' z-order is TASK-055's (AC-13).
 */
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { COOKIE_REGISTRY, isRegisteredCookie } from "../../src/config/cookies";
import { ConsentDecisionSchema } from "../../src/lib/consent";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const SHEET = "[data-fo-consent]";
const SHOWN = '[data-fo-consent="shown"]';
const SETTINGS_OPEN = '[data-fo-consent="settings"]';
const SAVED = '[data-fo-consent="saved"]';
const PANEL = "[data-fo-consent-panel]";
const ACCEPT = '[data-fo-consent-action="accept"]';
const REJECT = '[data-fo-consent-action="reject"]';
const CHOOSE = '[data-fo-consent-action="settings"]';
const SAVE = '[data-fo-consent-action="save"]';
const CLOSE = '[data-fo-consent-action="close"]';
const ANALYTICS = '[data-fo-consent-category="analytics"]';
const MARKETING = '[data-fo-consent-category="marketing"]';
const REOPEN = "[data-fo-consent-reopen]";

const DAY = 86_400;
/** The register's two lifetimes (`src/config/cookies.ts`), restated as the test's expectation. */
const ACCEPT_SECONDS = 365 * DAY;
const REJECT_SECONDS = 183 * DAY;

async function emptyLanguages(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
}

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

/** Every `gtag('consent','update',…)` payload the page pushed, in order. */
function consentUpdates(page: Page): Promise<Record<string, string>[]> {
  return page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    return (layer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((entry) => entry[0] === "consent" && entry[1] === "update")
      .map((entry) => entry[2] as Record<string, string>);
  });
}

interface ConsentCookie {
  readonly value: {
    v: number;
    a: boolean;
    m: boolean;
    ts: string;
    cid: string;
  };
  readonly lifetime: number;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: string;
  readonly path: string;
}

async function readConsentCookie(
  context: BrowserContext,
): Promise<ConsentCookie | null> {
  const cookie = (await context.cookies()).find(
    (candidate) => candidate.name === "fo_consent",
  );
  if (cookie === undefined || cookie.value === "") return null;
  return {
    value: JSON.parse(
      decodeURIComponent(cookie.value),
    ) as ConsentCookie["value"],
    lifetime: cookie.expires - Date.now() / 1000,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    path: cookie.path,
  };
}

function isSecureOrigin(baseURL: string | undefined): boolean {
  return new URL(baseURL ?? "http://localhost:3000").protocol === "https:";
}

/** The bodies of every `POST /api/consent` the page sent. */
function captureDecisions(page: Page): {
  readonly bodies: unknown[];
  readonly headers: Record<string, string>[];
} {
  const bodies: unknown[] = [];
  const headers: Record<string, string>[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (!request.url().includes("/api/consent")) return;
    const raw = request.postData();
    bodies.push(raw === null ? null : JSON.parse(raw));
    headers.push(request.headers());
  });
  return { bodies, headers };
}

/**
 * WCAG contrast from two sRGB triples. The triples are resolved **in the browser**, by painting
 * the computed colour onto a 1x1 canvas and reading the pixel back: the design system's tokens are
 * `oklch()`, `getComputedStyle` returns them as `oklch(…)`, and a regex that assumed `rgb()` read
 * a lightness of 0.19 as a red channel of 0.19 and reported every pair as failing. The pixel is
 * what a person actually sees.
 */
function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const luminance = ([r = 0, g = 0, b2 = 0]: readonly number[]): number => {
    const channel = (value: number): number => {
      const srgb = value / 255;
      return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b2);
  };
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("the sheet appears without disturbing the page (AC-17)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: after hydration, not in the HTML, CLS delta 0, focus untouched`, async ({
      page,
      context,
    }) => {
      await emptyLanguages(page);
      await observeLayoutShifts(page);

      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);
      // The cached document sets no cookie and carries no consent markup of its own (§5.4).
      expect(response?.headers()["set-cookie"]).toBeUndefined();
      expect(await response!.text()).not.toContain("data-fo-consent=");

      const heading = page.locator("h1").first();
      const before = await heading.boundingBox();

      await expect(page.locator(SHOWN)).toBeVisible();

      const after = await heading.boundingBox();
      expect(after).toEqual(before);
      expect(
        await page.evaluate(
          () => (window as unknown as { __clsTotal: number }).__clsTotal,
        ),
      ).toBeLessThanOrEqual(0.001);

      // Focus is not stolen: it is still where the document left it.
      expect(
        await page.evaluate(() => document.activeElement?.tagName ?? ""),
      ).toBe("BODY");

      // And nothing is stored before a decision (§8, AC-18's post-hydration half).
      expect(await readConsentCookie(context)).toBeNull();
      expect(
        (await context.cookies())
          .map((cookie) => cookie.name)
          .filter((name) => name.startsWith("fo_")),
      ).toEqual([]);
    });
  }

  test("is a non-modal region, not a dialog, and covers no interactive content", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    const sheet = page.locator(SHOWN);
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("role", "region");
    await expect(sheet).toHaveAttribute("aria-live", "polite");
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
    // The page underneath stays operable: the footer's own control is clickable through no scrim.
    await expect(page.locator(REOPEN).first()).toBeEnabled();
  });

  test("is operable from the keyboard alone", async ({ page, context }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await expect(page.locator(SHOWN)).toBeVisible();

    // Reached by tabbing (it is at the end of the document), then activated with the keyboard.
    await page.locator(REJECT).focus();
    await expect(page.locator(REJECT)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.locator(SAVED)).toBeVisible();
    expect((await readConsentCookie(context))?.value.a).toBe(false);
  });
});

test.describe("`Esc` records nothing (AC-17, §8)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: closes the sheet, writes no cookie, returns next page view`, async ({
      page,
      context,
    }) => {
      await emptyLanguages(page);
      const decisions = captureDecisions(page);

      await page.goto(`/${locale}`);
      await expect(page.locator(SHOWN)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(SHEET)).toHaveCount(0);

      expect(await readConsentCookie(context)).toBeNull();
      expect(decisions.bodies).toEqual([]);

      // Dismissal is not consent: the question comes back.
      await page.reload();
      await expect(page.locator(SHOWN)).toBeVisible();
    });
  }

  test("steps back one layer at a time, still without deciding", async ({
    page,
    context,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await expect(page.locator(SHOWN)).toBeVisible();
    await page.locator(CHOOSE).click();
    await expect(page.locator(PANEL)).toBeVisible();

    // First press: the panel closes and the sheet stays, so focus has somewhere to go back to.
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(page.locator(SHOWN)).toBeVisible();
    // Second: the sheet goes.
    await page.keyboard.press("Escape");
    await expect(page.locator(SHEET)).toHaveCount(0);
    expect(await readConsentCookie(context)).toBeNull();
  });
});

test.describe("Accept all (AC-19)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: 12-month cookie, both grants, a valid recorded decision`, async ({
      page,
      context,
      baseURL,
    }) => {
      await emptyLanguages(page);
      const decisions = captureDecisions(page);

      await page.goto(`/${locale}`);
      await page.locator(ACCEPT).click();
      await expect(page.locator(SAVED)).toBeVisible();

      const cookie = await readConsentCookie(context);
      expect(cookie).not.toBeNull();
      expect(cookie!.value.a).toBe(true);
      expect(cookie!.value.m).toBe(true);
      expect(cookie!.path).toBe("/");
      expect(cookie!.sameSite).toBe("Lax");
      expect(cookie!.httpOnly).toBe(false);
      expect(cookie!.secure).toBe(isSecureOrigin(baseURL));
      // ≈12 months, and unambiguously not the 6-month refusal lifetime.
      expect(cookie!.lifetime).toBeGreaterThan(ACCEPT_SECONDS - 3600);
      expect(cookie!.lifetime).toBeLessThanOrEqual(ACCEPT_SECONDS);

      expect(await consentUpdates(page)).toEqual([
        {
          analytics_storage: "granted",
          ad_storage: "granted",
          ad_user_data: "granted",
          ad_personalization: "granted",
        },
      ]);

      await expect
        .poll(() => decisions.bodies.length, { timeout: 5000 })
        .toBe(1);
      const parsed = ConsentDecisionSchema.parse(decisions.bodies[0]);
      expect(parsed.analytics).toBe(true);
      expect(parsed.marketing).toBe(true);
      expect(parsed.cid).toBe(cookie!.value.cid);
      // No page URL and no cookie leave the browser with the record (§8): the values carry no
      // path and no origin, `credentials: "omit"` sends no cookie, and `referrerPolicy:
      // "no-referrer"` leaves the `Referer` empty rather than quoting the page being read.
      const values = JSON.stringify(Object.values(parsed));
      expect(values).not.toContain("http");
      expect(values).not.toContain("/");
      const headers = decisions.headers[0] ?? {};
      expect(headers["cookie"] ?? "").toBe("");
      expect(headers["referer"] ?? "").toBe("");
    });
  }

  test("the confirmation is dismissible and the sheet does not come back", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await page.locator(ACCEPT).click();
    await page.locator(CLOSE).click();
    await expect(page.locator(SHEET)).toHaveCount(0);
    await page.reload();
    await expect(page.locator(SHEET)).toHaveCount(0);
  });
});

test.describe("Reject all (AC-19)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: 6-month cookie, no grant, a valid recorded decision`, async ({
      page,
      context,
    }) => {
      await emptyLanguages(page);
      const decisions = captureDecisions(page);

      await page.goto(`/${locale}`);
      await page.locator(REJECT).click();
      await expect(page.locator(SAVED)).toBeVisible();

      const cookie = await readConsentCookie(context);
      expect(cookie!.value).toMatchObject({ a: false, m: false });
      expect(cookie!.lifetime).toBeGreaterThan(REJECT_SECONDS - 3600);
      expect(cookie!.lifetime).toBeLessThanOrEqual(REJECT_SECONDS);

      // An update is sent — the bootstrap declares `wait_for_update` — and it grants nothing.
      const updates = await consentUpdates(page);
      expect(updates).toHaveLength(1);
      expect(Object.values(updates[0]!)).not.toContain("granted");

      await expect
        .poll(() => decisions.bodies.length, { timeout: 5000 })
        .toBe(1);
      const parsed = ConsentDecisionSchema.parse(decisions.bodies[0]);
      expect(parsed.analytics).toBe(false);
      expect(parsed.marketing).toBe(false);
    });
  }
});

test.describe("Settings: analytics on, marketing off (AC-19, AC-20)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: saves exactly that, nothing pre-enabled`, async ({
      page,
      context,
    }) => {
      await emptyLanguages(page);
      const decisions = captureDecisions(page);

      await page.goto(`/${locale}`);
      await page.locator(CHOOSE).click();
      await expect(page.locator(SETTINGS_OPEN)).toBeVisible();

      // AC-20: no non-essential category is pre-enabled, and essential has no control at all.
      await expect(page.locator(ANALYTICS)).not.toBeChecked();
      await expect(page.locator(MARKETING)).not.toBeChecked();
      expect(
        await page.locator('[data-fo-consent-category="essential"]').count(),
      ).toBe(0);
      await expect(page.locator("[data-fo-consent-locked]")).toBeVisible();

      await page.locator(ANALYTICS).check();
      await page.locator(SAVE).click();
      await expect(page.locator(SAVED)).toBeVisible();

      const cookie = await readConsentCookie(context);
      expect(cookie!.value).toMatchObject({ a: true, m: false });
      // Any acceptance keeps the 12-month lifetime.
      expect(cookie!.lifetime).toBeGreaterThan(ACCEPT_SECONDS - 3600);

      expect(await consentUpdates(page)).toEqual([
        {
          analytics_storage: "granted",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        },
      ]);

      await expect
        .poll(() => decisions.bodies.length, { timeout: 5000 })
        .toBe(1);
      const parsed = ConsentDecisionSchema.parse(decisions.bodies[0]);
      expect(parsed).toMatchObject({ analytics: true, marketing: false });
    });
  }

  test("lists every register entry with its purpose and lifetime", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await page.locator(CHOOSE).click();
    const panel = page.locator(PANEL);
    await expect(panel.locator("code")).toHaveCount(COOKIE_REGISTRY.length);
    for (const entry of COOKIE_REGISTRY) {
      await expect(
        panel.locator("code", { hasText: entry.name }).first(),
      ).toBeVisible();
    }
    await expect(panel.getByText("730 days").first()).toBeVisible();
    await expect(panel.getByText("This visit only").first()).toBeVisible();
  });

  test("stays inside the viewport and scrolls internally (WCAG 1.4.10)", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/en");
    await expect(page.locator(SHOWN)).toBeVisible();
    await page.locator(CHOOSE).click();
    await expect(page.locator(PANEL)).toBeVisible();

    const box = await page.locator(`${SETTINGS_OPEN}`).boundingBox();
    const viewport = page.viewportSize()!;
    // Never taller than the viewport, and never with its top edge above it: a `fixed` sheet that
    // overflows upwards cannot be scrolled back into view.
    expect(box!.height).toBeLessThanOrEqual(viewport.height);
    expect(box!.y).toBeGreaterThanOrEqual(-1);

    // The list is long, so the sheet itself is the scroll container.
    expect(
      await page
        .locator(SETTINGS_OPEN)
        .evaluate((element) => element.scrollHeight > element.clientHeight + 1),
    ).toBe(true);

    // And every control is still operable: the first row and the save control are reachable.
    await page.locator(`${PANEL} code`).first().scrollIntoViewIfNeeded();
    await expect(page.locator(`${PANEL} code`).first()).toBeVisible();
    await page.locator(SAVE).scrollIntoViewIfNeeded();
    await expect(page.locator(SAVE)).toBeVisible();
  });

  test("moves focus into the panel it was asked for, and back on close", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await expect(page.locator(SHOWN)).toBeVisible();
    await page.locator(CHOOSE).click();
    // The panel's heading takes focus, so the controls the visitor asked for are not behind them.
    await expect(page.locator(`${PANEL} h3`)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(page.locator(CHOOSE)).toBeFocused();
  });
});

test.describe("equal prominence, from computed styles (AC-20)", () => {
  test("all three controls share width, size, weight and a 4.5:1 pair", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await expect(page.locator(SHOWN)).toBeVisible();

    const measured = await page.evaluate(
      (selectors) => {
        const context = document
          .createElement("canvas")
          .getContext("2d") as CanvasRenderingContext2D;
        const rgb = (colour: string): number[] => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = colour;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (element === null) throw new Error(`missing ${selector}`);
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return {
            selector,
            width: Math.round(box.width),
            height: Math.round(box.height),
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            textTransform: style.textTransform,
            colour: rgb(style.color),
            background: rgb(style.backgroundColor),
            borderColour: rgb(style.borderTopColor),
            opacity: style.opacity,
          };
        });
      },
      [REJECT, CHOOSE, ACCEPT],
    );

    const [first, ...rest] = measured;
    for (const control of rest) {
      expect(control.width, control.selector).toBe(first!.width);
      expect(control.height, control.selector).toBe(first!.height);
      expect(control.fontSize, control.selector).toBe(first!.fontSize);
      expect(control.fontWeight, control.selector).toBe(first!.fontWeight);
      expect(control.letterSpacing, control.selector).toBe(
        first!.letterSpacing,
      );
      expect(control.textTransform, control.selector).toBe(
        first!.textTransform,
      );
      expect(control.colour, control.selector).toEqual(first!.colour);
      expect(control.background, control.selector).toEqual(first!.background);
      expect(control.borderColour, control.selector).toEqual(
        first!.borderColour,
      );
      expect(control.opacity, control.selector).toBe("1");
    }

    for (const control of measured) {
      // Text on its own fill: 4.5:1 (WCAG 1.4.3), computed from the resolved colours.
      expect(
        contrastRatio(control.colour, control.background),
        `${control.selector} text contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      // The boundary that makes it look like a control: 3:1 (1.4.11).
      expect(
        contrastRatio(control.borderColour, control.background),
        `${control.selector} border contrast`,
      ).toBeGreaterThanOrEqual(3);
      // 44 px tap target (§5.3).
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("withdrawal from the footer (AC-9's re-open clause)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: "Cookie settings" re-opens the sheet after a decision`, async ({
      page,
      context,
    }) => {
      await emptyLanguages(page);
      await page.goto(`/${locale}`);
      await page.locator(ACCEPT).click();
      await page.locator(CLOSE).click();
      await expect(page.locator(SHEET)).toHaveCount(0);

      await page.locator(REOPEN).first().click();
      await expect(page.locator(SHOWN)).toBeVisible();

      // The recorded answer is what the panel shows, not a fresh default: this is a change of
      // mind, and pretending the visitor had chosen nothing would be its own dishonesty.
      await page.locator(CHOOSE).click();
      await expect(page.locator(ANALYTICS)).toBeChecked();

      // Withdrawing is one control: uncheck both, save, and the cookie says so.
      await page.locator(ANALYTICS).uncheck();
      await page.locator(MARKETING).uncheck();
      await page.locator(SAVE).click();
      const cookie = await readConsentCookie(context);
      expect(cookie!.value).toMatchObject({ a: false, m: false });
      expect(cookie!.lifetime).toBeLessThanOrEqual(REJECT_SECONDS);
    });
  }

  test("re-opens on a page where the sheet was never shown", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await page.locator(REJECT).click();
    await page.locator(CLOSE).click();
    await page.goto("/de");
    // The island is `ssr: false`: on a page where it renders nothing, waiting for the network to
    // settle is what tells us its chunk arrived and its re-open listener is bound. Clicking
    // sooner tests the browser's timing, not the feature.
    await page.waitForLoadState("networkidle");
    await expect(page.locator(SHEET)).toHaveCount(0);
    await page.locator(REOPEN).first().click();
    await expect(page.locator(SHOWN)).toBeVisible();
  });
});

test.describe("a forged or stale cookie is no consent (AC-19)", () => {
  const forged = [
    "%",
    "hello",
    encodeURIComponent('{"v":1,"a":true,"m":true}'),
    encodeURIComponent(
      '{"v":99,"a":true,"m":true,"ts":"2026-09-09T10:00:00.000Z","cid":"6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e"}',
    ),
  ];

  for (const value of forged) {
    test(`\`${value.slice(0, 24)}\` shows the sheet and is deleted`, async ({
      page,
      context,
      baseURL,
    }) => {
      await emptyLanguages(page);
      await context.addCookies([
        {
          name: "fo_consent",
          value,
          url: baseURL ?? "http://localhost:3000",
        },
      ]);

      await page.goto("/en");
      await expect(page.locator(SHOWN)).toBeVisible();
      // Rewritten: the value we cannot honour is gone, and nothing was stored in its place.
      expect(await readConsentCookie(context)).toBeNull();

      // And the page did not break on it: the footer is still there (fails closed).
      await expect(page.getByRole("contentinfo")).toBeVisible();
    });
  }
});

test.describe("the chooser has no consent sheet (spec 003 AC-7)", () => {
  test("`/` renders no sheet and stores nothing", async ({ page, context }) => {
    await emptyLanguages(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.locator(SHEET).count()).toBe(0);
    expect(await context.cookies()).toEqual([]);
  });
});

test.describe("post-decision: the register and the third-party silence hold", () => {
  test("every cookie after an acceptance is in the register (T-24's second half)", async ({
    page,
    context,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await page.locator(ACCEPT).click();
    await expect(page.locator(SAVED)).toBeVisible();

    const names = (await context.cookies())
      .map((cookie) => cookie.name)
      .filter((name) => !name.startsWith("_vercel"));
    expect(names).toContain("fo_consent");
    expect(names.filter((name) => !isRegisteredCookie(name))).toEqual([]);
    // Accepting analytics with no measurement id configured sets no analytics cookie: the tag
    // does not exist to set one (AC-21).
    expect(names.filter((name) => name.startsWith("_ga"))).toEqual([]);
  });

  test("accepting requests no third-party origin while GA4 is unset (T-23's second half)", async ({
    page,
    baseURL,
  }) => {
    await emptyLanguages(page);
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));

    await page.goto("/en");
    await page.locator(ACCEPT).click();
    await expect(page.locator(SAVED)).toBeVisible();
    await page.waitForLoadState("networkidle");

    const base = new URL(baseURL ?? "http://localhost:3000");
    const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const allowed = new Set(
      local.has(base.hostname) ? [] : ["https://vercel.live"],
    );
    const thirdParty = [
      ...new Set(
        requested
          .map((url) => new URL(url).origin)
          .filter((origin) => origin !== base.origin && !allowed.has(origin)),
      ),
    ];
    expect(thirdParty).toEqual([]);
    expect(requested.filter((url) => url.includes("googletagmanager"))).toEqual(
      [],
    );
  });

  test("the default-denied block is still the first `dataLayer` entry (T-20's second half)", async ({
    page,
  }) => {
    await emptyLanguages(page);
    await page.goto("/en");
    await page.locator(ACCEPT).click();
    await expect(page.locator(SAVED)).toBeVisible();

    const order = await page.evaluate(() => {
      const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
      return (layer ?? [])
        .map((entry) => Array.from(entry as ArrayLike<unknown>))
        .filter((entry) => entry[0] === "consent")
        .map((entry) => String(entry[1]));
    });
    // Default first, update second: a tag that loads later reads denied and is then told the
    // answer, never the other way round.
    expect(order).toEqual(["default", "update"]);
  });
});
