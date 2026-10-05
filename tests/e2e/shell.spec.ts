/**
 * The shell's document contract (spec 001 T-16 / AC-15, TASK-008; spec 003 AC-7 as §14 A16
 * restates it, TASK-119).
 *
 * `/` has no document since A16: it is one permanent 308 to `/en`, asserted in five request
 * variants by `./root-redirect.spec.ts`. What stays here:
 *
 *  - **`/` works with JavaScript disabled**: the 308 is HTTP, so a browser with scripting off
 *    still lands on the English home, and the header switcher's links still reach every locale.
 *  - **No third-party script** on the English home.
 *  - **The indexability belts**: `robots.txt` and the `X-Robots-Tag: noindex` header outside
 *    production.
 */
import { expect, test } from "@playwright/test";

const NOINDEX_PATHS = ["/en", "/robots.txt", "/does-not-exist"] as const;

test.describe("`/` without JavaScript (AC-7 as restated)", () => {
  test.use({ javaScriptEnabled: false });

  test("lands on /en and the switcher still reaches /de", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect((await page.title()).trim().length).toBeGreaterThan(0);

    await page
      .locator('[data-fo-header-switcher] a[href="/de"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/de$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });
});

test.describe("the English home's scripts", () => {
  test("loads no script from a third-party origin", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/en");

    const sources = await page
      .locator("script[src]")
      .evaluateAll((scripts) =>
        scripts.map((script) => (script as HTMLScriptElement).src),
      );
    const base = new URL(baseURL ?? "http://localhost:3000");
    const thirdParty = sources.filter(
      (src) => new URL(src).origin !== base.origin,
    );
    // A Vercel *preview* additionally gets `vercel.live` injected by the platform; allowed by
    // exact origin and only on a non-local target (TASK-011).
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
