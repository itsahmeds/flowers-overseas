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
      // The current locale is a `<span aria-current="page">`, so the *switcher* does not link
      // this URL. Spec 004's masthead lockup does (AC-7), and it is the only one that may: the
      // document carries exactly one `href` to its own path.
      expect(html.match(new RegExp(`href="${path}"`, "g")), path).toHaveLength(
        1,
      );
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

/**
 * AC-8 at every depth (TASK-170). AC-8 names one path below a locale (`/en/does-not-exist`), but
 * its intent is WCAG 3.1.1: **every** 404 under `/{locale}/` is a document that declares its
 * language. Production on 2026-10-03 answered the depth-3 shapes and an unknown locale with a
 * deeper path inside the framework's `<html id="__next_error__">` with no `lang` at all, while the
 * depth-2 shape and a bare unknown locale were correct — so each depth is pinned here, by shape.
 *
 * Every 404 is the x-default document of `src/app/not-found.tsx` (spec 003 §5.3's recorded
 * deviation, §14 A3), a German URL's included: the language it declares is the language its copy
 * is written in, which is what 3.1.1 asks.
 */
const NOT_FOUND_SHAPES = [
  // depth 2: an unknown page segment under a real locale (correct before TASK-170; kept pinned)
  { shape: "depth 2, unknown segment", path: "/en/nope-segment" },
  { shape: "depth 2, unknown segment, de", path: "/de/nope-segment" },
  // depth 3: the corridor shape, the country-shop-root shape, the hub shapes
  { shape: "depth 3, unknown corridor", path: "/en/send-flowers-to/nowhere" },
  {
    shape: "depth 3, unknown corridor, de",
    path: "/de/blumen-verschicken/nirgendwo",
  },
  {
    shape: "depth 3, shop root, unknown country",
    path: "/en/atlantis/flowers",
  },
  { shape: "depth 3, unknown page under a country", path: "/en/poland/nope" },
  { shape: "depth 3, unknown category hub", path: "/en/flowers/no-such-kind" },
  // depth 4: the product shape (every product is prebuilt, spec 009 §14 A6) and the listing shape
  {
    shape: "depth 4, unknown product",
    path: "/en/poland/product/no-such-bouquet",
  },
  {
    shape: "depth 4, unknown product, de",
    path: "/de/polen/produkt/no-such-bouquet",
  },
  {
    shape: "depth 4, unknown category under a country",
    path: "/en/poland/flowers/no-such-kind",
  },
  // an unknown locale with a deeper path
  { shape: "unknown locale, depth 2", path: "/xx/nope-segment" },
  { shape: "unknown locale, depth 3", path: "/xx/send-flowers-to/poland" },
  { shape: "unknown locale, depth 3, shop root", path: "/fr/poland/flowers" },
  {
    shape: "unknown locale, depth 4",
    path: "/xx/poland/product/amber-hour",
  },
  // with a query string (TASK-170): only a shop-root address carrying a listing key is rewritten
  // to the parameter route (`src/lib/listing-rewrites.ts`); every other address with a query is
  // the prebuilt route's, so its unknown paths keep the router's localised 404
  {
    shape: "depth 3, unknown corridor, with ?page=",
    path: "/en/send-flowers-to/nowhere?page=2",
  },
  {
    shape: "depth 3, shop root, unknown country, with ?utm_source=",
    path: "/en/atlantis/flowers?utm_source=newsletter",
  },
  {
    shape: "unknown locale, depth 3, shop root, with ?page=",
    path: "/fr/poland/flowers?page=2",
  },
  {
    shape: "depth 4, unknown category under a country, with ?sort=",
    path: "/en/poland/flowers/no-such-kind?sort=price-asc",
  },
] as const;

test.describe("every 404 shape is the localised not-found document (AC-8, TASK-170)", () => {
  for (const { shape, path } of NOT_FOUND_SHAPES) {
    test(`${shape}: ${path} answers 404 with lang="${X_DEFAULT_LANG}" and the localised copy`, async ({
      request,
    }) => {
      // `maxRedirects: 0`: "not 3xx, not 200" — a redirect to a page that 404s is not this 404.
      const response = await request.get(path, { maxRedirects: 0 });
      const html = await response.text();
      const tag = /<html\b[^>]*>/iu.exec(html)?.[0] ?? "";

      expect(response.status(), path).toBe(404);
      expect(headerNames(response), path).not.toContain("location");
      // The `<html>` element of the document itself, not any `lang` attribute somewhere inside it.
      expect(/\blang="([^"]*)"/u.exec(tag)?.[1], path).toBe(X_DEFAULT_LANG);
      // The framework's error shell is the failure this block exists for: no language, no copy
      // until a client render fills it in.
      expect(html, path).not.toContain('id="__next_error__"');
      // The localised copy, server-rendered from `messages/en.json` (`errors.notFound.heading`),
      // and not Next's built-in "404: This page could not be found".
      // Asserted as the rendered `<h1>`, because the bare string also travels in the `<title>` and
      // in the RSC payload, both of which the error shell carries without rendering any copy.
      expect(html, path).toMatch(/<h1\b[^>]*>Page not found<\/h1>/u);
      expect(html, path).not.toContain("This page could not be found");
    });
  }
});

/**
 * **The accepted residual** (advisor memo `docs/advice/2026-10-03-route-rendering-404-and-pdp-form.md`,
 * `/review 149`; TASK-170 E-1). A shop-root address with an **unknown country and a known listing
 * key** is rewritten to the parameter route, which reads the query and so renders per request;
 * there the router's `dynamicParams = false` gate does not run, `resolveLocalePath()` finds nothing,
 * and a request-time `notFound()` is Next's error shell: the status is right, the document has no
 * `lang`. Nothing links to such an address; a page past the last one is the same render and the
 * same answer. Pinned **as it is today**, so that a fix — or a
 * regression that widens it — shows up here as a deliberate change rather than silently. The
 * internal path itself, requested directly without a listing key, is a 404 of the same kind.
 */
const RESIDUAL_404S = [
  "/en/atlantis/flowers?page=2",
  "/de/atlantis/blumen?sort=price-asc",
  "/en/_query/poland/flowers",
  // A page past the last (spec 008 AC-10's "404, never an empty grid"): the country exists, but
  // `listingView()` answers `undefined` inside the per-request render. Accepted by `/review 143`.
  "/en/poland/flowers?page=99",
] as const;

test.describe("the accepted residual: 404 inside the error shell (TASK-170 E-1)", () => {
  for (const path of RESIDUAL_404S) {
    test(`${path} answers 404, no redirect, without lang (accepted, pinned)`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const html = await response.text();
      const tag = /<html\b[^>]*>/iu.exec(html)?.[0] ?? "";

      expect(response.status(), path).toBe(404);
      expect(headerNames(response), path).not.toContain("location");
      // Today's shape, asserted so that a change to it is seen: the framework's error shell.
      expect(tag, path).toContain('id="__next_error__"');
      expect(/\blang="/u.test(tag), path).toBe(false);
    });
  }
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
