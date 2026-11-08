/**
 * **T-28 / AC-27** (the visual half) — spec 041's three templates (TASK-184), against the round-2
 * artboards (`docs/design/wireframes/how-it-works-*`, `help-and-contact-*`, `legal-template-*` and
 * `cookies-*`, PR 189; spec 004 §14 A24).
 *
 * > "Visual baselines exist on both platforms for the trust page, help and legal document
 * > templates at desktop and mobile."
 *
 * One page per template: the trust page is how it works, the help page is help and contact, the
 * legal document is the cookie notice (the one legal page that exists before registration with
 * every block: version header, draft line, contents, register, re-open button, change log). Each
 * is photographed as `main` at the artboard widths (1440 and 390), with the header unstuck so the
 * breadcrumb is in the picture (`./static-header.css`); the header and footer keep their own
 * baselines. At 390 a second, first-screen shot keeps the phone chrome the brief names in the
 * picture: the back link and the dock (spec 004 §14 A24 carry-forward). Only the cookie notice's
 * dock is built today; the WhatsApp and Send flowers docks of spec 041 §14 A1 are TASK-182's open
 * escalation E6, so the trust and help first screens are re-taken when they land. One `de` draft's first
 * screen pins the untranslated line under the not-open line (the States rows, AC-23). The help
 * page under `/ar-XB` is in `./pseudo-rtl.spec.ts` (spec 041 §7 "RTL").
 */
import { fileURLToPath } from "node:url";

import { type BrowserContext, expect, test } from "@playwright/test";

/** A recorded refusal, so the consent banner is not in the photograph (`./hubs.spec.ts`). */
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
          ts: "2026-09-09T00:00:00.000Z",
          cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
        }),
      ),
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

const HEADER_STYLE = fileURLToPath(
  new URL("./static-header.css", import.meta.url),
);

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

const TEMPLATES = [
  { name: "info-trust", url: "/en/how-it-works" },
  { name: "info-help", url: "/en/help" },
  { name: "info-legal", url: "/en/legal/cookies" },
] as const;

async function open(
  page: import("@playwright/test").Page,
  context: BrowserContext,
  baseURL: string | undefined,
  url: string,
  viewport: { width: number; height: number },
): Promise<void> {
  await recordConsentRefusal(context, baseURL);
  await page.setViewportSize(viewport);
  // No locale-suggestion banner in the photograph (spec 003's `i18n-suggestion-banner`).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  await expect(page.locator("main h1")).toBeVisible();
}

for (const { name, url } of TEMPLATES) {
  for (const [label, viewport] of [
    ["desktop", DESKTOP],
    ["mobile", MOBILE],
  ] as const) {
    test(`${name}-${label} matches its artboard at ${String(viewport.width)}px`, async ({
      page,
      context,
      baseURL,
    }) => {
      await open(page, context, baseURL, url, viewport);
      await expect(page.locator("main")).toHaveScreenshot(
        `${name}-${label}.png`,
        { stylePath: HEADER_STYLE },
      );
    });
  }

  test(`${name}-mobile-first: the first screen at 390px, with the back link and the dock`, async ({
    page,
    context,
    baseURL,
  }) => {
    await open(page, context, baseURL, url, MOBILE);
    await expect(page).toHaveScreenshot(`${name}-mobile-first.png`);
  });
}

test("info-draft-de-desktop-first: the untranslated line under the not-open line", async ({
  page,
  context,
  baseURL,
}) => {
  await open(page, context, baseURL, "/de/so-funktioniert-es", DESKTOP);
  await expect(page.locator("[data-fo-untranslated]")).toBeVisible();
  await expect(page).toHaveScreenshot("info-draft-de-desktop-first.png");
});
