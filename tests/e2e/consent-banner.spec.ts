/**
 * The consent layer on the **committed build**, where nothing needs consent (spec 004 §14
 * A-founder-2026-10-19d; TASK-279): AC-17 (a), AC-9's control clause (T-11), AC-19 (a) (T-21),
 * AC-20's pre-enable and register halves (T-22), AC-22's restated accept step (T-24).
 *
 * `consentSources()` finds no active source (the GA4 id is blank and both GA4 rows are
 * `declared`), so:
 *
 *  - no consent sheet or panel mounts on any page, whatever `fo_consent` holds, and the island's
 *    chunk is **not requested** on load. The chunk is named by the build output (clause 9,
 *    `consentIslandChunk()`), proven to exist first, and found requested by the same matcher once
 *    "Cookie settings" is activated in the same run (the positive control);
 *  - "Cookie settings" opens the settings panel, with or without a recorded decision, focus
 *    inside it; `Esc` closes it, returns focus to the control and writes nothing;
 *  - Save writes `fo_consent` with AC-19's lifetimes and sends a `POST /api/consent` body that
 *    parses under `ConsentDecisionSchema`; a forged value is deleted when the island loads on
 *    activation and rewritten by the Save.
 *
 * The banner-shown halves run in the `consent-active` project (`tests/consent-active/`), against
 * a build with a GA4 fixture id. Every test here starts as a returning visitor (`fo_locale` seeded
 * by `playwright.config.ts`), so no language popup opens in front of the page.
 */
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import {
  CONSENT,
  consentIslandChunk,
  openConsentSettings,
  recordScriptRequests,
  requested,
} from "../support/consent.ts";

import { COOKIE_REGISTRY, isRegisteredCookie } from "../../src/config/cookies";
import {
  CONSENT_POLICY_VERSION,
  ConsentDecisionSchema,
} from "../../src/lib/consent";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

const DAY = 86_400;
/** The register's two lifetimes (`src/config/cookies.ts`), restated as the test's expectation. */
const ACCEPT_SECONDS = 365 * DAY;
const REJECT_SECONDS = 183 * DAY;

interface ConsentCookie {
  readonly value: {
    v: number;
    a: boolean;
    m: boolean;
    ts: string;
    cid: string;
  };
  readonly lifetime: number;
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
  };
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

/** The bodies of every `POST /api/consent` the page sent. */
function captureDecisions(page: Page): unknown[] {
  const bodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (!request.url().includes("/api/consent")) return;
    const raw = request.postData();
    bodies.push(raw === null ? null : JSON.parse(raw));
  });
  return bodies;
}

test.describe("AC-17 (a): nothing asks, nothing loads, until “Cookie settings”", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "e2e-desktop",
      "the sizes are set per case; one project runs them",
    );
  });

  test("the consent island's chunk is in the build output (clause 9's existence check)", () => {
    expect(consentIslandChunk()).toMatch(/^static\/chunks\/.+\.js$/u);
  });

  for (const locale of LOCALES) {
    for (const size of SIZES) {
      test(`/${locale} at ${String(size.width)} × ${String(size.height)}: no sheet, no chunk, no cookie; activation loads it`, async ({
        page,
        context,
      }) => {
        test.setTimeout(60_000);
        const chunk = consentIslandChunk();
        await page.setViewportSize(size);
        const scripts = recordScriptRequests(page);

        const response = await page.goto(`/${locale}`);
        expect(response?.status()).toBe(200);
        expect(response?.headers()["set-cookie"]).toBeUndefined();
        expect(await response!.text()).not.toContain("data-fo-consent=");
        await page.waitForLoadState("networkidle");
        // Past the language popup gate's 4 s fail-open timer: a sheet waiting on it would be up.
        await page.waitForTimeout(5_000);

        await expect(page.locator(CONSENT.sheet)).toHaveCount(0);
        await expect(page.locator(CONSENT.panel)).toHaveCount(0);
        expect(requested(scripts, chunk), `${chunk} requested on load`).toBe(
          false,
        );
        expect(await readConsentCookie(context)).toBeNull();
        await page.keyboard.press("Escape");
        expect(await readConsentCookie(context)).toBeNull();

        // The positive control: the same matcher finds the chunk once the visitor asks.
        await openConsentSettings(page);
        expect(requested(scripts, chunk), `${chunk} after activation`).toBe(
          true,
        );
        expect(await readConsentCookie(context)).toBeNull();
      });
    }
  }
});

test.describe("AC-9 (T-11): “Cookie settings” opens the panel, with or without a decision", () => {
  test("no decision: the panel opens with focus inside; `Esc` closes it, returns focus, writes nothing", async ({
    page,
    context,
  }) => {
    const decisions = captureDecisions(page);
    await page.goto("/en");
    await openConsentSettings(page);
    // The panel, not the banner: the sheet is in its settings state from the first frame.
    await expect(page.locator(CONSENT.shown)).toHaveCount(0);
    await expect(page.locator(`${CONSENT.panel} h3`)).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator(CONSENT.sheet)).toHaveCount(0);
    await expect(page.locator(CONSENT.reopen).first()).toBeFocused();
    expect(await readConsentCookie(context)).toBeNull();
    expect(decisions).toEqual([]);

    // And again: the island's own listener answers every later activation.
    await page.locator(CONSENT.reopen).first().click();
    await expect(
      page.locator(`${CONSENT.settings} ${CONSENT.panel}`),
    ).toBeVisible();
  });

  test("after a decision: the panel opens showing what was recorded", async ({
    page,
    context,
  }) => {
    await page.goto("/de");
    await openConsentSettings(page);
    await page.locator(CONSENT.analytics).check();
    await page.locator(CONSENT.save).click();
    await expect(page.locator(CONSENT.saved)).toBeVisible();
    await page.locator(CONSENT.close).click();
    await expect(page.locator(CONSENT.sheet)).toHaveCount(0);

    // A new page view, with the decision recorded: still no sheet on load.
    await page.goto("/pl");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(CONSENT.sheet)).toHaveCount(0);
    await openConsentSettings(page);
    await expect(page.locator(CONSENT.shown)).toHaveCount(0);
    await expect(page.locator(CONSENT.analytics)).toBeChecked();
    await expect(page.locator(CONSENT.marketing)).not.toBeChecked();
    expect((await readConsentCookie(context))?.value.a).toBe(true);
  });
});

test.describe("AC-19 (a) (T-21): Save from the footer's panel", () => {
  test("analytics on, marketing off: 12 months, exactly that grant, a valid record", async ({
    page,
    context,
  }) => {
    const decisions = captureDecisions(page);
    await page.goto("/en-gb");
    await openConsentSettings(page);
    await page.locator(CONSENT.analytics).check();
    await page.locator(CONSENT.save).click();
    await expect(page.locator(CONSENT.saved)).toBeVisible();

    const cookie = await readConsentCookie(context);
    expect(cookie!.value).toMatchObject({ a: true, m: false });
    expect(cookie!.lifetime).toBeGreaterThan(ACCEPT_SECONDS - 3600);
    expect(cookie!.lifetime).toBeLessThanOrEqual(ACCEPT_SECONDS);
    expect(await consentUpdates(page)).toEqual([
      {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    await expect.poll(() => decisions.length, { timeout: 5000 }).toBe(1);
    expect(ConsentDecisionSchema.parse(decisions[0])).toMatchObject({
      analytics: true,
      marketing: false,
      cid: cookie!.value.cid,
    });
  });

  test("both off: 6 months and no grant", async ({ page, context }) => {
    const decisions = captureDecisions(page);
    await page.goto("/en");
    await openConsentSettings(page);
    await page.locator(CONSENT.save).click();
    await expect(page.locator(CONSENT.saved)).toBeVisible();

    const cookie = await readConsentCookie(context);
    expect(cookie!.value).toMatchObject({ a: false, m: false });
    expect(cookie!.lifetime).toBeGreaterThan(REJECT_SECONDS - 3600);
    expect(cookie!.lifetime).toBeLessThanOrEqual(REJECT_SECONDS);
    const updates = await consentUpdates(page);
    expect(updates).toHaveLength(1);
    expect(Object.values(updates[0]!)).not.toContain("granted");
    await expect.poll(() => decisions.length, { timeout: 5000 }).toBe(1);
    expect(ConsentDecisionSchema.parse(decisions[0])).toMatchObject({
      analytics: false,
      marketing: false,
    });
  });

  for (const value of [
    "%",
    "hello",
    encodeURIComponent('{"v":1,"a":true,"m":true}'),
    encodeURIComponent(
      '{"v":99,"a":true,"m":true,"ts":"2026-09-09T10:00:00.000Z","cid":"6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e"}',
    ),
  ]) {
    test(`a forged \`${value.slice(0, 24)}\` survives the load, is deleted on activation and rewritten by Save`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: "fo_consent", value, url: baseURL ?? "http://localhost:3000" },
      ]);
      await page.goto("/en");
      await page.waitForLoadState("networkidle");
      // Not read on load: nothing mounts to read it (19d clause 2).
      await expect(page.locator(CONSENT.sheet)).toHaveCount(0);
      await openConsentSettings(page);
      // Deleted when the island loads, and no box pre-ticked from a value it could not honour.
      await expect
        .poll(async () =>
          (await context.cookies()).some(
            (cookie) => cookie.name === "fo_consent",
          ),
        )
        .toBe(false);
      await expect(page.locator(CONSENT.analytics)).not.toBeChecked();
      await expect(page.locator(CONSENT.marketing)).not.toBeChecked();
      await page.locator(CONSENT.save).click();
      expect((await readConsentCookie(context))?.value).toMatchObject({
        a: false,
        m: false,
        v: CONSENT_POLICY_VERSION,
      });
    });
  }
});

test.describe("AC-20 (T-22, committed half): the panel from the footer", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: pre-enables no non-essential category; essential has no control`, async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      await openConsentSettings(page);
      await expect(page.locator(CONSENT.analytics)).not.toBeChecked();
      await expect(page.locator(CONSENT.marketing)).not.toBeChecked();
      expect(
        await page.locator('[data-fo-consent-category="essential"]').count(),
      ).toBe(0);
      await expect(page.locator("[data-fo-consent-locked]")).toBeVisible();
    });
  }

  test("lists every register entry with its purpose and lifetime", async ({
    page,
  }) => {
    await page.goto("/en");
    await openConsentSettings(page);
    const panel = page.locator(CONSENT.panel);
    await expect(panel.locator("code")).toHaveCount(COOKIE_REGISTRY.length);
    for (const entry of COOKIE_REGISTRY) {
      await expect(
        panel.locator("code", { hasText: entry.name }).first(),
      ).toBeAttached();
    }
    await expect(panel.getByText("730 days").first()).toBeAttached();
    await expect(panel.getByText("This visit only").first()).toBeAttached();
  });

  test("stays inside the viewport and scrolls internally (WCAG 1.4.10)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/en");
    await openConsentSettings(page);
    const box = await page.locator(CONSENT.settings).boundingBox();
    expect(box!.height).toBeLessThanOrEqual(568);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(
      await page
        .locator(CONSENT.settings)
        .evaluate((element) => element.scrollHeight > element.clientHeight + 1),
    ).toBe(true);
    await page.locator(CONSENT.save).scrollIntoViewIfNeeded();
    await expect(page.locator(CONSENT.save)).toBeVisible();
  });

  test("each category row is a full-width, 44 px tap target", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    await openConsentSettings(page);
    const panelWidth = (await page.locator(CONSENT.panel).boundingBox())!.width;
    for (const category of ["analytics", "marketing"] as const) {
      const box = (await page
        .locator(`[data-fo-consent-row="${category}"]`)
        .boundingBox())!;
      expect(box.height, `${category} row height`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${category} row width`).toBeGreaterThanOrEqual(
        panelWidth - 2,
      );
    }
  });
});

test.describe("AC-22 (T-24): after a Save with every category on, from the footer's panel", () => {
  test("every cookie is in the register, none is analytics, and no third party is asked", async ({
    page,
    context,
    baseURL,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto("/en");
    await openConsentSettings(page);
    await page.locator(CONSENT.analytics).check();
    await page.locator(CONSENT.marketing).check();
    await page.locator(CONSENT.save).click();
    await expect(page.locator(CONSENT.saved)).toBeVisible();
    await page.waitForLoadState("networkidle");

    const names = (await context.cookies())
      .map((cookie) => cookie.name)
      .filter((name) => !name.startsWith("_vercel"));
    expect(names).toContain("fo_consent");
    expect(names.filter((name) => !isRegisteredCookie(name))).toEqual([]);
    expect(names.filter((name) => name.startsWith("_ga"))).toEqual([]);

    const base = new URL(baseURL ?? "http://localhost:3000");
    const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const allowed = new Set([
      MEDIA_ORIGIN,
      ...(local.has(base.hostname) ? [] : ["https://vercel.live"]),
    ]);
    expect([
      ...new Set(
        requests
          .map((url) => new URL(url).origin)
          .filter((origin) => origin !== base.origin && !allowed.has(origin)),
      ),
    ]).toEqual([]);

    // Default first, update second: a tag that loads later reads denied and is then told.
    expect(
      await page.evaluate(() =>
        ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [])
          .map((entry) => Array.from(entry as ArrayLike<unknown>))
          .filter((entry) => entry[0] === "consent")
          .map((entry) => String(entry[1])),
      ),
    ).toEqual(["default", "update"]);
  });
});
