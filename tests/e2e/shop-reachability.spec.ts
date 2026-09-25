/**
 * **T-21 / AC-21** — the shop link crawl (spec 008 §2 "Links", §9 AC-20 L284, AC-21 L285, §10
 * T-20/T-21; TASK-113).
 *
 * > "An e2e crawl of every `<a href>` on all six page types in all four locales finds zero links
 * > to a non-200 URL and zero links to an unpublished link id; BFS depth from every locale home
 * > to every page in this spec is ≤3."
 *
 * **Why this file exists, and why it is a BFS and not a link check.** On 2026-09-22 production
 * served 294 shop URLs and **nothing linked to any of them**: `/en` carried eight internal links,
 * every one to a country guide; `/en/send-flowers-to/poland` carried four and not one reached
 * `/en/poland/flowers`, a page live since PR #89 with 84 priced products. `tests/e2e/links.spec.ts`
 * was green throughout — and correctly so, because it asks "does every link that exists answer
 * 200", and a page nothing links to has no link to fail on. **A link crawl passes vacuously on an
 * orphan.**
 *
 * So the criterion that carries the weight here is the *third* one, stated in the direction that
 * cannot be satisfied by silence:
 *
 *  1. **Reachability (AC-21, and the one that would have caught the defect).** From each locale
 *     home, breadth-first over rendered `<a href>`s, every URL in that locale's listing existence
 *     set — the same `listingPages()` set `generateStaticParams` emits — is reached at **depth
 *     ≤3**. Withdraw the `country-shop-root` publication and this goes red on the first locale;
 *     it cannot pass with its subject removed, which is the property seven defects in this
 *     repository lacked.
 *  2. **Every `<a href>` the crawl meets answers 200**, followed with `maxRedirects: 0` so a 308
 *     is a failure and not a silently-followed hop.
 *  3. **No `<a href>` points into an unpublished link id's URL space** — for a `route` target the
 *     one path it would occupy, and for a `listing` **family** every member of that family in the
 *     existence set. That is spec 004 AC-14 asked of a set of URLs rather than of one.
 *
 * **What it fetches.** Pages at depth 0, 1 and 2 are fetched and their links read; a link found on
 * a depth-2 page is recorded at depth 3 and its *status* is checked, but its own links are not
 * followed — depth 3 is the bound, so what lies beyond it is not part of the criterion. Every URL
 * is fetched at most once per locale.
 *
 * **One documented exclusion, and it is an escalation and not a waiver.** The **category hub**
 * (`/{locale}/{shopCategory}/{slug}`, §2 row 10) has no publisher: spec 008 §2's link plan names
 * five reserved ids and none of them is a category hub, and no page type in the spec links to one
 * — the country category's link list is "shop root, sibling categories, corridor, products". The
 * header's category row could carry them, but it is `src/config/categories.ts`, spec 004's
 * registry, and no task in spec 008 owns it. Recorded as an open question in
 * `docs/tasks/TASK-113.md` rather than resolved by inventing a link id. `EXCLUDED` (`tests/support/shop-crawl-targets.ts`) holds it
 * and the second escalation (the draft locales' shop roots), and is asserted to be exactly those
 * three rules, so it cannot quietly grow.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type APIRequestContext, expect, test } from "@playwright/test";

import {
  SITE_LINKS,
  type SiteLink,
  isPublished,
} from "../../src/config/site-links.ts";
// By path and not through the barrel: `@/modules/i18n`'s index re-exports the suggestion banner's
// `next/dynamic` loader, which Playwright's ESM loader cannot resolve outside the Next build.
import { localePath } from "../../src/modules/i18n/routing.ts";
import {
  EXCLUDED,
  TARGETS,
  isExcluded,
} from "../support/shop-crawl-targets.ts";

/**
 * The existence set, read from the committed fixture rather than computed.
 *
 * `modules/catalog` cannot be imported here at all — its graph reaches the same `next/dynamic`
 * through the `modules/i18n` barrel, and loosening the module boundary to suit a test would trade
 * an architectural rule for a convenience (`plan/01` §5). `tests/unit/listing-url-fixture.test.ts`
 * regenerates this file from `listingPages()` and compares it byte for byte, so it cannot go
 * stale without a unit test going red first — the `tests/fixtures/seo/sitemap` arrangement,
 * applied to the shop.
 */
const EXISTENCE_SET = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../fixtures/shop/listing-urls.json"),
    "utf8",
  ),
) as Readonly<Record<string, readonly { pageType: string; path: string }[]>>;

/** AC-21's bound, and the reason this file is a BFS (`plan/02` §11). */
const MAX_DEPTH = 3;

const locales = Object.keys(EXISTENCE_SET);

/** The listing pages that exist in one locale, minus the escalated ones. */
function expectedPages(
  locale: string,
): readonly { pageType: string; path: string }[] {
  return (EXISTENCE_SET[locale] ?? []).filter(
    (page) => !isExcluded(locale, page.pageType),
  );
}

/** A page list counted by page type, in the shape `TARGETS` is written in. */
function countByType(
  pages: readonly { pageType: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const page of pages) {
    counts[page.pageType] = (counts[page.pageType] ?? 0) + 1;
  }
  return counts;
}

/**
 * Every URL an **unpublished** link id would occupy, in one locale.
 *
 * A `route` target occupies one path. A `listing` **family** occupies every member of its page
 * type in the existence set — which is the whole reason a family is its own target kind: the
 * permission is over a set, so the prohibition has to be too. A `pending` target has no route
 * shape at all and therefore no path anything could link to.
 */
function forbiddenPaths(locale: string): ReadonlySet<string> {
  const paths = new Set<string>();
  const pages = EXISTENCE_SET[locale] ?? [];
  for (const link of SITE_LINKS as readonly SiteLink[]) {
    if (isPublished(link.id)) continue;
    if (link.target.kind === "route") {
      paths.add(localePath(locale, link.target.pageType));
      continue;
    }
    if (link.target.kind === "listing") {
      const pageType = link.target.pageType;
      for (const page of pages) {
        if (page.pageType === pageType) paths.add(page.path);
      }
    }
  }
  return paths;
}

/** The `<a href>`s of a served document, normalised to a same-origin path or left as they are. */
function hrefsIn(html: string): readonly string[] {
  return [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

interface Fetched {
  readonly status: number;
  readonly html: string;
}

/** One GET, never following a redirect: a 308 to a trailing slash is a failure, not a hop. */
async function get(request: APIRequestContext, path: string): Promise<Fetched> {
  const response = await request.get(path, { maxRedirects: 0 });
  const status = response.status();
  const type = response.headers()["content-type"] ?? "";
  return {
    status,
    html:
      status === 200 && type.includes("text/html") ? await response.text() : "",
  };
}

interface CrawlResult {
  /** Every internal path the crawl saw, with the shallowest depth it was seen at. */
  readonly depthOf: ReadonlyMap<string, number>;
  /** Every non-200 internal path, with the status it answered and the page that linked it. */
  readonly broken: readonly string[];
  /** Every link into an unpublished id's URL space, with the page that drew it. */
  readonly unpublished: readonly string[];
  /** Every `href` that was neither a fetchable path nor a well-formed contact channel. */
  readonly malformed: readonly string[];
}

/**
 * Breadth-first from one locale home, to `MAX_DEPTH`.
 *
 * Only this locale's own URL space is followed: a link to `/de/...` from `/en` is a language
 * switch, is status-checked, and is not crawled — the criterion is "depth from **every** locale
 * home", which is four separate crawls and not one crawl through the switcher.
 */
async function crawl(
  request: APIRequestContext,
  locale: string,
): Promise<CrawlResult> {
  const forbidden = forbiddenPaths(locale);
  const depthOf = new Map<string, number>([[`/${locale}`, 0]]);
  const status = new Map<string, number>();
  const broken: string[] = [];
  const unpublished: string[] = [];
  const malformed: string[] = [];

  let frontier: string[] = [`/${locale}`];
  for (let depth = 0; depth <= MAX_DEPTH; depth += 1) {
    const next: string[] = [];
    for (const path of frontier) {
      const page = await get(request, path);
      status.set(path, page.status);
      if (page.status !== 200) {
        broken.push(`${path} → ${String(page.status)}`);
        continue;
      }
      // Depth `MAX_DEPTH` is the bound: its own links are outside the criterion, so the page is
      // fetched for its status and not read for its links.
      if (depth === MAX_DEPTH) continue;

      for (const href of hrefsIn(page.html)) {
        if (href === "" || href === "#") {
          malformed.push(`${path} → ${JSON.stringify(href)}`);
          continue;
        }
        // An in-page anchor resolves to the document it is on, which is already fetched.
        if (href.startsWith("#")) continue;
        if (!href.startsWith("/")) {
          // A contact channel or an outbound link: checked for shape, never fetched. `http:` is
          // refused as well as malformed — an insecure outbound link is a finding of its own.
          if (!/^(?:mailto:|tel:|https:\/\/)\S+$/u.test(href)) {
            malformed.push(`${path} → ${href}`);
          }
          continue;
        }
        const target = href.split("#")[0] ?? href;
        if (forbidden.has(target)) {
          unpublished.push(`${path} → ${target}`);
        }
        const seen = depthOf.get(target);
        if (seen !== undefined && seen <= depth + 1) continue;
        depthOf.set(target, depth + 1);
        // Another locale's document is status-checked but not walked: a language switch is not a
        // step on the path from *this* home.
        if (target === `/${locale}` || target.startsWith(`/${locale}/`)) {
          next.push(target);
        } else if (status.get(target) === undefined) {
          const other = await get(request, target);
          status.set(target, other.status);
          if (other.status !== 200) {
            broken.push(`${path} → ${target} → ${String(other.status)}`);
          }
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return { depthOf, broken, unpublished, malformed };
}

test.describe("AC-21: the shop is reachable, and links at nothing that is not", () => {
  // Generous: a locale home's depth-3 neighbourhood is ~150 documents in `en`, each one GET.
  test.describe.configure({ timeout: 300_000 });

  for (const locale of locales) {
    test(`/${locale}: every listing page is ≤${String(MAX_DEPTH)} clicks from the locale home`, async ({
      request,
    }) => {
      // The corpus has to have something in it, or every assertion below is vacuous — the exact
      // failure this file was written to end. Asserted on the **whole** existence set, before the
      // escalated exclusions are applied, so a waiver can never be what makes a locale pass.
      expect(
        (EXISTENCE_SET[locale] ?? []).length,
        `${locale} has listing pages`,
      ).toBeGreaterThan(0);
      const expected = expectedPages(locale);
      // And the **crawl's own** target set is exactly the one this locale is supposed to have,
      // type by type. `de` and `pl` are pinned empty by their escalation, so their green is an
      // honest zero and not an undetected emptying of the corpus; `en` and `en-gb` carry the shop.
      const pinned = TARGETS[locale];
      expect(pinned, `${locale} has a pinned target set`).toBeDefined();
      expect(countByType(expected), `${locale} crawl targets by type`).toEqual(
        pinned,
      );

      const result = await crawl(request, locale);

      const unreachable = expected
        .filter(
          (page) => (result.depthOf.get(page.path) ?? Infinity) > MAX_DEPTH,
        )
        .map((page) => `${page.pageType} ${page.path}`);
      // Soft, so one run names **every** finding: a broken link usually also orphans its target,
      // and the reviewer needs the 404 *and* the page it stranded, not the first of the two. A
      // soft failure still fails the test.
      expect
        .soft(
          unreachable,
          `unreachable from /${locale} within ${String(MAX_DEPTH)} clicks`,
        )
        .toEqual([]);

      expect.soft(result.broken, `non-200 links from /${locale}`).toEqual([]);
      expect
        .soft(
          result.unpublished,
          `links into an unpublished link id from /${locale}`,
        )
        .toEqual([]);
      expect
        .soft(result.malformed, `malformed hrefs from /${locale}`)
        .toEqual([]);

      // **A waiver expires** (`/review 98` round 1, required change 6). Every page `EXCLUDED`
      // covers is asserted to be still out of reach. The day an escalation is resolved (the
      // header's category row publishes the hubs, or a draft locale gains an inbound edge), its
      // pages become reachable, this goes red, and the rule has to be deleted rather than left to
      // excuse whatever breaks next.
      const waivedButReached = (EXISTENCE_SET[locale] ?? [])
        .filter((page) => isExcluded(locale, page.pageType))
        .filter(
          (page) => (result.depthOf.get(page.path) ?? Infinity) <= MAX_DEPTH,
        )
        .map((page) => `${page.pageType} ${page.path}`);
      expect
        .soft(
          waivedButReached,
          `waived pages reachable from /${locale}: delete their EXCLUDED rule`,
        )
        .toEqual([]);

      // Last, and about the crawl rather than about the site: it walked a neighbourhood, not an
      // empty frontier. Every list above is `[]` when nothing was fetched, so this is the line
      // that makes a silent `[]` a failure. Measured on a production build (2026-09-22, after the
      // rebase onto TASK-114): 237 documents from `/en` and from `/en-gb`, 5 from `/de` and `/pl`.
      expect(
        result.depthOf.size,
        `documents reached from /${locale}`,
      ).toBeGreaterThan(expected.length);
    });
  }

  test("`/` links every locale home at depth 1, so the shop is ≤4 clicks from the root", async ({
    request,
  }) => {
    // The per-locale bound above starts at the locale home; a visitor with no locale starts at
    // the chooser. Asserting the one hop in between — a rendered `<a href>` to each home, each
    // answering 200 — is what turns "≤3 from every locale home" into "≤4 from `/`" without a
    // fifth crawl. Asserted as the exact set of homes, not "some links exist".
    const root = await get(request, "/");
    expect(root.status, "/").toBe(200);
    const homes = new Set(
      hrefsIn(root.html).filter((href) =>
        locales.some((locale) => href === `/${locale}`),
      ),
    );
    expect([...homes].sort(), "locale homes linked from /").toEqual(
      locales.map((locale) => `/${locale}`).sort(),
    );
    for (const home of homes) {
      expect((await get(request, home)).status, home).toBe(200);
    }
  });

  test("the escalated exclusions are exactly the two named, and each covers real URLs", () => {
    // A test over the *waiver*, so widening it is a diff a reviewer sees, and a waiver that
    // covered nothing would fail here rather than quietly soften the criterion.
    expect(EXCLUDED).toEqual([
      { pageType: "categoryHub" },
      { locale: "de", pageType: "countryShopRoot" },
      { locale: "pl", pageType: "countryShopRoot" },
    ]);
    for (const rule of EXCLUDED) {
      const covered = Object.entries(EXISTENCE_SET)
        .filter(
          ([locale]) => rule.locale === undefined || locale === rule.locale,
        )
        .flatMap(([, pages]) => pages)
        .filter((page) => page.pageType === rule.pageType);
      expect(covered.length, JSON.stringify(rule)).toBeGreaterThan(0);
    }
    // **The indexable locales carry no exclusion but the category hub.** That is the half of
    // AC-21 that protects organic ranking, and it is asserted in the direction that cannot be
    // padded: every English listing page bar a category hub is in the crawl's target set.
    for (const locale of ["en", "en-gb"]) {
      const pages = EXISTENCE_SET[locale] ?? [];
      const excluded = pages.filter((page) =>
        isExcluded(locale, page.pageType),
      );
      expect(
        [...new Set(excluded.map((page) => page.pageType))],
        locale,
      ).toEqual(["categoryHub"]);
      expect(expectedPages(locale).length, locale).toBe(183);
    }
  });
});
