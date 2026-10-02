/**
 * The committed **listing URL set**, generated from the real existence predicate (spec 008 §2,
 * AC-3, AC-21; TASK-113).
 *
 * Writes `tests/fixtures/shop/listing-urls.json` from `listingPages()` — the same function
 * `generateStaticParams`, the sitemap builders and the route resolver read — so one file states,
 * in bytes a reviewer can read, exactly which shop URLs exist in which locale.
 *
 * It exists for two reasons, and the second is the whole point of the task:
 *
 *  - **`tests/e2e/shop-reachability.spec.ts` needs the set and cannot compute it.** Playwright's
 *    ESM loader cannot resolve the `next/dynamic` import that `modules/catalog`'s import graph
 *    reaches through the `modules/i18n` barrel (`import/no-restricted-paths` keeps the module
 *    boundary, `plan/01` §5 — the crawl is not the place to loosen it). The sibling
 *    `scripts/seo/generate-sitemap-fixtures.ts` documents the same wall and answers it the same
 *    way: the generator is a module, and a Vitest test is its CLI.
 *  - **The crawl's expected set becomes a committed artifact.** A crawl that computed its own
 *    target list from the pages it happened to find would pass on an orphan, which is the exact
 *    failure of 2026-09-22 (294 shop URLs served, nothing linking to any of them). Reading the
 *    set from data that moves with the catalogue is what makes "unreachable" a failure rather
 *    than a silence.
 *
 * Refresh it after a deliberate data change:
 *
 *     UPDATE_SHOP_FIXTURES=1 pnpm test tests/unit/listing-url-fixture.test.ts
 *
 * No clock, no network, no database: `listingPages()` reads the committed catalogue and the
 * country registry and nothing else, so the bytes are stable across machines and days.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { listingLocales, listingPages } from "@/modules/catalog";

export const FIXTURE_PATH = "tests/fixtures/shop/listing-urls.json";

/** One URL of the existence set: its page type and its path, and nothing that could drift. */
export interface ListingUrlFixtureEntry {
  readonly pageType: string;
  readonly path: string;
}

export type ListingUrlFixture = Readonly<
  Record<string, readonly ListingUrlFixtureEntry[]>
>;

/** The existence set, per locale, in `listingPages()`' own order. */
export async function generateListingUrlFixture(): Promise<ListingUrlFixture> {
  const fixture: Record<string, ListingUrlFixtureEntry[]> = {};
  for (const locale of listingLocales()) {
    fixture[locale] = (await listingPages(locale)).map((page) => ({
      pageType: page.pageType,
      path: page.path,
    }));
  }
  return fixture;
}

/** The fixture's exact bytes — two-space JSON with a trailing newline, the Prettier shape. */
export function serialiseListingUrlFixture(fixture: ListingUrlFixture): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

export function fixtureAbsolutePath(): string {
  return resolve(import.meta.dirname, "../..", FIXTURE_PATH);
}

export async function writeListingUrlFixture(): Promise<void> {
  const path = fixtureAbsolutePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    serialiseListingUrlFixture(await generateListingUrlFixture()),
    "utf8",
  );
}
