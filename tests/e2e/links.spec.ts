/**
 * **T-16 / AC-14** — the link crawl (spec 004 §6 "Internal links", §9 AC-14, §10 T-16; TASK-054).
 *
 * > "An e2e crawl of every `<a href>` in the header, footer and home of all four locales plus `/`
 * > finds **zero** links to a non-200 URL and zero links to an unpublished `site-links.ts` target;
 * > `robots.txt` still `Disallow: /`; every localised document still `noindex,nofollow` and `/`
 * > still `noindex,follow`."
 *
 * `tests/e2e/header.spec.ts` and `tests/e2e/footer.spec.ts` assert the two chrome halves against
 * the registry; this file is the whole-document crawl that closes the criterion, and it is
 * deliberately written as a crawl rather than as five more registry assertions: the point of
 * AC-14 is that **nothing on a served page** links to a URL that answers anything but 200 — a
 * section added by a later task, a copy edit that pastes an `href`, or a component that renders a
 * `#` placeholder are exactly the faults a registry-shaped test cannot see.
 *
 * Three properties, each with its own failure mode:
 *
 *  1. **Every internal `href` answers 200**, followed with `maxRedirects: 0` so a 308 to a
 *     trailing-slash variant is a failure and not a silently-followed hop. Anchors on the current
 *     page are resolved to their document; `mailto:`/`tel:` are checked for shape only, because
 *     they are not URLs a crawler fetches.
 *  2. **No `href` resolves to an unpublished `site-links.ts` target.** The registry's paths are
 *     computed per locale from the same data the chrome renders from, so publishing a page
 *     (spec 007) flips this from "must not appear" to "may appear" with no edit here.
 *  3. **The index gates are unchanged**: `robots.txt` still disallows everything, each localised
 *     document is `noindex,nofollow`, and `/` is `noindex,follow` (spec 003 AC-7).
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

import { SITE_LINKS, type SiteLink, isPublished } from "@/config/site-links";
// By path and not through the barrel: `@/modules/i18n`'s index re-exports the suggestion
// banner's `next/dynamic` loader, which Playwright's ESM loader cannot resolve outside the Next
// build. `routing.ts` is the URL builder and imports only the registry.
import { localePath } from "@/modules/i18n/routing";

/**
 * The four launch locales, restated the way every other spec in this directory restates them
 * (`tests/e2e/footer.spec.ts`): a rename should show up as a diff here, not be absorbed.
 */
const LAUNCH_LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** The four locale homes plus the `x-default` chooser — AC-14's page set, verbatim. */
const PAGES = [...LAUNCH_LOCALES.map((locale) => `/${locale}`), "/"] as const;

/** A path that is a link target rather than a page fetch. */
function isFetchable(href: string): boolean {
  return href.startsWith("/");
}

/**
 * The paths every **unpublished** registry target would occupy, per locale. A link to any of
 * them is the fault AC-14 names, whether the chrome rendered it or a section did.
 */
function unpublishedPaths(): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const link of SITE_LINKS as readonly SiteLink[]) {
    if (isPublished(link.id)) continue;
    // A `pending` target has no route shape at all, so there is no path it could occupy; a
    // `route` target has one, and that is the path nothing may link to while it is unpublished.
    if (link.target.kind !== "route") continue;
    for (const locale of LAUNCH_LOCALES) {
      paths.add(localePath(locale, link.target.pageType));
    }
  }
  return paths;
}

async function statusOf(
  request: APIRequestContext,
  href: string,
): Promise<number> {
  const response = await request.get(href, { maxRedirects: 0 });
  return response.status();
}

test.describe("AC-14: the site links to nothing that is not there", () => {
  for (const path of PAGES) {
    test(`${path} links only to 200 documents`, async ({ page, request }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        );

      expect(
        hrefs.length,
        "the page renders at least one link",
      ).toBeGreaterThan(0);

      const seen = new Set<string>();
      for (const href of hrefs) {
        // A placeholder or an empty target is a dead link with extra steps.
        expect(href, "empty or placeholder href").not.toBe("");
        expect(href, "placeholder href").not.toBe("#");

        // An in-page anchor resolves to the document it is on, which is already 200.
        const target = href.startsWith("#") ? path : href;
        if (!isFetchable(target)) {
          // Everything else the footer renders is a **contact channel**, not a page of ours:
          // `mailto:`, `tel:` and the WhatsApp deep link. They are checked for shape and not
          // fetched — AC-14 is about our own URL space, and a test suite must make no request to
          // a third party. `http:` is refused as well as malformed: an insecure outbound link is
          // a finding of its own.
          expect(target, target).toMatch(
            /^(?:mailto:|tel:|https:\/\/)[^\s]+$/u,
          );
          continue;
        }
        // The anchor half of `/en#destinations` is not part of the request.
        const url = target.split("#")[0] ?? target;
        if (seen.has(url)) continue;
        seen.add(url);
        expect(await statusOf(request, url), `${path} → ${href}`).toBe(200);
      }
    });

    test(`${path} links to no unpublished site-links target`, async ({
      page,
    }) => {
      await page.goto(path);
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node.getAttribute("href") ?? "").split("#")[0]),
        );

      const unpublished = unpublishedPaths();
      for (const href of hrefs) {
        expect(
          unpublished.has(href ?? ""),
          `${path} links to the unpublished target ${href ?? ""}`,
        ).toBe(false);
      }
    });
  }

  test("robots.txt still disallows the whole site", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Disallow: /");
  });

  for (const locale of LAUNCH_LOCALES) {
    test(`/${locale} is still noindex,nofollow`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /nofollow/,
      );
    });
  }

  test("/ is still noindex,follow — the chooser passes authority on", async ({
    page,
  }) => {
    await page.goto("/");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
    await expect(robots).not.toHaveAttribute("content", /nofollow/);
  });
});
