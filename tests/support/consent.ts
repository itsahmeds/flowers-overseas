/**
 * The consent layer as the browser suites drive it (spec 004 §14 A-founder-2026-10-19d; TASK-279).
 *
 * Since 19d the committed build asks nothing: `consentSources()` finds no active source, so no
 * sheet mounts and the island's chunk is not requested until the footer's "Cookie settings" is
 * activated, which opens the settings panel. Every suite that used to wait for the sheet now opens
 * the panel from the footer (`openConsentSettings`), and the banner-shown cases run in the
 * `consent-active` project, against a second build with `NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-FIXTURE00`
 * (clause 8; `tests/consent-active/`).
 *
 * **Clause 9, the chunk matcher.** A "chunk not requested" assertion names the consent island's
 * chunk by the file the build output records for it: the entries of the locale page's
 * `react-loadable-manifest.json` (the file `pnpm budget:client-js` counts) whose bytes carry the
 * island's marker. `consentIslandChunks()` throws unless exactly one such file exists and is
 * non-empty, so a wrong name, a moved manifest or an emptied file cannot pass as "not requested";
 * the same run then activates "Cookie settings" and the same matcher must find it requested.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, expect } from "@playwright/test";

export const CONSENT = {
  sheet: "[data-fo-consent]",
  shown: '[data-fo-consent="shown"]',
  settings: '[data-fo-consent="settings"]',
  saved: '[data-fo-consent="saved"]',
  panel: "[data-fo-consent-panel]",
  accept: '[data-fo-consent-action="accept"]',
  reject: '[data-fo-consent-action="reject"]',
  choose: '[data-fo-consent-action="settings"]',
  save: '[data-fo-consent-action="save"]',
  close: '[data-fo-consent-action="close"]',
  analytics: '[data-fo-consent-category="analytics"]',
  marketing: '[data-fo-consent-category="marketing"]',
  reopen: "[data-fo-consent-reopen]",
  fixed: '[data-fo-consent-sheet="fixed"]',
} as const;

/**
 * Activate the footer's "Cookie settings" and wait for the panel, loaded. Before hydration the
 * button does nothing (as with JavaScript off, spec 041 §5), so the click is retried until the
 * panel is there: the assertion is that activation opens it, not how fast the page hydrates.
 */
export async function openConsentSettings(page: Page): Promise<void> {
  const control = page.locator(CONSENT.reopen).first();
  await expect(async () => {
    await control.click();
    await expect(
      page.locator(`${CONSENT.settings} ${CONSENT.panel}`),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** The build output the suites run against (`next start` over `.next` in the checkout). */
const DIST = resolve(import.meta.dirname, "../../.next");
/** The locale page's loadable manifest: the `next/dynamic` chunks of every `/{locale}` document. */
const LOCALE_PAGE_MANIFEST = join(
  DIST,
  "server/app/[locale]/page/react-loadable-manifest.json",
);
/**
 * A literal the consent island's chunk carries and no other chunk of that manifest does: the
 * sheet's viewport anchor (`ConsentBannerView`, which only the island renders on a locale page; the
 * settings panel is its own chunk and does not carry it).
 */
export const CONSENT_ISLAND_MARKER = "data-fo-consent-sheet";

/** `static/chunks/….js`: the consent island's chunk, resolved and checked (clause 9). */
export function consentIslandChunk(): string {
  if (!existsSync(LOCALE_PAGE_MANIFEST)) {
    throw new Error(
      `no ${LOCALE_PAGE_MANIFEST}: the suite needs the build it is testing in the checkout`,
    );
  }
  const manifest = JSON.parse(
    readFileSync(LOCALE_PAGE_MANIFEST, "utf8"),
  ) as Record<string, { files?: readonly string[] }>;
  const files = [
    ...new Set(
      Object.values(manifest).flatMap(({ files: listed = [] }) =>
        listed.filter((file) => file.endsWith(".js")),
      ),
    ),
  ];
  const matches = files.filter((file) => {
    const path = join(DIST, file);
    return (
      existsSync(path) &&
      readFileSync(path, "utf8").includes(CONSENT_ISLAND_MARKER)
    );
  });
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one consent island chunk in ${LOCALE_PAGE_MANIFEST}, found ${String(matches.length)} of ${String(files.length)}`,
    );
  }
  const chunk = matches[0]!;
  if (statSync(join(DIST, chunk)).size === 0) {
    throw new Error(`the consent island chunk ${chunk} is empty`);
  }
  return chunk;
}

/** Every script URL the page requests, from the first byte (`page.on("request")`). */
export function recordScriptRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") urls.push(request.url());
  });
  return urls;
}

/** Whether `urls` holds a request for `chunk` (`static/chunks/x.js` → `/_next/static/chunks/x.js`). */
export function requested(urls: readonly string[], chunk: string): boolean {
  return urls.some((url) => new URL(url).pathname === `/_next/${chunk}`);
}
