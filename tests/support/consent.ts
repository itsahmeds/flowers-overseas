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
 * chunk by the file the build output records for it: the lazy chunks Turbopack's loader stubs
 * request (`lazyChunksNamedIn`, the edge `pnpm budget:client-js` reads since TASK-376, when
 * `React.lazy` replaced `next/dynamic` and `react-loadable-manifest.json` stopped being written)
 * whose bytes carry the island's mark (`CONSENT_ISLAND_MARKER`). `consentIslandChunk()` throws
 * unless exactly one such file exists and is non-empty, so a wrong name, a missing build or an
 * emptied file cannot pass as "not requested"; the same run then activates "Cookie settings" and
 * the same matcher must find it requested.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, expect } from "@playwright/test";

import {
  CONSENT_ISLAND_MARKER,
  lazyChunksNamedIn,
} from "../../scripts/client-js-budget.ts";

export { CONSENT_ISLAND_MARKER };

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

/**
 * Every lazy chunk of the build that carries `marker`: the chunk paths any loader stub under
 * `static/chunks` requests (`lazyChunksNamedIn`), kept where the emitted file's bytes include the
 * literal. Throws without a build, so "no such chunk" and "no build to look in" differ.
 */
export function lazyChunksCarrying(marker: string, dist = DIST): string[] {
  const chunks = join(dist, "static/chunks");
  if (!existsSync(chunks)) {
    throw new Error(
      `no ${chunks}: the suite needs the build it is testing in the checkout`,
    );
  }
  const named = new Set<string>();
  for (const file of readdirSync(chunks, {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!file.endsWith(".js")) continue;
    for (const asset of lazyChunksNamedIn(
      readFileSync(join(chunks, file), "utf8"),
    )) {
      named.add(asset);
    }
  }
  return [...named].sort().filter((asset) => {
    const path = join(dist, asset);
    return existsSync(path) && readFileSync(path, "utf8").includes(marker);
  });
}

/** `static/chunks/….js`: the consent island's chunk, resolved and checked (clause 9). */
export function consentIslandChunk(): string {
  const matches = lazyChunksCarrying(CONSENT_ISLAND_MARKER);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one lazy chunk carrying ${CONSENT_ISLAND_MARKER}, found ${String(matches.length)}`,
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
