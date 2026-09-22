/**
 * The client-JS budget, measured in a real browser (spec 004 §14 A1 and its addendum, AC-24's
 * script-transfer clause; TASK-085).
 *
 * `pnpm budget:client-js` measures the same thing from the build output, and the whole reason this
 * file exists is that a static measurement is a *model* of what a browser fetches, and the model
 * has been wrong twice:
 *
 *  - `/review 26`: it read only the document's `<script src>` list, so a `next/dynamic` chunk —
 *    72.5 KB of zod, at the time — was invisible to it;
 *  - `/review 36`: it then charged every route the whole app's `next/dynamic` chunk groups,
 *    because Turbopack writes the same ids into every route's `react-loadable-manifest.json`, so
 *    `/` was billed 14.9 KB Brotli for islands the chooser never mounts.
 *
 * So the model is now checked against Chromium instead of being trusted: this spec records every
 * `/_next/static/**.js` response the browser makes for a URL, hydration and post-hydration
 * dynamic imports included, and asserts the two sets are **equal** — neither missing an asset the
 * browser fetched nor charging one it did not.
 *
 * The byte total is then computed the same way `budget:client-js` does — Brotli of the file in
 * `.next/static` — because `next start` serves gzip (or nothing) locally while Vercel serves
 * Brotli, and the budget is stated in Brotli transfer. What the browser contributes is the
 * **set**; what the encoder contributes is the size, and both halves are named in the failure
 * message.
 *
 * Skipped unless the target is a local `next start` with the matching `.next` beside it: against a
 * Vercel preview the chunk hashes belong to a different build, so the file-level comparison would
 * be meaningless. The static half runs everywhere, in CI's `build` job.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  CLIENT_JS_BUDGET_BYTES,
  measurePages,
} from "../../scripts/client-js-budget.ts";

const DIST = resolve(import.meta.dirname, "../../.next");
const URLS = [
  "/",
  "/en",
  "/en-gb",
  "/de",
  "/pl",
  // The corridor page (spec 007 AC-24; TASK-091): no island, so the browser must fetch exactly
  // the locale home's script set and nothing more.
  "/en/send-flowers-to/poland",
  "/en-gb/send-flowers-to/poland",
  // The listing page types (spec 008 AC-23; TASK-109, TASK-110, TASK-111): none of them mounts an
  // island, so the browser must fetch exactly the locale home's script set on every one.
  //
  // The **country shop root** carries a second job here. It is dynamically rendered — it reads
  // `?page=`/`?sort=` (TASK-114) — so `budget:client-js` has no prerendered document for it and
  // measures the corridor page, which shares its route entry (spec 008 §14 A5). These two rows
  // are the check that makes that substitution safe rather than assumed: the browser's real
  // script set for the served shop root must equal what the script charges, in both directions.
  "/en/poland/flowers",
  "/en-gb/poland/flowers",
  // The depth-4 listings (TASK-110, TASK-111) are prerendered and measured directly.
  "/en/poland/flowers/roses",
] as const;

const SCRIPT_URL = /\/_next\/(static\/.+\.js)(?:\?|$)/;

test.describe("the script set a browser fetches (AC-24, §14 A1)", () => {
  test.skip(
    () =>
      !existsSync(DIST) ||
      !(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").includes(
        "localhost",
      ),
    "needs a local `next start` served from the `.next` this checkout built",
  );

  for (const url of URLS) {
    test(`${url} fetches exactly what \`budget:client-js\` charges it`, async ({
      page,
    }) => {
      const fetched = new Set<string>();
      page.on("response", (response) => {
        const asset = SCRIPT_URL.exec(response.url())?.[1];
        if (asset !== undefined) fetched.add(asset);
      });

      await page.goto(url);
      await page.waitForLoadState("networkidle");
      // The islands are `next/dynamic({ ssr: false })`: their import starts on mount, i.e. after
      // hydration, which `networkidle` can win the race against on a warm cache-less run.
      await page.waitForTimeout(1_000);

      const [measured] = measurePages(DIST, [url]);
      const charged = new Set(
        (measured?.assets ?? [])
          .filter((asset) => !asset.noModule)
          .map((asset) => asset.asset),
      );

      expect(
        [...fetched].filter((asset) => !charged.has(asset)).sort(),
        "fetched by the browser and not charged by budget:client-js",
      ).toEqual([]);
      expect(
        [...charged].filter((asset) => !fetched.has(asset)).sort(),
        "charged by budget:client-js and not fetched by the browser",
      ).toEqual([]);
      expect(
        measured?.fetchedBrotliBytes ?? Number.POSITIVE_INFINITY,
        `${url}: Brotli transfer of the ${String(fetched.size)} scripts the browser fetched`,
      ).toBeLessThanOrEqual(CLIENT_JS_BUDGET_BYTES);
    });
  }
});
