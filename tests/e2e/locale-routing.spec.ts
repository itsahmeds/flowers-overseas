/**
 * T-06 / AC-6, T-08 / AC-8 and T-09 / AC-9 (TASK-034): the locale is in the URL, in the document,
 * and nowhere else.
 *
 * AC-9 is ADR-0006 in its strongest form and the reason this file exists: the same URL must answer
 * with a **byte-identical body** with and without `Accept-Language`, and under a Googlebot user
 * agent — no header sniffing, no redirect, no `Vary` on a request header we do not read. A
 * response that varied by header would also multiply the edge cache by the number of languages
 * (`plan/01` §3, `plan/02` §14).
 *
 * `Vary` is asserted by *content*, not by absence: Next sets `Vary: rsc, next-router-…,
 * Accept-Encoding` on every response for its own client-navigation protocol, which is invariant
 * across clients. What must never appear is `Accept-Language`, `User-Agent` or a geo header.
 */
import { createHash } from "node:crypto";

import { type APIResponse, expect, test } from "@playwright/test";

/** `{ path: expected <html lang>, expected dir }` — the AC-6 matrix, from `src/config/locales.ts`. */
const LOCALE_DOCUMENTS = [
  { path: "/en", lang: "en", dir: "ltr" },
  { path: "/en-gb", lang: "en-GB", dir: "ltr" },
  { path: "/de", lang: "de", dir: "ltr" },
  { path: "/pl", lang: "pl", dir: "ltr" },
] as const;

/** The x-default locale (`plan/02` §3: `x-default` → `/en`), which every 404 document declares. */
const X_DEFAULT_LANG = "en";

/** AC-8: unknown, non-launch and mis-cased locale segments. Never a 3xx, never a 200. */
const NOT_FOUND_PATHS = ["/fr", "/xx", "/EN", "/nope"] as const;

/**
 * `/EN` is the one path whose answer depends on the *host filesystem*, not on this repository.
 * Next resolves a prerendered route by reading `.next/server/app/<path>.html`, so on a
 * case-insensitive volume — macOS APFS, which is the founder's machine — `pnpm start` can serve
 * `/EN` from `en.html` (200) or, once the entry is cached as missing, from Next's built-in error
 * shell (404 without a `lang`). On the case-sensitive Linux of CI, the Vercel preview and
 * production, the segment is simply not in `generateStaticParams`, `dynamicParams = false` refuses
 * it at the routing layer, and the x-default 404 document answers — which is what AC-8 pins.
 * `experimental.caseSensitiveRoutes` was tried and does not change the prerender lookup (16.3.4).
 * The assertion therefore runs everywhere except a local macOS target, where it would be testing
 * APFS. Reported in the TASK-034 PR.
 */
function skipsOnCaseInsensitiveHost(baseURL: string | undefined): boolean {
  const host = new URL(baseURL ?? "http://localhost:3000").hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  return process.platform === "darwin" && local;
}

const HEADER_VARIANTS = [
  { name: "no negotiation headers", headers: {} },
  {
    name: "Accept-Language: de-DE",
    headers: { "Accept-Language": "de-DE,de;q=0.9" },
  },
  {
    name: "Googlebot user agent",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    },
  },
] as const;

function hash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function attribute(html: string, name: "lang" | "dir"): string | undefined {
  return new RegExp(`<html[^>]*\\s${name}="([^"]*)"`).exec(html)?.[1];
}

function headerNames(response: APIResponse): string[] {
  return Object.keys(response.headers()).map((name) => name.toLowerCase());
}

test.describe("localised documents (AC-6)", () => {
  for (const { path, lang, dir } of LOCALE_DOCUMENTS) {
    test(`${path} answers 200 with lang="${lang}" dir="${dir}"`, async ({
      request,
    }) => {
      const response = await request.get(path);
      const html = await response.text();

      expect(response.status()).toBe(200);
      expect(attribute(html, "lang")).toBe(lang);
      expect(attribute(html, "dir")).toBe(dir);
      // Every document has a localised, non-empty title (§8 WCAG 2.4.2; AC-25 on TASK-035).
      expect(/<title>[^<]+<\/title>/.test(html)).toBe(true);
      // Still nothing indexable until spec 007 lifts it by rule (§6, ADR-0007).
      expect(html).toContain('name="robots" content="noindex,nofollow"');
      // §6 "Internal links in/out" (TASK-035): the switcher links this locale root to the other
      // three and marks the current one, so the Phase 0 crawl graph is `/` → every locale root →
      // every other locale root, with no redirect anywhere in it (`plan/02` §11).
      expect(html).toContain('aria-current="page"');
      for (const other of LOCALE_DOCUMENTS.filter(
        (document) => document.path !== path,
      )) {
        expect(html, `${path} → ${other.path}`).toContain(
          `href="${other.path}"`,
        );
      }
      // The current locale is a `<span aria-current="page">`, so its own URL is not linked.
      expect(html).not.toContain(`href="${path}"`);
    });
  }

  test("sets no cookie on a localised page (spec 001 AC-15, AC-12)", async ({
    request,
  }) => {
    for (const { path } of LOCALE_DOCUMENTS) {
      const response = await request.get(path);
      expect(headerNames(response), path).not.toContain("set-cookie");
    }
  });
});

/**
 * T-29 / AC-29 (TASK-042), the served half: the pseudo-locales are real documents and are absent
 * from everything a buyer or a crawler follows.
 *
 * `/ar-XB` and `/en-XA` exist only where `ENABLE_PSEUDO_LOCALES=true` — locally and on the
 * protected preview (spec 003 §2, §8, §13 Q6) — and the env schema refuses the flag in production,
 * so these tests describe the harness targets and nothing a buyer can reach. The two properties
 * that matter are the ones a mistake would break silently: the RTL document really is `rtl` and
 * really is `noindex`, and neither pseudo-locale is linked from a launch locale's switcher.
 */
test.describe("pseudo-locale documents (AC-29)", () => {
  test('/ar-XB answers 200 with dir="rtl" and noindex', async ({ request }) => {
    const response = await request.get("/ar-XB", { maxRedirects: 0 });
    const html = await response.text();

    expect(
      response.status(),
      "is ENABLE_PSEUDO_LOCALES=true on the target?",
    ).toBe(200);
    expect(attribute(html, "lang")).toBe("ar-XB");
    // The direction comes from `src/config/locales.ts`, never from the strings (§7).
    expect(attribute(html, "dir")).toBe("rtl");
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    // The generated catalogue is what rendered, not English through the fallback: every `ar-XB`
    // value starts with U+200F RIGHT-TO-LEFT MARK (`src/modules/i18n/pseudo.ts`).
    expect(html).toContain("\u200f");
    expect(headerNames(response)).not.toContain("set-cookie");
  });

  test("/en-XA answers 200 with expanded, bracketed strings", async ({
    request,
  }) => {
    const response = await request.get("/en-XA", { maxRedirects: 0 });
    const html = await response.text();

    expect(
      response.status(),
      "is ENABLE_PSEUDO_LOCALES=true on the target?",
    ).toBe(200);
    expect(attribute(html, "lang")).toBe("en-XA");
    expect(attribute(html, "dir")).toBe("ltr");
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    // Accented, bracketed and padded — the three visible properties of AC-29's `en-XA`.
    expect(html).toMatch(/\[[^\]]*·+\]/);
    expect(html).toContain("Šéñð"); // `meta.home.heading`, accented
  });

  test("no launch locale links to a pseudo-locale", async ({ request }) => {
    for (const { path } of LOCALE_DOCUMENTS) {
      const html = await (await request.get(path)).text();
      for (const pseudo of ["/ar-XB", "/en-XA"] as const) {
        expect(html, `${path} → ${pseudo}`).not.toContain(`href="${pseudo}"`);
      }
      // Nor as an hreflang value: `alternatesFor()` cannot emit one (§6, AC-29).
      expect(html, path).not.toContain("ar-XB");
      expect(html, path).not.toContain("en-XA");
    }
  });
});

test.describe("unknown locales answer 404 (AC-8)", () => {
  for (const path of NOT_FOUND_PATHS) {
    test(`${path} answers 404 in the x-default locale`, async ({
      request,
      baseURL,
    }) => {
      test.skip(
        path === "/EN" && skipsOnCaseInsensitiveHost(baseURL),
        "case-insensitive local filesystem serves /EN from the /en prerender; see the note above",
      );
      // `maxRedirects: 0` so a 3xx fails here rather than being followed silently: ADR-0006 is
      // about the absence of the redirect, not about where it would have gone.
      const response = await request.get(path, { maxRedirects: 0 });
      const html = await response.text();

      expect(response.status()).toBe(404);
      expect(headerNames(response)).not.toContain("location");
      expect(attribute(html, "lang")).toBe(X_DEFAULT_LANG);
    });
  }

  test("/en/does-not-exist answers 404 with English localised copy", async ({
    request,
  }) => {
    const response = await request.get("/en/does-not-exist", {
      maxRedirects: 0,
    });
    const html = await response.text();

    expect(response.status()).toBe(404);
    expect(attribute(html, "lang")).toBe("en");
    // The copy comes from `messages/en.json`, not from Next's built-in error page.
    expect(html).toContain("Page not found");
    expect(html).not.toContain("404: This page could not be found");
    // Crawlable way back into the site, built by `localePath()` (§6 "Internal links").
    expect(html).toContain('href="/en"');
  });
});

test.describe("no response varies by request header (AC-9)", () => {
  for (const path of ["/en", "/de"] as const) {
    test(`${path} is byte-identical for every client`, async ({ request }) => {
      const bodies: string[] = [];

      for (const variant of HEADER_VARIANTS) {
        const response = await request.get(path, {
          headers: variant.headers,
          maxRedirects: 0,
        });

        expect(response.status(), variant.name).toBe(200);
        expect(headerNames(response), variant.name).not.toContain("location");
        expect(headerNames(response), variant.name).not.toContain("set-cookie");

        const vary = (response.headers()["vary"] ?? "").toLowerCase();
        for (const forbidden of [
          "accept-language",
          "user-agent",
          "cookie",
          "x-vercel-ip-country",
        ]) {
          expect(vary, `${variant.name}: ${forbidden}`).not.toContain(
            forbidden,
          );
        }

        bodies.push(await response.text());
      }

      expect(new Set(bodies.map(hash)).size).toBe(1);
    });
  }
});
