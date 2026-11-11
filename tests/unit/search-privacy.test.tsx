/**
 * Search privacy (spec 045 §2.4, §2.8, §8; AC-23 and AC-14's unit and scan halves; T-23, T-14;
 * TASK-403).
 *
 * AC-23: the three fixture queries (an email, a phone number, a name with a street) never reach a
 * log line (the logger's own output and the proxy's request log), a Sentry event (`beforeSend` and
 * `beforeBreadcrumb` over the places the SDK puts a URL) or the GA4 adapter (the page's
 * `data-fo-analytics` payload and `sendPageAnalytics` with analytics granted), in their raw,
 * URL-encoded or normalised forms. The request log line has the pathname and no `?`; the `search`
 * event has no `search_term`; the bootstrap's `page_location` on a search address has no query
 * string; the results page's links are relative and carry no `q`.
 *
 * AC-14: no read of a geo header, geolocation or `Accept-Language` under `src/modules/search/` and
 * the search routes, `fo_dest` never read there, and the only `CF-Connecting-IP` in `src/` is the
 * limiter's; and the proxy's answer for a search address is the same across the header, address
 * and cookie permutations (the served-body hashes are the e2e suite's, carried forward).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { NextRequest } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { LocaleCode } from "../../src/config/locales.ts";
import { searchLocationPattern } from "../../src/lib/search-routes.ts";
import { beforeBreadcrumb, beforeSend } from "../../src/lib/sentry.ts";
import {
  SearchEventSchema,
  resultsBucket,
  searchEvent,
  sendPageAnalytics,
} from "../../src/modules/analytics/index.ts";
import { sanitisePageLocation } from "../../src/modules/analytics/location.ts";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type SearchPageView,
  SearchResultsPage,
  installSearchGate,
  normaliseForSearch,
  rateLimiter,
  searchEngine,
  searchPage,
} from "../../src/modules/search/index.ts";
import { proxy } from "../../src/proxy.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const ORIGIN = "https://flowersoverseas.com";

/** AC-23's three fixture queries. */
const PII = [
  "anna.kowalska@example.pl",
  "+48 601 234 567",
  "anna kowalska ul lipowa 5",
] as const;

/** Every form a query could leak in: raw, URL-encoded both ways, normalised, and its words. */
function needles(query: string): string[] {
  const forms = new Set([
    query,
    encodeURIComponent(query),
    new URLSearchParams({ q: query }).toString().slice(2),
    normaliseForSearch(query),
    "kowalska",
    "lipowa",
    "601 234",
    "601234567",
  ]);
  return [...forms].filter((form) => form.trim() !== "");
}

function expectClean(text: string, query: string): void {
  for (const needle of needles(query)) {
    expect(text, `${JSON.stringify(needle)} leaked`).not.toContain(needle);
  }
}

let lines: string[] = [];

function captureStdout(): void {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  installSearchGate(rateLimiter());
});

const messages = (locale: LocaleCode) =>
  loadMessages(locale, MESSAGE_NAMESPACES) as Record<string, unknown>;

function html(page: SearchPageView): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={page.locale}
      messages={messages(page.locale)}
      timeZone="UTC"
    >
      <SearchResultsPage view={page} />
    </NextIntlClientProvider>,
  );
}

beforeAll(async () => {
  await searchEngine().search({ locale: "en", query: "roses", to: "pl" });
}, 120_000);

describe("logs (AC-23)", () => {
  it.each(PII)(
    "the search.request line for %j holds none of the words",
    async (query) => {
      captureStdout();
      // The real logger, as the route calls it: the line goes to stdout.
      for (const raw of [{ q: query, to: "pl" }, { q: query }]) {
        const outcome = await searchPage("en", raw, {
          slow: { record: () => undefined },
        });
        expect(outcome.kind).toBe("page");
      }
      const written = lines.join("\n");
      expect(written).toContain('"event":"search.request"');
      expectClean(written, query);
    },
  );

  it.each(PII)(
    "the proxy's request log for %j has the pathname and no ?",
    (query) => {
      captureStdout();
      const url = `${ORIGIN}/en/search?${new URLSearchParams({ q: query, to: "pl" }).toString()}`;
      proxy(
        new NextRequest(
          new Request(url, { headers: { "cf-connecting-ip": "203.0.113.9" } }),
        ),
      );
      const records = lines.map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      expect(records.map((record) => record["path"])).toEqual([
        "/en/search",
        "/en/search",
      ]);
      const written = lines.join("\n");
      expect(written).not.toContain("?");
      expectClean(written, query);
    },
  );
});

describe("the breaker's awkward queries (AC-23)", () => {
  const LONG = "roses for anna kowalska ul lipowa ".repeat(6).trim();
  const RTL = "ورود حمراء إلى آنا";

  it.each([LONG, RTL])(
    "%j reaches no log line, no Sentry URL and no analytics payload, and counts at most 8 tokens",
    async (query) => {
      expect(LONG.length).toBeGreaterThan(200);
      captureStdout();
      const outcome = await searchPage(
        "en",
        { q: query, to: "pl" },
        {
          slow: { record: () => undefined },
        },
      );
      if (outcome.kind !== "page") throw new Error("expected a page");
      const view = outcome.view;
      // The page keeps at most 80 code points of the words, rendered inside <bdi> only.
      expect([...view.result.query].length).toBeLessThanOrEqual(80);
      const payload = JSON.stringify(view.analytics);
      // Arabic letters normalise to spaces (§2.3), so the RTL query has no token and no event.
      expect(view.analytics?.params.query_tokens ?? 0).toBeLessThanOrEqual(8);
      expect(view.analytics === null).toBe(query === RTL);
      const event = beforeSend({
        request: {
          url: `${ORIGIN}/en/search?${new URLSearchParams({ q: query }).toString()}`,
        },
      });
      for (const text of [lines.join("\n"), payload, JSON.stringify(event)]) {
        expect(text).not.toContain(view.result.query);
        expect(text).not.toContain(encodeURIComponent(query).slice(0, 30));
        expect(text).not.toContain("kowalska");
        expect(text).not.toContain("حمراء");
      }
    },
  );
});

describe("Sentry (AC-23)", () => {
  it.each(PII)(
    "beforeSend leaves none of %j in the URL, transaction, breadcrumbs, contexts, extra or tags",
    (query) => {
      const encoded = new URLSearchParams({ q: query, to: "pl" }).toString();
      const event = beforeSend({
        request: {
          url: `${ORIGIN}/en/search?${encoded}`,
          query_string: encoded,
          method: "GET",
        },
        transaction: `GET /en/search?${encoded}`,
        breadcrumbs: [
          {
            category: "navigation",
            data: {
              from: `/en/search?${encoded}`,
              to: `/en/poland/product/x?q=${query}`,
            },
          },
          {
            category: "fetch",
            data: { url: `${ORIGIN}/api/search/suggest?q=${query}` },
          },
        ],
        contexts: {
          trace: {
            data: {
              "url.full": `${ORIGIN}/en/search?${encoded}`,
              "url.query": encoded,
              "http.query": `?${encoded}`,
            },
          },
        },
        extra: { href: `/de/suche?q=${query}` },
        tags: { url: `/pl/szukaj?page=2&q=${query}` },
      });
      const serialised = JSON.stringify(event);
      expectClean(serialised, query);
      expect(serialised).toContain("q=:q");
      // What is not the words survives: the path and the destination.
      expect(event.request?.url).toBe(`${ORIGIN}/en/search?q=:q&to=pl`);
    },
  );

  it.each(PII)(
    "beforeBreadcrumb leaves none of %j in a navigation or a fetch",
    (query) => {
      const navigation = beforeBreadcrumb({
        category: "navigation",
        data: { from: "/en", to: `/en/search?q=${query}&to=pl` },
      });
      const fetch = beforeBreadcrumb({
        category: "fetch",
        data: {
          url: `${ORIGIN}/en/search?${new URLSearchParams({ q: query }).toString()}`,
        },
      });
      expectClean(JSON.stringify([navigation, fetch]), query);
      expect(navigation.data).toEqual({
        from: "/en",
        to: "/en/search?q=:q&to=pl",
      });
    },
  );
});

describe("GA4 (AC-23)", () => {
  it("the search event has no search_term, by schema and by builder", () => {
    expect(Object.keys(SearchEventSchema.shape.params.shape).sort()).toEqual([
      "destination_country",
      "locale",
      "query_tokens",
      "results_bucket",
    ]);
    expect(
      SearchEventSchema.safeParse({
        event: "search",
        params: {
          locale: "en",
          results_bucket: "0",
          query_tokens: 1,
          search_term: "roses",
        },
      }).success,
    ).toBe(false);
    expect(resultsBucket(0)).toBe("0");
    expect(resultsBucket(1)).toBe("1-12");
    expect(resultsBucket(12)).toBe("1-12");
    expect(resultsBucket(13)).toBe("13+");
    expect(
      searchEvent({ locale: "en", destination: "PL", count: 13, tokens: 9 }),
    ).toEqual({
      event: "search",
      params: {
        locale: "en",
        destination_country: "pl",
        results_bucket: "13+",
        query_tokens: 8,
      },
    });
    expect(
      searchEvent({ locale: "en", destination: null, count: 0, tokens: 0 }),
    ).toBeNull();
  });

  it.each(PII)(
    "the page's payload for %j and the adapter's call, consent granted, hold none of the words",
    async (query) => {
      for (const raw of [{ q: query, to: "pl" }, { q: query }]) {
        const outcome = await searchPage("pl", raw, {
          log: { info: () => undefined },
          slow: { record: () => undefined },
        });
        if (outcome.kind !== "page") throw new Error("expected a page");
        const markup = html(outcome.view);
        const attribute = /data-fo-analytics="([^"]*)"/u.exec(markup)?.[1];
        expect(attribute).toBeDefined();
        const payload = (attribute ?? "").replaceAll("&quot;", '"');
        expectClean(payload, query);
        expect(payload).not.toContain("search_term");

        const gtag = vi.fn();
        expect(sendPageAnalytics(payload, { analytics: true }, gtag)).toBe(
          true,
        );
        expect(gtag).toHaveBeenCalledTimes(1);
        const [command, name, params] = gtag.mock.calls[0] ?? [];
        expect([command, name]).toEqual(["event", "search"]);
        expect(params).not.toHaveProperty("search_term");
        expectClean(JSON.stringify(gtag.mock.calls), query);

        // The product links: relative, never carrying the words.
        for (const [, href = ""] of markup.matchAll(/href="([^"]*)"/gu)) {
          expect(href.startsWith("/"), href).toBe(true);
          expect(href).not.toMatch(/[?&]q=/u);
        }
      }
    },
  );

  it("sends nothing when analytics is refused, or for a payload that is not the search event", () => {
    const gtag = vi.fn();
    const payload = JSON.stringify(
      searchEvent({ locale: "en", destination: "pl", count: 3, tokens: 2 }),
    );
    expect(sendPageAnalytics(payload, { analytics: false }, gtag)).toBe(false);
    expect(
      sendPageAnalytics(
        JSON.stringify({
          event: "search",
          params: {
            locale: "en",
            results_bucket: "0",
            query_tokens: 1,
            search_term: PII[0],
          },
        }),
        { analytics: true },
        gtag,
      ),
    ).toBe(false);
    expect(sendPageAnalytics("{not json", { analytics: true }, gtag)).toBe(
      false,
    );
    expect(sendPageAnalytics(payload, { analytics: true }, undefined)).toBe(
      false,
    );
    expect(gtag).not.toHaveBeenCalled();
  });

  /**
   * The `page_location` the GA4 loader sends for a page at `href`. Since spec 023 (TASK-492) the
   * consent bootstrap queues no `config`; the deferred loader sends `sanitisePageLocation()` of
   * the page's address, which absorbed the bootstrap's search rewrite (TASK-522).
   */
  function pageLocation(href: string): unknown {
    return sanitisePageLocation(href);
  }

  it.each([
    ["/en/search?q=anna.kowalska%40example.pl&to=pl", "/en/search"],
    ["/en-gb/search?q=%2B48+601+234+567", "/en-gb/search"],
    ["/de/suche?to=pl&q=anna+kowalska+ul+lipowa+5#top", "/de/suche"],
    ["/pl/szukaj/?q=anna", "/pl/szukaj/"],
    ["/en/-search?q=anna", "/en/-search"],
    ["/en/poland/flowers?utm_source=x", "/en/poland/flowers?utm_source=x"],
    // Spec 023 AC-7: only `step` and the `utm_*` keys survive, on any path (TASK-492).
    ["/en/searching?q=x", "/en/searching"],
  ])("page_location for %s is %s", (path, expected) => {
    expect(pageLocation(`${ORIGIN}${path}`)).toBe(`${ORIGIN}${expected}`);
  });

  it("the bootstrap's search pattern is built from every locale's segment", () => {
    const pattern = searchLocationPattern();
    for (const path of ["/en/search?q=1", "/de/suche?q=1", "/pl/szukaj#x"]) {
      expect(pattern.test(path), path).toBe(true);
    }
    expect(pattern.test("/de/search?q=1")).toBe(false);
  });
});

/** Every file under `dir`, recursively. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("no geo, no address but the limiter's (AC-14)", () => {
  const searchFiles = [
    ...files(join(ROOT, "src", "modules", "search")),
    ...files(join(ROOT, "src", "app", "[locale]", "-search")),
    ...files(join(ROOT, "src", "app", "[locale]", "@header", "-search")),
    ...files(join(ROOT, "src", "app", "[locale]", "@switcher", "-search")),
  ];

  it("no file of the search module or route reads a geo header, geolocation, Accept-Language or fo_dest", () => {
    expect(searchFiles.length).toBeGreaterThan(10);
    for (const file of searchFiles) {
      const source = readFileSync(file, "utf8").toLowerCase();
      for (const banned of [
        "cf-ipcountry",
        "x-vercel-ip-country",
        "geolocation",
        "accept-language",
        "fo_dest",
        "cookies()",
      ]) {
        expect(source, `${relative(ROOT, file)} names ${banned}`).not.toContain(
          banned,
        );
      }
    }
  });

  it("the only CF-Connecting-IP in src/ is the limiter's", () => {
    const readers = files(join(ROOT, "src")).filter((file) =>
      readFileSync(file, "utf8").toLowerCase().includes("cf-connecting-ip"),
    );
    expect(readers.map((file) => relative(ROOT, file))).toEqual([
      join("src", "modules", "search", "gate.ts"),
    ]);
  });

  it("the proxy's answer for a search address is the same across geo, language, cookie and forwarded headers", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const answers = new Set<string>();
    const countries = [undefined, "GB", "DE", "PL", "US"];
    const languages = [undefined, "de", "pl"];
    const cookies = [
      undefined,
      "fo_locale=de; fo_currency=EUR; fo_consent=x; fo_dest=pl",
      "fo_dest=de",
    ];
    const addresses = [
      "203.0.113.1",
      "203.0.113.2",
      "198.51.100.3",
      "2001:db8::4",
    ];
    let n = 0;
    for (const path of [
      "/en/search?q=roses&to=pl",
      "/pl/szukaj?q=roze",
      "/de/suche",
    ]) {
      for (const country of countries) {
        for (const language of languages) {
          for (const cookie of cookies) {
            const address = addresses[n % addresses.length] ?? "";
            n += 1;
            const headers: Record<string, string> = {
              "cf-connecting-ip": address,
              "x-forwarded-for": address,
              "x-request-id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
            };
            if (country !== undefined) headers["cf-ipcountry"] = country;
            if (language !== undefined) headers["accept-language"] = language;
            if (cookie !== undefined) headers["cookie"] = cookie;
            const response = proxy(
              new NextRequest(new Request(`${ORIGIN}${path}`, { headers })),
            );
            const own = [...response.headers.entries()]
              .filter(
                ([key]) =>
                  !key.startsWith("x-middleware-request-") &&
                  key !== "x-middleware-override-headers",
              )
              .sort()
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n");
            answers.add(`${path}\n${String(response.status)}\n${own}`);
          }
        }
      }
    }
    // One answer per path, whatever the headers said.
    expect(answers.size).toBe(3);
  });
});
