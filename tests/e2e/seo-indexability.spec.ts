/**
 * T-10, e2e half — the rendered `<meta name="robots">`, the response header and the sitemap
 * membership agree with the rule engine (spec 007 §6, AC-9; TASK-090 writes it, TASK-091 turns it
 * on).
 *
 * **Parked, by route existence, not by a bare `.skip`.** AC-9's e2e half needs a corridor URL to
 * observe and TASK-091 owns the route; until it answers, each test skips with the reason below,
 * exactly as spec 001 parked its integration suite (`tests/integration/db.test.ts`) against spec
 * 002. Nothing here is disabled by hand: the moment `/en-gb/send-flowers-to/poland` stops
 * answering 404 the assertions run, so TASK-091 cannot ship the route without also satisfying
 * them.
 *
 * TODO(TASK-091 — corridor route): delete `skipUntilCorridorExists()` once the route is
 * prerendered, and extend `CORRIDOR_URLS` to the committed (locale, country) set.
 * TODO(TASK-094 — sitemaps): add the third agreement — a `noindex` URL appears in no sitemap —
 * here rather than in a second place, so AC-9's "meta, sitemap membership and header agree" is one
 * assertion (AC-14 owns the full-set fetch).
 *
 * What this suite asserts once it runs: on every deployment a reviewer can reach (local, CI,
 * preview and even the production alias — none of them is an indexing environment, §6, §12), the
 * engine's answer is `noindex,follow` for every page, so the document says exactly that and the
 * `X-Robots-Tag` of spec 001 agrees. The `index,follow` half of the table is unobservable until
 * the §12 flip and stays where it is provable: the sixteen-case unit table in
 * `tests/unit/seo-indexability.test.ts`.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

/** One corridor URL per English locale; TASK-091's committed set replaces this list. */
const CORRIDOR_URLS = [
  "/en/send-flowers-to/poland",
  "/en-gb/send-flowers-to/poland",
] as const;

const PARKED =
  "TASK-091's corridor route does not exist yet: nothing to observe (spec 007 §12 task order 5)";

/** Does the route exist on the deployment under test? The one reason this suite may skip. */
async function corridorMissing(
  request: APIRequestContext,
  url: string,
): Promise<boolean> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status() === 404;
}

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
      test.skip(await corridorMissing(request, url), PARKED);

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
