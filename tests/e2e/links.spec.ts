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

/** The four locale homes — AC-14's page set, less `/`, which is a 308 since spec 003 §14 A16. */
const PAGES = LAUNCH_LOCALES.map((locale) => `/${locale}`);

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
    // An unpublished `listingPage` target (spec 008 §14 A14) is never even resolved: the layout
    // asks the catalogue only about published ones (`headerListingTargets()`, pinned by
    // `tests/unit/ui-site-header.test.tsx`), so no URL for it reaches a document.
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

  test("/ passes authority on as a permanent redirect to /en (spec 003 §14 A16)", async ({
    request,
  }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toMatch(/\/en$/u);
  });
});

/**
 * **TASK-173 — every visible chrome control is a real link or is not shown** (spec 004 AC-14 as
 * §14 A20 amends it; spec 008 §14 A14). The founder clicked the live site on 2026-10-03 and found
 * a menu, a search, a basket, most of a footer and five bouquet cards that looked like controls
 * and did nothing. The crawl above asks "does every link answer 200", which a page of dead text
 * passes; this one asks the other half too — **which** controls the chrome draws, that each is an
 * `<a>`, and that each answers 200 — in the header, the footer and the home's trending row of
 * every launch locale.
 */
const CHROME = [
  "[data-fo-utility]",
  "[data-fo-header]",
  "footer",
  "[data-fo-trending]",
] as const;

/** The header's category row per locale, as the ruling draws it: eight entries, all links. */
const ROW_IDS = [
  "our-selection",
  "birthday",
  "sympathy",
  "occasions",
  "bouquets",
  "roses",
  "plants",
  "destinations",
] as const;

test.describe("TASK-173: every chrome control is a link that answers 200, or is not drawn", () => {
  for (const locale of LAUNCH_LOCALES) {
    test(`/${locale}: the header, footer and trending row draw only live links`, async ({
      page,
      request,
    }) => {
      expect((await page.goto(`/${locale}`))?.status()).toBe(200);

      // The header's category row: the eight entries with a page, each an `<a>`, in order.
      const row = await page
        .locator("[data-fo-header-item]")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            id: node.getAttribute("data-fo-header-item") ?? "",
            tag: node.tagName,
            href: node.getAttribute("href") ?? "",
          })),
        );
      expect(row.map((item) => item.id)).toEqual([...ROW_IDS]);
      for (const item of row) {
        expect(item.tag, item.id).toBe("A");
        expect(item.href, item.id).toMatch(new RegExp(`^/${locale}/`, "u"));
      }
      // Our selection is the demo destination's shop, Destinations the hub.
      expect(row[0]?.href).toMatch(
        /\/(?:poland|polen|polska)\/(?:flowers|blumen|kwiaty)$/u,
      );
      expect(row.at(-1)?.href).toBe(localePath(locale, "destinations"));

      // The footer's link column is the two entries with a page, and nothing else.
      const sending = await page
        .locator('footer nav[aria-labelledby$="-group-sending"] a')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        );
      expect(sending).toEqual([
        localePath(locale, "destinations"),
        localePath(locale, "occasions"),
      ]);

      // The trending row: five cards, five product pages.
      await expect(page.locator("[data-fo-trending] li a[href]")).toHaveCount(
        5,
      );

      // Every `<a>` in the four chrome regions has a target, and every internal one answers 200.
      const hrefs = new Set<string>();
      for (const region of CHROME) {
        await expect(
          page.locator(`${region} a:not([href])`),
          region,
        ).toHaveCount(0);
        for (const href of await page
          .locator(`${region} a[href]`)
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("href") ?? ""),
          )) {
          expect(href, region).not.toBe("");
          expect(href, region).not.toBe("#");
          if (href.startsWith("/")) hrefs.add(href.split("#")[0] ?? href);
          else expect(href, href).toMatch(/^(?:tel:|https:\/\/)[^\s]+$/u);
        }
      }
      // Exactly: the header's eight (the footer's two are among them), five products, the
      // lockup's home and the switcher's three sibling homes. A ninth control is a diff here.
      expect(hrefs.size).toBe(8 + 5 + 1 + 3);
      for (const href of hrefs) {
        expect(await statusOf(request, href), href).toBe(200);
      }

      // And the words the founder read as dead controls are not on the page at all.
      if (locale === "en" || locale === "en-gb") {
        for (const word of [
          "Sign in",
          "My orders",
          "Basket",
          "For florists",
          "Add-ons",
          "How it works",
          "Help and contact",
          "The guarantee",
          "Imprint",
          "Withdrawal and refunds",
          "Search flowers, occasions, a city or a country",
        ]) {
          for (const region of ["[data-fo-header]", "footer"]) {
            await expect(
              page.locator(region),
              `${region}: ${word}`,
            ).not.toContainText(word);
          }
        }
      }
    });
  }
});
