/**
 * T-16 / AC-15 (TASK-008): the Phase 0 shell is reachable, unindexable in all three ways
 * (meta tag, `X-Robots-Tag` header, disallow-all `robots.txt` — spec 001 §6), sets no cookie
 * (so no consent obligation exists yet, §8) and loads no third-party script.
 */
import { expect, test } from "@playwright/test";

const NOINDEX_PATHS = ["/", "/robots.txt", "/does-not-exist"] as const;

test.describe("GET /", () => {
  test("answers 200 with the documented html attributes and robots meta", async ({
    page,
  }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    const html = page.locator("html");
    // spec 001 §7: `lang="en"` is the one locale literal; spec 003 replaces it with the URL
    // locale and updates this assertion (AC-30).
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );
  });

  test("sets no cookie", async ({ page }) => {
    const response = await page.goto("/");
    const headers = (await response?.headersArray()) ?? [];
    const setCookie = headers.filter(
      (header) => header.name.toLowerCase() === "set-cookie",
    );

    expect(setCookie).toEqual([]);
  });

  test("loads no script from a third-party origin", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");

    const sources = await page
      .locator("script[src]")
      .evaluateAll((scripts) =>
        scripts.map((script) => (script as HTMLScriptElement).src),
      );
    const base = new URL(baseURL ?? "http://localhost:3000");
    const thirdParty = sources.filter(
      (src) => new URL(src).origin !== base.origin,
    );
    // Nothing in `src/` loads a script (spec 001 §5.3), so a local run must find exactly zero.
    // A Vercel *preview* additionally gets `vercel.live/_next-live/feedback/feedback.js`
    // injected by the platform (Vercel Toolbar / preview comments); it is not in our HTML, it
    // never reaches production, and it can only be removed by turning Comments off in the Vercel
    // project settings. Allowed here by exact origin so a real third-party script — an analytics
    // or chat tag someone adds to the shell — still fails, and only on a non-local target.
    // Matched on the *hostname*, not on a prefix of the origin string: `startsWith("http://
    // localhost")` also matched `http://localhost.evil.example` and missed `127.0.0.1`, `[::1]`
    // and an https local server (TASK-011, carried from the review of PR #8).
    const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const isLocal = LOCAL_HOSTNAMES.has(base.hostname);
    const platformInjected = new Set(isLocal ? [] : ["https://vercel.live"]);
    const unexpected = thirdParty.filter(
      (src) => !platformInjected.has(new URL(src).origin),
    );

    expect(unexpected).toEqual([]);
  });
});

test.describe("indexability", () => {
  test("robots.txt disallows everything", async ({ request }) => {
    const response = await request.get("/robots.txt");

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Disallow: /");
  });

  for (const path of NOINDEX_PATHS) {
    test(`X-Robots-Tag: noindex on ${path}`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.headers()["x-robots-tag"]).toContain("noindex");
    });
  }

  test("an unknown path answers 404", async ({ request }) => {
    const response = await request.get("/does-not-exist");

    expect(response.status()).toBe(404);
  });
});
