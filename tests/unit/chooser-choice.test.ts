/**
 * T-83 (unit half), T-84 (integration half), T-95 (source scan), T-96 (cookie half): the country
 * chooser's decision, its `303` and its cookie (spec 004 §14 A-founder-2026-10-24a item 3, AC-77,
 * AC-78, AC-89, AC-90; TASK-385).
 *
 * The decision is `decideChooser()` (what one request to `/{locale}/{chooseSegment}/...` gets),
 * the answer is `chooserChoiceResponse()` (the choice route's `303` with one `Set-Cookie: fo_dest`),
 * and the page's view is `chooserPageView()`. All three read the path, the form's `to` and, for the
 * view, the remembered code handed in, and nothing else: the scan at the end proves it of the
 * source. Today's data: seven demo shop countries, every product sold in each (the not-live case
 * uses a fixture shop set without Spain; the not-available case is `chooser-unavailable.test.ts`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  COUNTRIES,
  countryConfig,
  isCountryIso2,
} from "../../src/config/countries";
import { DEST_COOKIE_MAX_AGE_SECONDS } from "../../src/config/cookies";
import {
  type ShopData,
  chooserChoiceResponse,
  chooserPageState,
  chooserPageView,
  chosenInput,
  closestCountries,
  countryDisplayName,
  countryVersionOf,
  decideChooser,
  destCookieHeader,
  parseChooserNext,
  resolveCountryInput,
  shopCountries,
} from "../../src/modules/catalog";
import { GET } from "../../src/app/api/choose/[locale]/[[...rest]]/route";

const repoRoot = resolve(import.meta.dirname, "../..");

/** Today's shop set minus Spain: Spain is a registry country with no shop root. */
const WITHOUT_SPAIN: ShopData = {
  countries: () => COUNTRIES,
  orderingOpen: () => false,
  shopRootExists: (iso2) => Promise.resolve(iso2 !== "ES"),
  products: () => Promise.resolve([]),
  demoSaleable: () => Promise.resolve(true),
  liveSaleable: () => Promise.resolve(true),
};

/** Every `next` shape of item 3 in `en`, as the chooser's path spells it. */
const SHAPES = [
  "",
  "flowers/roses",
  "occasions/birthday",
  "product/vistula-red",
  "price/low",
  "search",
] as const;

const segmentsOf = (next: string): string[] =>
  next === "" ? [] : next.split("/");

describe("the typed country (AC-78)", () => {
  it("resolves an ISO code in any case and a name in any launch locale", () => {
    expect(resolveCountryInput("pl")).toBe("PL");
    expect(resolveCountryInput("PL")).toBe("PL");
    expect(resolveCountryInput("Poland")).toBe("PL");
    expect(resolveCountryInput("Polska")).toBe("PL");
    expect(resolveCountryInput("Polen")).toBe("PL");
    expect(resolveCountryInput("  poland ")).toBe("PL");
    expect(resolveCountryInput("Niemcy")).toBe("DE");
    // Accents and case go: the German exonym typed without its umlaut.
    expect(resolveCountryInput("rumanien")).toBe("RO");
    expect(resolveCountryInput("RUMÄNIEN")).toBe("RO");
  });

  it("resolves nothing for a non-country, an empty value or an over-long one", () => {
    expect(resolveCountryInput("Swedn")).toBeUndefined();
    expect(resolveCountryInput("xx")).toBeUndefined();
    expect(resolveCountryInput("   ")).toBeUndefined();
    expect(resolveCountryInput(`Poland${" ".repeat(60)}`)).toBeUndefined();
  });

  it("finds the closest names for a near miss, nearest first", () => {
    expect(closestCountries("Swedn", "en")).toEqual(["ES"]);
    expect(closestCountries("germ", "en")).toEqual(["DE"]);
    expect(closestCountries("Polnd", "en")).toEqual(["PL"]);
    expect(closestCountries("qqqqq", "en")).toEqual([]);
  });

  it("reads the last non-empty `to`: the typed field wins over the default button", () => {
    expect(chosenInput(["fr", ""])).toBe("fr");
    expect(chosenInput(["fr", "Germany"])).toBe("Germany");
    expect(chosenInput(["", " "])).toBeUndefined();
    expect(chosenInput([])).toBeUndefined();
  });
});

describe("decideChooser(): what one request gets (AC-77, AC-78)", () => {
  it("asks on a plain chooser address", async () => {
    for (const next of SHAPES) {
      const decision = await decideChooser("en", segmentsOf(next), []);
      expect(decision, next).toEqual({
        kind: "page",
        next: parseChooserNext("en", next),
        state: { kind: "ask" },
      });
    }
  });

  it("is a choice for every shop country by button, by name and by the path form", async () => {
    for (const iso2 of (await shopCountries("en")).filter(isCountryIso2)) {
      const code = iso2.toLowerCase();
      for (const next of SHAPES) {
        const expected = {
          kind: "choice",
          iso2,
          next: parseChooserNext("en", next),
          version: await countryVersionOf(parseChooserNext("en", next), iso2),
        };
        for (const decision of [
          await decideChooser("en", segmentsOf(next), [code, ""]),
          // The name in another launch locale, typed, after the default button's code.
          await decideChooser("en", segmentsOf(next), [
            "fr",
            countryDisplayName(countryConfig(iso2), "pl"),
          ]),
          await decideChooser("en", [code, ...segmentsOf(next)], []),
        ]) {
          expect(decision, `${iso2} ${next}`).toEqual(expected);
        }
      }
    }
  });

  it("takes the typed name over the path form's country", async () => {
    expect(
      await decideChooser("en", ["de", "flowers", "roses"], ["Polska"]),
    ).toEqual({
      kind: "choice",
      iso2: "PL",
      next: { locale: "en", kind: "category", key: "roses" },
      version: { kind: "page", path: "/en/poland/flowers/roses" },
    });
  });

  it("lists matches for an unknown name, with what was typed", async () => {
    expect(
      await decideChooser("en", ["product", "vistula-red"], ["fr", "Swedn"]),
    ).toEqual({
      kind: "page",
      next: { locale: "en", kind: "product", sku: "FO-BQ-002" },
      state: { kind: "noMatch", query: "Swedn", closest: ["ES"] },
    });
  });

  it("answers the not-live state for a registry country outside the shop set, typed or in the path", async () => {
    for (const decision of [
      await decideChooser("en", [], ["Spain"], WITHOUT_SPAIN),
      await decideChooser("en", ["es"], [], WITHOUT_SPAIN),
    ]) {
      expect(decision).toEqual({
        kind: "page",
        next: { locale: "en", kind: "home" },
        state: { kind: "notLive", iso2: "ES" },
      });
      expect(chooserPageState(decision)).toEqual({
        kind: "notLive",
        iso2: "ES",
      });
    }
  });

  it("drops an unsafe `next` to the shop root and keeps the choice", async () => {
    for (const segments of [
      ["https:", "", "x.test"],
      ["", "", "x.test"],
      ["%2F%2Fx"],
      ["\\x"],
      ["fluggi"],
      ["a".repeat(257)],
    ]) {
      expect(
        await decideChooser("en", segments, ["pl"]),
        segments.join("/"),
      ).toEqual({
        kind: "choice",
        iso2: "PL",
        next: { locale: "en", kind: "home" },
        version: { kind: "page", path: "/en/poland/flowers" },
      });
    }
  });

  it("asks again on the page when a choice reaches it (a hand-typed `?to=pl`)", async () => {
    expect(
      chooserPageState(
        await decideChooser("en", ["product", "vistula-red"], ["pl"]),
      ),
    ).toEqual({ kind: "ask" });
  });
});

describe("chooserChoiceResponse(): the 303 and the one cookie (AC-78, AC-90)", () => {
  const choose = (
    segments: readonly string[],
    to: readonly string[] = [],
    data?: ShopData,
  ): Promise<Response> =>
    chooserChoiceResponse({ locale: "en", segments, to }, data);

  it("answers 303 to the country version with exactly one fo_dest, uncached", async () => {
    const response = await choose(["product", "vistula-red"], ["pl", ""]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/en/poland/product/vistula-red",
    );
    expect(response.headers.getSetCookie()).toEqual([
      "fo_dest=pl; Max-Age=15552000; Path=/; SameSite=Lax; Secure",
    ]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBeNull();
  });

  it("lands each shape where item 3's table says, in Poland, by the form and by the path form", async () => {
    const expected: Record<(typeof SHAPES)[number], string> = {
      "": "/en/poland/flowers",
      "flowers/roses": "/en/poland/flowers/roses",
      // An evergreen occasion has no country occasion page: the hub's own row, the category.
      "occasions/birthday": "/en/poland/flowers/birthday-flowers",
      "product/vistula-red": "/en/poland/product/vistula-red",
      "price/low": "/en/poland/flowers?price=low",
      // Spec 045's results page is unpublished: the shop root (TASK-381's carry-forward).
      search: "/en/poland/flowers",
    };
    for (const next of SHAPES) {
      for (const response of [
        await choose(segmentsOf(next), ["Poland"]),
        await choose(["pl", ...segmentsOf(next)]),
      ]) {
        expect(response.status, next).toBe(303);
        expect(response.headers.get("location"), next).toBe(expected[next]);
      }
    }
  });

  it("matches countryVersionOf() for every shop country and every shape", async () => {
    for (const iso2 of (await shopCountries("en-gb")).filter(isCountryIso2)) {
      for (const next of [
        "",
        "flowers/roses",
        "occasions/birthday",
        "product/vistula-red",
        "price/high",
        "search",
      ]) {
        const response = await chooserChoiceResponse({
          locale: "en-gb",
          segments: segmentsOf(next),
          to: [iso2.toLowerCase()],
        });
        expect(response.status, `${iso2} ${next}`).toBe(303);
        expect(response.headers.get("location"), `${iso2} ${next}`).toBe(
          (await countryVersionOf(parseChooserNext("en-gb", next), iso2)).path,
        );
        expect(response.headers.getSetCookie(), `${iso2} ${next}`).toEqual([
          destCookieHeader(iso2),
        ]);
      }
    }
  });

  it("sends a no match, a country not live yet and an empty choice back to the page, with no cookie", async () => {
    const cases: readonly [Response, string][] = [
      [
        await choose(["product", "vistula-red"], ["Swedn"]),
        "/en/choose-country/product/vistula-red?to=Swedn",
      ],
      [
        await choose(["product", "vistula-red"], ["Spain"], WITHOUT_SPAIN),
        "/en/choose-country/product/vistula-red?to=es",
      ],
      [await choose(["es"], [], WITHOUT_SPAIN), "/en/choose-country?to=es"],
      [
        await choose(["flowers", "roses"], [""]),
        "/en/choose-country/flowers/roses",
      ],
      // A mis-cased path form is no path form: nothing was chosen.
      [await choose(["PL"]), "/en/choose-country"],
      // What was typed goes back encoded, never as raw markup.
      [
        await choose([], ['<b>"x"</b>']),
        "/en/choose-country?to=%3Cb%3E%22x%22%3C%2Fb%3E",
      ],
    ];
    for (const [response, location] of cases) {
      expect(response.status, location).toBe(303);
      expect(response.headers.get("location"), location).toBe(location);
      expect(response.headers.getSetCookie(), location).toEqual([]);
    }
  });

  it("answers 404 for a locale that is not a launch locale", async () => {
    for (const locale of ["fr", "en-XA", "EN"]) {
      const response = await chooserChoiceResponse({
        locale,
        segments: [],
        to: ["pl"],
      });
      expect(response.status, locale).toBe(404);
      expect(response.headers.getSetCookie(), locale).toEqual([]);
      expect(response.headers.get("location"), locale).toBeNull();
    }
  });

  it("answers 404 for a routed pseudo-locale, as in CI and on previews", async () => {
    // The subject: with the pseudo-locales routed, `en-XA` is a configured locale code, so only
    // the launch-locale check keeps a chooser in it from setting the cookie.
    vi.stubEnv("ENABLE_PSEUDO_LOCALES", "true");
    vi.resetModules();
    try {
      const locales = await import("../../src/config/locales");
      const catalog = await import("../../src/modules/catalog");
      expect(locales.isLocaleCode("en-XA")).toBe(true);
      const response = await catalog.chooserChoiceResponse({
        locale: "en-XA",
        segments: [],
        to: ["pl"],
      });
      expect(response.status).toBe(404);
      expect(response.headers.getSetCookie()).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("is what the route file answers, `to` read from the query", async () => {
    const response = await GET(
      new Request("https://x.test/api/choose/en/price/mid?to=fr&to=de&q=x"),
      {
        params: Promise.resolve({ locale: "en", rest: ["price", "mid"] }),
      },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/en/germany/flowers?price=mid",
    );
    expect(response.headers.getSetCookie()).toEqual([
      "fo_dest=de; Max-Age=15552000; Path=/; SameSite=Lax; Secure",
    ]);
  });

  it("keeps the cookie's lifetime in the register at 180 days", () => {
    expect(DEST_COOKIE_MAX_AGE_SECONDS).toBe(180 * 24 * 60 * 60);
  });
});

describe("chooserPageView(): what the page draws (AC-77)", () => {
  const next = parseChooserNext("en", "product/vistula-red");

  it("draws the first six shop countries in the one order and every registry country in the datalist", async () => {
    const view = await chooserPageView(
      "en",
      next,
      { kind: "ask" },
      {
        remembered: undefined,
        chips: 6,
      },
    );
    expect(view.action).toBe("/api/choose/en/product/vistula-red");
    expect(view.chips.map((chip) => chip.name)).toEqual([
      "France",
      "Germany",
      "Italy",
      "Netherlands",
      "Poland",
      "Romania",
    ]);
    expect(view.chips.map((chip) => chip.code)).toEqual([
      "fr",
      "de",
      "it",
      "nl",
      "pl",
      "ro",
    ]);
    expect(view.datalist).toEqual([
      "France",
      "Germany",
      "Italy",
      "Netherlands",
      "Poland",
      "Romania",
      "Spain",
    ]);
    expect(view.remembered).toBeUndefined();
    expect(view.regions).toEqual([]);
    expect(view.closest).toEqual([]);
  });

  it("orders the buttons in the reader's collation", async () => {
    const view = await chooserPageView(
      "de",
      parseChooserNext("de", ""),
      { kind: "ask" },
      { remembered: undefined, chips: 6 },
    );
    expect(view.chips.map((chip) => chip.code)).toEqual([
      "de",
      "fr",
      "it",
      "nl",
      "pl",
      "ro",
    ]);
  });

  it("leads with the remembered shop country and ignores anything else", async () => {
    const remembered = await chooserPageView(
      "en",
      next,
      { kind: "ask" },
      {
        remembered: "fr",
        chips: 6,
      },
    );
    expect(remembered.remembered).toEqual({
      code: "fr",
      name: "France",
      href: "/en/choose-country/fr/product/vistula-red",
    });
    for (const value of ["xx", "france", "", "f", "es"]) {
      const view = await chooserPageView(
        "en",
        next,
        { kind: "ask" },
        {
          remembered: value,
          chips: 6,
          data: WITHOUT_SPAIN,
        },
      );
      expect(view.remembered, value).toBeUndefined();
    }
  });

  it("lists the closest names and every shop country by region on a no match, as path-form links", async () => {
    const view = await chooserPageView(
      "en",
      next,
      { kind: "noMatch", query: "Swedn", closest: ["ES"] },
      { remembered: undefined, chips: 6 },
    );
    expect(view.closest).toEqual([
      {
        code: "es",
        name: "Spain",
        href: "/en/choose-country/es/product/vistula-red",
      },
    ]);
    expect(
      view.regions.map((region) => [
        region.headingKey,
        region.countries.map((country) => country.href),
      ]),
    ).toEqual([
      [
        "destinationsHub.region.centralEurope",
        [
          "/en/choose-country/de/product/vistula-red",
          "/en/choose-country/nl/product/vistula-red",
          "/en/choose-country/pl/product/vistula-red",
        ],
      ],
      [
        "destinationsHub.region.westernSouthernEurope",
        [
          "/en/choose-country/fr/product/vistula-red",
          "/en/choose-country/it/product/vistula-red",
          "/en/choose-country/es/product/vistula-red",
        ],
      ],
      [
        "destinationsHub.region.southEasternEurope",
        ["/en/choose-country/ro/product/vistula-red"],
      ],
    ]);
  });
});

describe("no guessing (AC-89, T-95): the chooser reads no geography or language header", () => {
  /** The chooser's own files: the decision, the paths, the routes, the page and its form. */
  const FILES = [
    "src/modules/catalog/chooser-choice.ts",
    "src/modules/catalog/chooser.ts",
    "src/lib/chooser-routes.ts",
    "src/modules/catalog/ui/ChooserPage.tsx",
    "src/modules/ui/shop/CountryPicker.tsx",
    "src/app/api/choose/[locale]/[[...rest]]/route.ts",
    "src/app/[locale]/-choose/-next/[[...rest]]/page.tsx",
    "src/app/[locale]/@header/-choose/-next/[[...rest]]/page.tsx",
  ];
  const FORBIDDEN =
    /cf-ipcountry|x-forwarded-for|x-real-ip|x-vercel-ip|accept-language|geolocation|\.geo\b|navigator\.language|user-agent|headers\(\)/iu;
  /** The code without its comments: the doc comments name the headers they never read. */
  const code = (path: string): string =>
    readFileSync(resolve(repoRoot, path), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/(^|[^:])\/\/.*$/gmu, "$1");

  it("finds none of them in any chooser file", () => {
    for (const path of FILES) {
      expect(code(path), path).not.toMatch(FORBIDDEN);
    }
  });

  it("reads only the remembered country among the cookies", () => {
    const page = code("src/app/[locale]/-choose/-next/[[...rest]]/page.tsx");
    expect(page.match(/cookies\(\)/gu)).toHaveLength(1);
    expect(page).toContain(".get(DEST_COOKIE_NAME)");
  });
});

describe("in no sitemap (AC-77)", () => {
  it("no committed sitemap fixture names a chooser address in any locale", () => {
    const dir = resolve(repoRoot, "tests/fixtures/seo/sitemap");
    const files = readdirSync(dir, {
      recursive: true,
      encoding: "utf8",
    }).filter((name) => name.endsWith(".xml") || name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      expect(readFileSync(resolve(dir, name), "utf8"), name).not.toMatch(
        /\/(en|en-gb)\/choose-country|\/de\/land-waehlen|\/pl\/wybierz-kraj|\/-choose\b|\/api\/choose\b/u,
      );
    }
  });
});
