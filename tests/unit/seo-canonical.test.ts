/**
 * T-11, unit half — the canonical builder (spec 007 §6 "Canonical", AC-10; `plan/02` §7, §8;
 * TASK-090).
 *
 * `plan/02` §7 fixes four properties — absolute, lowercase, trailing-slash-free, parameter-free —
 * and one prohibition: never cross-locale. Each is asserted on inputs that would break it
 * (uppercase segments, a trailing slash, a query string, a fragment, a doubled slash, UTM
 * parameters), because a builder that is only exercised on already-canonical paths proves nothing:
 * the canonical must be **the same string** whichever form of the URL was requested, since it is
 * also what the sitemap and the hreflang cluster print (`plan/02` §8).
 *
 * AC-10's "a page that is `noindex` emits its canonical unchanged" is a property of the caller,
 * not of this function: the builder takes no directive, so it cannot vary by one. That is asserted
 * here as a type-level fact (the signature) and observed end to end in the parked e2e half,
 * `tests/e2e/seo-canonical.spec.ts`, once TASK-091 ships a route.
 */
import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  canonicalFor,
  canonicalPath,
  siteOrigin,
} from "../../src/modules/seo/index.ts";

const SITE = { baseUrl: "https://flowersoverseas.com" } as const;
const CORRIDOR = "/en-gb/send-flowers-to/poland";

describe("canonicalPath(): lowercase, no query, no trailing slash (plan/02 §7)", () => {
  const cases: readonly [input: string, expected: string][] = [
    [CORRIDOR, CORRIDOR],
    ["/EN-GB/Send-Flowers-To/Poland", CORRIDOR],
    [`${CORRIDOR}/`, CORRIDOR],
    [`${CORRIDOR}///`, CORRIDOR],
    [`${CORRIDOR}?utm_source=newsletter&gclid=abc`, CORRIDOR],
    [`${CORRIDOR}#faq`, CORRIDOR],
    [`${CORRIDOR}/?colour=red#top`, CORRIDOR],
    ["/en-gb//send-flowers-to//poland", CORRIDOR],
    ["en-gb/send-flowers-to/poland", CORRIDOR],
    ["/en", "/en"],
    ["/en/", "/en"],
    ["/", "/"],
    ["", "/"],
  ];

  for (const [input, expected] of cases) {
    it(`\`${input}\` -> \`${expected}\``, () => {
      expect(canonicalPath(input)).toBe(expected);
    });
  }

  it("is idempotent", () => {
    for (const [input] of cases) {
      const once = canonicalPath(input);
      expect(canonicalPath(once)).toBe(once);
    }
  });
});

describe("absoluteUrl(): absolute, on the site origin (plan/02 §7)", () => {
  it("prefixes the origin of the base URL", () => {
    expect(absoluteUrl(CORRIDOR, SITE)).toBe(
      `https://flowersoverseas.com${CORRIDOR}`,
    );
  });

  it("ignores a path, a query or a trailing slash on the base URL", () => {
    for (const baseUrl of [
      "https://flowersoverseas.com/",
      "https://flowersoverseas.com/ignored?x=1",
    ]) {
      expect(absoluteUrl(CORRIDOR, { baseUrl })).toBe(
        `https://flowersoverseas.com${CORRIDOR}`,
      );
    }
  });

  it("keeps the development origin as it is (a canonical there is inert)", () => {
    expect(absoluteUrl("/en", { baseUrl: "http://localhost:3000" })).toBe(
      "http://localhost:3000/en",
    );
  });

  it("refuses a base URL that is not absolute", () => {
    expect(() => siteOrigin("flowersoverseas.com")).toThrow(TypeError);
    expect(() => absoluteUrl("/en", { baseUrl: "" })).toThrow(/absolute/);
  });
});

describe("canonicalFor(): self-referencing, never cross-locale (AC-10)", () => {
  it("returns the page's own absolute URL", () => {
    expect(canonicalFor("en-gb", CORRIDOR, SITE)).toBe(
      `https://flowersoverseas.com${CORRIDOR}`,
    );
    expect(canonicalFor("pl", "/pl/wyslij-kwiaty/polska", SITE)).toBe(
      "https://flowersoverseas.com/pl/wyslij-kwiaty/polska",
    );
  });

  it("normalises the request form to the one canonical string", () => {
    const expected = `https://flowersoverseas.com${CORRIDOR}`;
    for (const requested of [
      `${CORRIDOR}/`,
      "/EN-GB/Send-Flowers-To/Poland",
      `${CORRIDOR}?page=1&utm_medium=email`,
    ]) {
      expect(canonicalFor("en-gb", requested, SITE)).toBe(expected);
    }
  });

  it("accepts the locale home", () => {
    expect(canonicalFor("de", "/de", SITE)).toBe(
      "https://flowersoverseas.com/de",
    );
  });

  it("throws on a cross-locale canonical (plan/02 §7)", () => {
    expect(() => canonicalFor("de", CORRIDOR, SITE)).toThrow(
      /cross-locale canonical refused/,
    );
    // The near miss that a string prefix test would let through: `en` is not `en-gb`.
    expect(() => canonicalFor("en", CORRIDOR, SITE)).toThrow(TypeError);
    // And a path with no locale segment at all.
    expect(() => canonicalFor("en", "/send-flowers-to/poland", SITE)).toThrow(
      TypeError,
    );
  });

  it("matches the locale case-insensitively rather than emitting an uppercase URL", () => {
    expect(canonicalFor("EN-GB", "/EN-GB/send-flowers-to/poland", SITE)).toBe(
      `https://flowersoverseas.com${CORRIDOR}`,
    );
  });
});
