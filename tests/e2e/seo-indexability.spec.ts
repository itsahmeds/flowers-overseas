/**
 * T-10, e2e half — the rendered `<meta name="robots">`, the response header and the sitemap
 * membership agree with the rule engine (spec 007 §6, AC-9; TASK-090 writes it, TASK-091 turns it
 * on).
 *
 * **Un-parked by TASK-091**: the route exists, so the skip is gone and the list below is the
 * committed (locale, country) set — seven destinations × the two locales with an authored guide.
 * A page that stopped answering would now fail here rather than quietly skipping.
 *
 * **The third agreement is `tests/e2e/sitemap.spec.ts`'s** (TASK-094): it walks `/sitemap.xml` to
 * every `<loc>`, fetches all of them and asserts none says `noindex` — AC-9's "meta, sitemap
 * membership and header agree" completed on the deployment this suite is running against, where
 * the answer today is that the sitemap is empty *because* these pages are `noindex`.
 *
 * What this suite asserts once it runs: on every deployment a reviewer can reach (local, CI,
 * preview and even the production alias — none of them is an indexing environment, §6, §12), the
 * engine's answer is `noindex,follow` for every page, so the document says exactly that and the
 * `X-Robots-Tag` of spec 001 agrees. The `index,follow` half of the table is unobservable until
 * the §12 flip and stays where it is provable: the sixteen-case unit table in
 * `tests/unit/seo-indexability.test.ts`.
 */
import { expect, test } from "@playwright/test";

/** The committed corridor set: seven destinations in the two locales a human has written. */
const SLUGS = [
  "poland",
  "germany",
  "france",
  "spain",
  "italy",
  "romania",
  "netherlands",
] as const;

const CORRIDOR_URLS = ["en", "en-gb"].flatMap((locale) =>
  SLUGS.map((slug) => `/${locale}/send-flowers-to/${slug}`),
);

const metaRobots = (html: string): string[] =>
  [
    ...html.matchAll(
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    ),
  ].map((match) => match[1] ?? "");

test.describe("indexability, observed (AC-9, T-10)", () => {
  for (const url of CORRIDOR_URLS) {
    test(`${url} says noindex,follow in a non-indexing environment`, async ({
      request,
    }) => {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      const html = await response.text();

      // Exactly one directive, and it is the engine's own literal (`indexability()` returns the
      // string the meta prints, so there is nothing to serialise and nothing to drift).
      expect(metaRobots(html)).toEqual(["noindex,follow"]);

      // spec 001 AC-15: the environment-level header says the same thing outside production.
      const header = response.headers()["x-robots-tag"];
      if (header !== undefined) expect(header).toContain("noindex");
    });
  }

  test("the locale chooser stays noindex whatever the environment (plan/02 §7)", async ({
    request,
  }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    const html = await response.text();
    for (const directive of metaRobots(html)) {
      expect(directive).toContain("noindex");
    }
  });
});
