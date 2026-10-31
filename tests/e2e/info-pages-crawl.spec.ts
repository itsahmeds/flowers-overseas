/**
 * **T-22 / AC-22** — the spec 004 AC-14 crawl, extended to the info pages in all four locales
 * (spec 041 §6 "Internal links", §9 AC-22, §10 T-22; TASK-184).
 *
 * > "The spec 004 AC-14 crawl, extended to every `<a href>` on the ten pages in all four locales,
 * > finds zero links to a non-200 URL and zero links to an unpublished target; every in-body link
 * > of §6 is present where its target exists and absent where it does not; every page is ≤3
 * > clicks from its locale home."
 *
 * Before the trader identity is complete, seven of the ten pages exist in each locale (imprint,
 * terms and privacy wait for it, AC-2). Their URLs and their in-body link sets are restated here
 * from spec 041 §2's table and §6, the way `tests/e2e/footer.spec.ts` restates its locales: a
 * rename or a dropped link must show up as a diff in this file, not be absorbed by it.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

import { SITE_LINKS, type SiteLink, isPublished } from "@/config/site-links";
// By path and not through the barrel, as `tests/e2e/links.spec.ts` explains.
import { localePath } from "@/modules/i18n/routing";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];

/** Spec 041 §2's table: the seven pages that exist before registration, per locale. */
const PATHS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {
    "how-it-works": "/en/how-it-works",
    guarantee: "/en/guarantee",
    help: "/en/help",
    about: "/en/about",
    delivery: "/en/delivery",
    cookies: "/en/legal/cookies",
    cancellation: "/en/legal/cancellation",
  },
  "en-gb": {
    "how-it-works": "/en-gb/how-it-works",
    guarantee: "/en-gb/guarantee",
    help: "/en-gb/help",
    about: "/en-gb/about",
    delivery: "/en-gb/delivery",
    cookies: "/en-gb/legal/cookies",
    cancellation: "/en-gb/legal/cancellation",
  },
  de: {
    "how-it-works": "/de/so-funktioniert-es",
    guarantee: "/de/garantie",
    help: "/de/hilfe",
    about: "/de/ueber-uns",
    delivery: "/de/lieferung-und-zahlung",
    cookies: "/de/rechtliches/cookies",
    cancellation: "/de/rechtliches/widerruf",
  },
  pl: {
    "how-it-works": "/pl/jak-to-dziala",
    guarantee: "/pl/gwarancja",
    help: "/pl/pomoc",
    about: "/pl/o-nas",
    delivery: "/pl/dostawa-i-platnosc",
    cookies: "/pl/informacje-prawne/cookies",
    cancellation: "/pl/informacje-prawne/odstapienie-od-umowy",
  },
};

/** The three pages that wait for the trader identity: no URL, so no link may point at one. */
const GATED: Readonly<Record<Locale, readonly string[]>> = {
  en: ["/en/imprint", "/en/legal/terms", "/en/legal/privacy"],
  "en-gb": ["/en-gb/imprint", "/en-gb/legal/terms", "/en-gb/legal/privacy"],
  de: ["/de/impressum", "/de/rechtliches/agb", "/de/rechtliches/datenschutz"],
  pl: [
    "/pl/dane-firmy",
    "/pl/informacje-prawne/regulamin",
    "/pl/informacje-prawne/polityka-prywatnosci",
  ],
};

/**
 * Spec 041 §6's in-body links, less every target that does not exist before registration
 * (privacy, imprint, terms): the set each page must render, in authored order.
 */
const IN_BODY: Readonly<Record<string, readonly string[]>> = {
  "how-it-works": ["guarantee", "help", "destinations", "about"],
  guarantee: ["cancellation", "help"],
  help: ["guarantee", "delivery", "about"],
  about: ["how-it-works", "help"],
  delivery: ["guarantee"],
  cookies: ["cancellation", "help"],
  cancellation: ["guarantee", "help"],
};

/**
 * The paths every unpublished `site-links.ts` route target would occupy in a locale (the rule of
 * `tests/e2e/links.spec.ts`): nothing on an info page may link to one.
 */
function unpublishedPaths(locale: Locale): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const link of SITE_LINKS as readonly SiteLink[]) {
    if (isPublished(link.id) || link.target.kind !== "route") continue;
    paths.add(localePath(locale, link.target.pageType));
  }
  return paths;
}

/** One status per URL per worker: the chrome repeats the same forty links on every page. */
const statuses = new Map<string, number>();

async function statusOf(
  request: APIRequestContext,
  href: string,
): Promise<number> {
  const known = statuses.get(href);
  if (known !== undefined) return known;
  const response = await request.get(href, { maxRedirects: 0 });
  statuses.set(href, response.status());
  return response.status();
}

/** The path part of an internal href, without its fragment or query. */
function pathOf(href: string): string {
  return (href.split("#")[0] ?? "").split("?")[0] ?? "";
}

for (const locale of LOCALES) {
  test.describe(`T-22 / AC-22: the ${locale} info pages`, () => {
    for (const [pageId, path] of Object.entries(PATHS[locale])) {
      test(`${path} links only to 200 documents, never to a page that does not exist`, async ({
        page,
        request,
      }) => {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        const hrefs = await page
          .locator("a[href]")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("href") ?? ""),
          );
        expect(hrefs.length).toBeGreaterThan(0);
        const unpublished = unpublishedPaths(locale);
        for (const href of hrefs) {
          expect(href, "empty or placeholder href").not.toBe("");
          expect(href, "placeholder href").not.toBe("#");
          if (href.startsWith("#")) continue;
          if (!href.startsWith("/")) {
            // Contact channels and nothing else leave our URL space (spec 004 AC-14).
            expect(href, "an outbound link").toMatch(
              /^(?:mailto:|tel:|https:\/\/)[^\s]+$/u,
            );
            continue;
          }
          const target = pathOf(href);
          expect(GATED[locale], `${path} links ${href}`).not.toContain(target);
          expect(
            unpublished.has(target),
            `${path} links the unpublished target ${href}`,
          ).toBe(false);
          expect(await statusOf(request, target), `${path} → ${href}`).toBe(
            200,
          );
        }
      });

      test(`${path} renders exactly §6's in-body links, each to its ${locale} page`, async ({
        page,
      }) => {
        await page.goto(path);
        const links = page.locator("main [data-fo-info-link]");
        const targets = await links.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-fo-info-link") ?? ""),
        );
        expect(targets).toEqual(IN_BODY[pageId]);
        for (const to of IN_BODY[pageId] ?? []) {
          const expected = PATHS[locale][to];
          if (expected === undefined) continue; // the destinations hub
          await expect(
            page.locator(`main [data-fo-info-link="${to}"]`),
          ).toHaveAttribute("href", expected);
        }
      });
    }

    test(`every ${locale} info page is at most 3 clicks from /${locale}`, async ({
      request,
    }) => {
      // Breadth-first from the locale home, expanding the home and the info pages only: a page
      // reached that way within three clicks is within three clicks of the whole graph too.
      const wanted = new Set(Object.values(PATHS[locale]));
      const depth = new Map<string, number>([[`/${locale}`, 0]]);
      let frontier = [`/${locale}`];
      for (let level = 1; level <= 3 && frontier.length > 0; level += 1) {
        const next: string[] = [];
        for (const from of frontier) {
          const html = await (await request.get(from)).text();
          for (const match of html.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)/gu)) {
            const to = match[1] ?? "";
            if (depth.has(to)) continue;
            depth.set(to, level);
            if (wanted.has(to)) next.push(to);
          }
        }
        frontier = next;
      }
      for (const path of wanted) {
        expect(depth.get(path), `${path} from /${locale}`).toBeLessThanOrEqual(
          3,
        );
      }
    });
  });
}
