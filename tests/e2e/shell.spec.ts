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
    const origin = new URL(baseURL ?? "http://localhost:3000").origin;
    const thirdParty = sources.filter((src) => new URL(src).origin !== origin);

    expect(thirdParty).toEqual([]);
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
