/**
 * `localePath`, `parseLocaleFromPath` and `isLaunchLocale` (TASK-034: the routing half of AC-6 and
 * AC-8, and the builder half of AC-13 whose `i18n:check` counterpart lands in TASK-040).
 *
 * The failure cases are the point: an uppercase or unknown locale is not "normalised", it is
 * rejected — because `/EN` must 404 rather than serve a duplicate of `/en` (spec 003 §6
 * "Canonical"), and a hand-shaped trailing segment must not be able to produce a URL the canonical
 * rule would reject.
 */
import { describe, expect, it } from "vitest";

import {
  isLaunchLocale,
  launchLocale,
  launchLocaleCodes,
  localePath,
  parseLocaleFromPath,
} from "../../src/modules/i18n";

describe("isLaunchLocale (AC-8)", () => {
  it("accepts exactly the configured launch codes", () => {
    for (const code of ["en", "en-gb", "de", "pl"]) {
      expect(isLaunchLocale(code), code).toBe(true);
    }
  });

  it("rejects unknown, mis-cased and empty segments without case folding", () => {
    for (const code of ["fr", "xx", "EN", "En", "en-GB", "nope", "", "de/"]) {
      expect(isLaunchLocale(code), code).toBe(false);
    }
    expect(isLaunchLocale(undefined)).toBe(false);
  });

  it("returns the config for a launch locale and undefined otherwise", () => {
    expect(launchLocale("de")?.bcp47).toBe("de");
    expect(launchLocale("fr")).toBeUndefined();
    expect(launchLocaleCodes()).toEqual(["en", "en-gb", "de", "pl"]);
  });
});

describe("localePath (AC-13)", () => {
  it("builds the locale root", () => {
    expect(localePath("en", "home")).toBe("/en");
    expect(localePath("pl", "home")).toBe("/pl");
  });

  it("uses the locale's own path segment for a page type, never another locale's", () => {
    expect(localePath("en", "destinations")).toBe("/en/send-flowers-to");
    expect(localePath("de", "destinations")).toBe("/de/blumen-verschicken");
    expect(localePath("pl", "destinations")).toBe("/pl/wyslij-kwiaty");
    expect(localePath("de", "legal")).toBe("/de/rechtliches");
    expect(localePath("pl", "occasions")).toBe("/pl/okazje");
  });

  it("appends leaf slugs with no trailing slash", () => {
    expect(localePath("en", "destinations", "poland")).toBe(
      "/en/send-flowers-to/poland",
    );
    expect(localePath("de", "product", "rote-rosen")).toBe(
      "/de/produkt/rote-rosen",
    );
  });

  it("throws on an unknown locale rather than emitting a guessed URL", () => {
    expect(() => localePath("fr", "home")).toThrow(/unknown locale code: fr/);
    expect(() => localePath("EN", "home")).toThrow(/unknown locale code: EN/);
  });

  it("throws on a segment that is not lowercase, ASCII, hyphen-separated and slash-free", () => {
    for (const segment of [
      "Poland",
      "pol/and",
      "poland/",
      "polska ",
      "",
      "łódź",
    ]) {
      expect(() => localePath("en", "destinations", segment), segment).toThrow(
        /must be lowercase ASCII/,
      );
    }
  });
});

describe("parseLocaleFromPath (spec 003 §11)", () => {
  it("splits a localised path into its prefix and the rest", () => {
    expect(parseLocaleFromPath("/en")).toEqual({ locale: "en", rest: "/" });
    expect(parseLocaleFromPath("/en/")).toEqual({ locale: "en", rest: "/" });
    expect(parseLocaleFromPath("/en-gb/send-flowers-to/poland")).toEqual({
      locale: "en-gb",
      rest: "/send-flowers-to/poland",
    });
  });

  it("reports no locale for a path that carries none, and never guesses one", () => {
    for (const path of [
      "/",
      "/robots.txt",
      "/api/health",
      "/nope",
      "/EN",
      "/fr/x",
    ]) {
      expect(parseLocaleFromPath(path).locale, path).toBeUndefined();
    }
    expect(parseLocaleFromPath("/nope").rest).toBe("/nope");
  });

  it("ignores a query string, so no query value can reach a log line", () => {
    expect(parseLocaleFromPath("/de/x?email=a@b.c")).toEqual({
      locale: "de",
      rest: "/x",
    });
  });
});
