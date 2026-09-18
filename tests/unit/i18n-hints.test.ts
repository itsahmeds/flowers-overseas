/**
 * T-28 (unit half) / AC-28, and the "ignored" half of AC-12 (TASK-041, TASK-119): the
 * language-preference parser, the launch-locale matcher, the country reader and the whole dialog
 * decision, as pure functions.
 *
 * The suggestion's behaviour is specified as a matrix (spec 003 §2 "Behaviour", §5.3, AC-28, and
 * §14 A14's two-pass hint) and the island is deliberately built so that the matrix is decidable
 * without a browser: `hints.ts` takes `{ urlLocale, languages, cookie, country, candidates }` and
 * returns shown/hidden with a reason. `tests/e2e/banner.spec.ts` then proves the things only a
 * browser can prove — that the dialog appears after hydration, that it shifts no layout, that
 * `Esc` records "stay", and that the cookie the browser stores carries the attributes of §13 Q4.
 *
 * **§14 A14 reversed §6/§7's "language preferences only" narrowing**, on the founder's ruling of
 * 2026-09-16: `hints.ts` may now read the edge country header, and it is still the *only* file
 * that may (`fo/no-geo-redirect`, ADR-0006). What it may still never do is read the *browser* —
 * no `navigator`, no `document`, no `window` — or the request, or redirect anything, and this
 * file asserts all of that against the source.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GEO_COUNTRY_HEADERS,
  type SuggestionCandidate,
  countryFromHeaders,
  decideSuggestion,
  languagePreferences,
  parseAcceptLanguage,
  preferredLocale,
  readLocaleCookie,
  serialiseLocaleCookie,
} from "../../src/modules/i18n/hints.ts";
import { launchLocales } from "../../src/modules/i18n/routing.ts";

const repoRoot = resolve(__dirname, "../..");

/** The real launch locales — the matcher must work against the shipped registry, not a fake. */
const REGISTRY = launchLocales();

const CANDIDATES: readonly SuggestionCandidate[] = REGISTRY.map((locale) => ({
  code: locale.code,
  bcp47: locale.bcp47,
  hreflangAliases: locale.hreflangAliases,
  nativeName: locale.nativeName,
  href: `/${locale.code}`,
}));

describe("parseAcceptLanguage (RFC 7231 §5.3.5)", () => {
  it("returns the ranges most-preferred first, with their q-values", () => {
    expect(parseAcceptLanguage("de-AT;q=0.9,de;q=0.8,en;q=0.7")).toEqual([
      { tag: "de-AT", quality: 0.9 },
      { tag: "de", quality: 0.8 },
      { tag: "en", quality: 0.7 },
    ]);
  });

  it("defaults a missing q-value to 1 and sorts by weight, not by position", () => {
    expect(parseAcceptLanguage("de;q=0.5, pl")).toEqual([
      { tag: "pl", quality: 1 },
      { tag: "de", quality: 0.5 },
    ]);
  });

  it("keeps header order for equal weights (the sort is stable)", () => {
    expect(
      parseAcceptLanguage("pl;q=0.8,de;q=0.8,en;q=0.8").map((p) => p.tag),
    ).toEqual(["pl", "de", "en"]);
  });

  it("tolerates whitespace and mixed case without rewriting the tag", () => {
    expect(parseAcceptLanguage("  DE-de ;  Q=0.4  ")).toEqual([
      { tag: "DE-de", quality: 0.4 },
    ]);
  });

  it("ignores extension parameters other than q", () => {
    expect(parseAcceptLanguage("de;foo=bar;q=0.5")).toEqual([
      { tag: "de", quality: 0.5 },
    ]);
  });

  it("drops `q=0`, which means `not acceptable`, rather than returning a zero weight", () => {
    expect(parseAcceptLanguage("de;q=0,pl;q=1")).toEqual([
      { tag: "pl", quality: 1 },
    ]);
  });

  it("drops the `*` wildcard: it names no language, so it can suggest none", () => {
    expect(parseAcceptLanguage("*;q=0.5,de")).toEqual([
      { tag: "de", quality: 1 },
    ]);
  });

  for (const [name, header] of [
    ["an empty header", ""],
    ["whitespace only", "   "],
    ["a lone separator", ","],
    ["a lone parameter", ";q=0.5"],
    ["a non-numeric q", "de;q=abc"],
    ["a q above 1", "de;q=2"],
    ["a negative q", "de;q=-0.5"],
    ["an empty q", "de;q="],
    ["a range with an underscore", "de_AT"],
    ["a range with a space", "de AT"],
    ["an over-long subtag", "abcdefghij"],
    ["a numeric primary subtag", "1de"],
  ] as const) {
    it(`returns nothing usable for ${name}`, () => {
      expect(parseAcceptLanguage(header)).toEqual([]);
    });
  }

  it("drops only the malformed element and keeps the rest of the header", () => {
    expect(parseAcceptLanguage("de_AT,pl;q=abc,de;q=0.7,en")).toEqual([
      { tag: "en", quality: 1 },
      { tag: "de", quality: 0.7 },
    ]);
  });

  it("is pure: the same header parses the same way twice", () => {
    const header = "en-GB,en;q=0.9,de;q=0.4";
    expect(parseAcceptLanguage(header)).toEqual(parseAcceptLanguage(header));
  });
});

describe("languagePreferences (navigator.languages)", () => {
  it("keeps the browser's order through strictly descending weights", () => {
    const preferences = languagePreferences(["de-DE", "de", "en-US"]);

    expect(preferences.map((p) => p.tag)).toEqual(["de-DE", "de", "en-US"]);
    expect(preferences[0]!.quality).toBeGreaterThan(preferences[1]!.quality);
    expect(preferences[1]!.quality).toBeGreaterThan(preferences[2]!.quality);
    for (const { quality } of preferences) {
      expect(quality).toBeGreaterThan(0);
      expect(quality).toBeLessThanOrEqual(1);
    }
  });

  it("drops forged, non-string and malformed entries instead of trusting the list", () => {
    expect(
      languagePreferences(["de", null, 42, "", "en_US", { tag: "pl" }, "pl"]),
    ).toEqual([
      { tag: "de", quality: 1 },
      { tag: "pl", quality: expect.any(Number) },
    ]);
  });

  it("keeps every weight inside 0–1 for an absurdly long list", () => {
    const preferences = languagePreferences(
      Array.from({ length: 200 }, () => "de"),
    );

    expect(preferences.length).toBeLessThanOrEqual(20);
    for (const { quality } of preferences) {
      expect(quality).toBeGreaterThan(0);
      expect(quality).toBeLessThanOrEqual(1);
    }
  });
});

describe("preferredLocale (the launch-locale matcher)", () => {
  /** AC-28's matrix plus the regional aliases of `plan/02` §3. */
  const CASES = [
    { languages: ["de-AT"], expected: "de" },
    { languages: ["de-DE", "de"], expected: "de" },
    { languages: ["de-CH"], expected: "de" },
    { languages: ["de"], expected: "de" },
    { languages: ["en-US"], expected: "en" },
    { languages: ["en"], expected: "en" },
    { languages: ["en-GB"], expected: "en-gb" },
    { languages: ["en-gb"], expected: "en-gb" },
    { languages: ["en-IE"], expected: "en" },
    { languages: ["en-NL"], expected: "en" },
    { languages: ["pl"], expected: "pl" },
    { languages: ["pl-PL"], expected: "pl" },
    { languages: ["fr"], expected: null },
    { languages: ["fr-FR", "es"], expected: null },
    { languages: [], expected: null },
    // A stronger preference wins over a weaker one, whatever the header order was.
    { languages: ["pl", "de"], expected: "pl" },
    { languages: ["fr", "de-AT"], expected: "de" },
  ] as const;

  for (const { languages, expected } of CASES) {
    it(`maps [${languages.join(", ")}] to ${expected ?? "null"}`, () => {
      expect(preferredLocale(languagePreferences(languages), REGISTRY)).toBe(
        expected,
      );
    });
  }

  it("matches case-insensitively but never rewrites a code", () => {
    expect(preferredLocale([{ tag: "EN-GB", quality: 1 }], REGISTRY)).toBe(
      "en-gb",
    );
  });

  it("respects q-values rather than argument order", () => {
    expect(
      preferredLocale(
        parseAcceptLanguage("de;q=0.2,pl;q=0.9,fr;q=1"),
        REGISTRY,
      ),
    ).toBe("pl");
  });

  it("answers `null` for an empty registry rather than guessing a default", () => {
    expect(preferredLocale([{ tag: "de", quality: 1 }], [])).toBeNull();
  });

  it("works on the island's four-field projection, not only on the registry", () => {
    expect(preferredLocale(languagePreferences(["de-AT"]), CANDIDATES)).toBe(
      "de",
    );
  });
});

describe("decideSuggestion (the AC-28 matrix)", () => {
  const base = { urlLocale: "en", candidates: CANDIDATES } as const;

  it("shows the German banner on /en for a de-DE browser with no cookie", () => {
    const decision = decideSuggestion({
      ...base,
      languages: ["de-DE", "de"],
      cookie: null,
    });

    expect(decision.show).toBe(true);
    expect(decision.show && decision.target.code).toBe("de");
    expect(decision.show && decision.target.nativeName).toBe("Deutsch");
    expect(decision.show && decision.target.href).toBe("/de");
  });

  it("never renders once `fo_locale` is set, whatever the languages say", () => {
    expect(
      decideSuggestion({
        ...base,
        languages: ["de-DE"],
        cookie: "fo_locale=en",
      }),
    ).toEqual({ show: false, reason: "cookie" });
  });

  it("never renders when the hint is the locale already being viewed", () => {
    expect(
      decideSuggestion({ ...base, languages: ["en-US"], cookie: null }),
    ).toEqual({ show: false, reason: "sameLocale" });
  });

  it("never renders when no launch locale is a better answer", () => {
    expect(
      decideSuggestion({ ...base, languages: ["fr-FR"], cookie: null }),
    ).toEqual({ show: false, reason: "noBetterLocale" });
  });

  it("has no third way out: there is no dismissal, only the two recorded answers (§14 A14)", () => {
    // The popup asks once and both of its actions write `fo_locale`. A "not now" that remembered
    // nothing would ask again on the next page view, which is what §14 A14 removed.
    const reasons = new Set<string>();
    for (const languages of [["de-DE"], ["fr-FR"], ["en-US"]]) {
      const decision = decideSuggestion({ ...base, languages, cookie: null });
      if (!decision.show) reasons.add(decision.reason);
    }
    expect([...reasons].sort()).toEqual(["noBetterLocale", "sameLocale"]);
  });

  it("renders nothing on a URL whose locale is not a launch locale", () => {
    expect(
      decideSuggestion({
        urlLocale: "fr",
        candidates: CANDIDATES,
        languages: ["de-DE"],
        cookie: null,
      }),
    ).toEqual({ show: false, reason: "unknownUrlLocale" });
  });

  it("ignores a forged `fo_locale=zz` and decides as for a first visit (AC-12)", () => {
    const decision = decideSuggestion({
      ...base,
      languages: ["de-DE"],
      cookie: "fo_locale=zz",
    });

    expect(decision).toEqual({
      show: true,
      source: "language",
      target: expect.objectContaining({ code: "de" }),
    });
  });

  /**
   * `/review 23`'s blocker, at the decision level. `readLocaleCookie` used to decode the value,
   * so `fo_locale=%` threw `URIError` inside the island's `useState` initialiser and React
   * replaced the entire document with the error page — for every load, for the cookie's year.
   * A malformed escape is now what it always should have been: a value that is not a launch
   * locale code, indistinguishable from `zz`, so the visitor is treated as a first-time one and
   * their next explicit choice overwrites it (AC-12).
   */
  it.each([
    ["a lone percent", "fo_locale=%"],
    ["a truncated escape after a code", "fo_locale=en%"],
    ["a percent with non-hex digits", "fo_locale=%zz"],
    ["a truncated multi-byte escape", "fo_locale=%E0%A4%A"],
    ["a malformed value among valid cookies", "a=1; fo_locale=%; theme=dark"],
  ])("treats %s as a first visit rather than throwing", (_name, cookie) => {
    expect(() => readLocaleCookie(cookie)).not.toThrow();
    expect(readLocaleCookie(cookie)).toBeNull();

    expect(() =>
      decideSuggestion({ ...base, languages: ["de-DE"], cookie }),
    ).not.toThrow();
    expect(decideSuggestion({ ...base, languages: ["de-DE"], cookie })).toEqual(
      {
        show: true,
        source: "language",
        target: expect.objectContaining({ code: "de" }),
      },
    );
  });

  it("ignores a forged value among real cookies and does not write one on read", () => {
    const cookie = "other=1; fo_locale=../../etc/passwd; theme=dark";

    expect(decideSuggestion({ ...base, languages: ["de"], cookie }).show).toBe(
      true,
    );
  });

  it("reads the cookie out of a multi-cookie string", () => {
    expect(
      decideSuggestion({
        ...base,
        languages: ["de"],
        cookie: "a=1; fo_locale=pl; b=2",
      }),
    ).toEqual({ show: false, reason: "cookie" });
  });

  it("offers `en-gb` on `/en` to a British browser (the alias case)", () => {
    const decision = decideSuggestion({
      ...base,
      languages: ["en-GB", "en"],
      cookie: null,
    });

    expect(decision.show && decision.target.code).toBe("en-gb");
  });

  it("is pure: no cookie is produced by deciding", () => {
    const input = {
      ...base,
      languages: ["de-DE"],
      cookie: null,
    } as const;
    const first = decideSuggestion(input);
    const second = decideSuggestion(input);

    expect(first).toEqual(second);
  });
});

describe("countryFromHeaders (the one geo read ADR-0006 allows — §14 A14)", () => {
  it("reads Cloudflare's header in front of the Railway replica", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "DE" }))).toBe(
      "DE",
    );
  });

  it("falls back to Vercel's on the cold-standby platform (ADR-0018)", () => {
    expect(
      countryFromHeaders(new Headers({ "x-vercel-ip-country": "PL" })),
    ).toBe("PL");
  });

  it("prefers Cloudflare when both are present, in the declared order", () => {
    expect(GEO_COUNTRY_HEADERS).toEqual([
      "cf-ipcountry",
      "x-vercel-ip-country",
    ]);
    expect(
      countryFromHeaders(
        new Headers({ "cf-ipcountry": "DE", "x-vercel-ip-country": "US" }),
      ),
    ).toBe("DE");
  });

  it("uppercases and trims, because a header is not a promise", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": " gb " }))).toBe(
      "GB",
    );
  });

  it("answers `null` when there is no country to read", () => {
    expect(countryFromHeaders(new Headers())).toBeNull();
    for (const value of ["", "XX", "T1", "DEU", "D", "1", "??"]) {
      expect(
        countryFromHeaders(new Headers({ "cf-ipcountry": value })),
        value,
      ).toBeNull();
    }
  });

  it("reads nothing else off the request: no IP, no region, no city", () => {
    const headers = new Headers({
      "cf-ipcountry": "DE",
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "203.0.113.7",
      "x-vercel-ip-city": "Berlin",
    });

    expect(countryFromHeaders(headers)).toBe("DE");
  });
});

describe("the country pass (§14 A14: languages first, country second)", () => {
  const base = {
    urlLocale: "en",
    candidates: CANDIDATES,
    cookie: null,
  } as const;

  it("asks nothing of the country when the languages already answered", () => {
    // A German browser in Poland is offered German: a stated preference outranks an inference.
    const decision = decideSuggestion({
      ...base,
      languages: ["de-DE"],
      country: "PL",
    });

    expect(decision).toEqual({
      show: true,
      source: "language",
      target: expect.objectContaining({ code: "de" }),
    });
  });

  it("is silent when the languages match the URL, whatever the country says", () => {
    expect(
      decideSuggestion({ ...base, languages: ["en-US"], country: "DE" }),
    ).toEqual({ show: false, reason: "sameLocale" });
  });

  it.each([
    ["DE", "de"],
    ["AT", "de"],
    ["CH", "de"],
    ["PL", "pl"],
    ["GB", "en-gb"],
    ["IE", "en-gb"],
  ])(
    "offers %s's locale when the languages name none (a `fr` browser in %s)",
    (country, expected) => {
      const decision = decideSuggestion({
        ...base,
        languages: ["fr-FR", "fr"],
        country,
      });

      expect(decision).toEqual({
        show: true,
        source: "country",
        country,
        target: expect.objectContaining({ code: expected }),
      });
    },
  );

  it("offers English on a German page to a visitor in an unmapped country", () => {
    const decision = decideSuggestion({
      urlLocale: "de",
      candidates: CANDIDATES,
      cookie: null,
      languages: ["fr-FR"],
      country: "FR",
    });

    expect(decision).toEqual({
      show: true,
      source: "country",
      country: "FR",
      target: expect.objectContaining({ code: "en" }),
    });
  });

  it("stays silent on /en for an unmapped country, because `en` is already on screen", () => {
    expect(
      decideSuggestion({ ...base, languages: ["fr-FR"], country: "FR" }),
    ).toEqual({ show: false, reason: "sameLocale" });
  });

  it.each([null, undefined, "", "XX", "T1", "france"])(
    "stays silent when the country is %s — never falling back to English",
    (country) => {
      expect(
        decideSuggestion({ ...base, languages: ["fr-FR"], country }),
      ).toEqual({ show: false, reason: "noBetterLocale" });
    },
  );

  it("normalises the country it echoes back, so the copy lookup has one spelling", () => {
    const decision = decideSuggestion({
      ...base,
      languages: ["fr-FR"],
      country: " de ",
    });

    expect(decision.show && decision.country).toBe("DE");
  });

  it("never offers a country's locale to a visitor who already chose one", () => {
    expect(
      decideSuggestion({
        ...base,
        languages: ["fr-FR"],
        country: "DE",
        cookie: "fo_locale=en",
      }),
    ).toEqual({ show: false, reason: "cookie" });
  });
});

describe("what `hints.ts` may and may not read (§14 A14, ADR-0006)", () => {
  const source = readFileSync(
    resolve(repoRoot, "src/modules/i18n/hints.ts"),
    "utf8",
  );
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  // The browser and the request are still out of bounds: every function here is pure, which is
  // what makes the matrix above a unit test and what keeps the island's props the only input.
  for (const forbidden of [
    "headers()",
    "cookies()",
    "navigator",
    "document",
    "window",
    "redirect",
    "fetch(",
  ]) {
    it(`reads no \`${forbidden}\``, () => {
      expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase());
    });
  }

  /**
   * §14 A14 reversed the narrowing, and this is what replaced it: the country header may be read
   * **here and nowhere else**, which is the rule `fo/no-geo-redirect` enforces and this test
   * re-asserts over the shipped tree — including `src/app/api/geo/route.ts`, whose whole job is
   * to call this module rather than to name a header itself.
   */
  it("is the only file under `src/` that names a geo header", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const content = readFileSync(path, "utf8").toLowerCase();
        if (
          GEO_COUNTRY_HEADERS.some((header) => content.includes(header)) &&
          !path.endsWith("src/modules/i18n/hints.ts")
        ) {
          offenders.push(path.slice(repoRoot.length + 1));
        }
      }
    };
    walk(resolve(repoRoot, "src"));

    // `src/app/api/geo/route.ts` names the header in its `Vary`, which is a cache instruction and
    // not a read; nothing else may mention one at all.
    expect(offenders).toEqual(["src/app/api/geo/route.ts"]);
  });

  it("writes the cookie attributes of §13 Q4 and nothing else", () => {
    expect(serialiseLocaleCookie("de", { secure: true })).toBe(
      "fo_locale=de; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });
});
