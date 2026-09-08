/**
 * T-07 / AC-7 (TASK-035), and the spec 001 indexability contract it inherits (T-16 / AC-15,
 * TASK-008): `/` is the locale chooser — the site's only non-localised URL, the only `follow`
 * document in Phase 0, and the entry point that gives every locale root crawl depth 1.
 *
 * What this file pins, and why each line is here rather than in a unit test:
 *
 *  - **`noindex,follow`** (`plan/02` §7, spec 003 §6). Every other document is `noindex,nofollow`;
 *    this one exists to be crawled *through*. The `X-Robots-Tag: noindex` header of spec 001 §6
 *    stays on top of it, so the preview cannot be indexed by a crawler that ignores the meta tag.
 *  - **Four crawlable links, one per launch locale**, labelled with the locale's `nativeName` and
 *    carrying `hreflang` *and* `lang` for the target language (WCAG 3.1.2, §8). Read through the
 *    DOM, which is what a browser and a crawler see: React 19 serialises the JSX prop as
 *    `hrefLang`, and HTML attribute names are case-insensitive.
 *  - **A non-empty `<title>`** — the assertion that replaced the axe `document-title` exception
 *    (AC-25, WCAG 2.4.2).
 *  - **No `Location`, no `Set-Cookie`, no `Vary: Accept-Language`** (AC-7, AC-12, ADR-0006): `/`
 *    never redirects to a detected locale, never writes a cookie before the user has chosen, and
 *    never varies by a header, so one cached entry serves everyone (`plan/02` §14).
 *  - **It works with JavaScript disabled** (AC-7): the chooser is HTML. The `javaScriptEnabled:
 *    false` context below is the real proof, because it also fails if the links are rendered by a
 *    client component or bound by a click handler.
 */
import { expect, test } from "@playwright/test";

const NOINDEX_PATHS = ["/", "/robots.txt", "/does-not-exist"] as const;

/** The launch locales as `src/config/locales.ts` orders them, restated independently (AC-7). */
const LOCALE_LINKS = [
  { href: "/en", hreflang: "en", label: "English" },
  { href: "/en-gb", hreflang: "en-GB", label: "English (UK)" },
  { href: "/de", hreflang: "de", label: "Deutsch" },
  { href: "/pl", hreflang: "pl", label: "Polski" },
] as const;

test.describe("GET / (the locale chooser)", () => {
  test("answers 200 with the x-default document attributes and `noindex,follow`", async ({
    page,
  }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    const html = page.locator("html");
    // The x-default locale from `src/config/locales.ts`, not a literal in the source (AC-6).
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,follow",
    );
  });

  test("has a non-empty localised title and a heading (AC-25)", async ({
    page,
  }) => {
    await page.goto("/");

    expect((await page.title()).trim().length).toBeGreaterThan(0);
    await expect(page.locator("h1")).not.toBeEmpty();
  });

  test("lists one crawlable link per launch locale, labelled with its `nativeName`", async ({
    page,
  }) => {
    await page.goto("/");

    const links = page.locator("nav a[href]");
    await expect(links).toHaveCount(LOCALE_LINKS.length);

    for (const [index, expected] of LOCALE_LINKS.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveAttribute("href", expected.href);
      // Both attributes: `hreflang` for the crawler, `lang` for the screen reader (§8).
      await expect(link).toHaveAttribute("hreflang", expected.hreflang);
      await expect(link).toHaveAttribute("lang", expected.hreflang);
      await expect(link).toHaveText(expected.label);
    }
  });

  test("sets no cookie, emits no `Location` and varies on no request header", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const headers = (await response?.headersArray()) ?? [];
    const named = (name: string): string[] =>
      headers
        .filter((header) => header.name.toLowerCase() === name)
        .map((header) => header.value.toLowerCase());

    expect(named("set-cookie")).toEqual([]);
    expect(named("location")).toEqual([]);
    // Next sets `Vary: rsc, next-router-…, Accept-Encoding` for its own client-navigation
    // protocol, which is client-invariant. A negotiation header must never appear (ADR-0006).
    for (const vary of named("vary")) {
      expect(vary).not.toContain("accept-language");
      expect(vary).not.toContain("user-agent");
    }
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

test.describe("the chooser without JavaScript (AC-7)", () => {
  test.use({ javaScriptEnabled: false });

  test("renders its links and navigates to a locale home", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("nav a[href]")).toHaveCount(LOCALE_LINKS.length);
    await expect(page.locator("h1")).not.toBeEmpty();

    await page.locator('nav a[href="/de"]').click();

    await expect(page).toHaveURL(/\/de$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
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
