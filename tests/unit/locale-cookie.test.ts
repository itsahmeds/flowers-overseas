/**
 * T-12 (unit half) / AC-12 (TASK-041): `LocaleCookieSchema`, the `fo_locale` reader and the
 * attribute set of §13 Q4.
 *
 * AC-12's browser half — zero `Set-Cookie` on `/` and `/en`, and the attributes as the browser
 * stores them after a click — is `tests/e2e/banner.spec.ts`. What is provable here is stronger
 * than a browser can show: that the *only* values the cookie can carry are locale codes the
 * application offers, that everything else is ignored rather than repaired, and that reading a
 * cookie never produces one (§8 — the cookie is written only on an explicit user action).
 */
import { describe, expect, it } from "vitest";

import {
  FO_LOCALE_COOKIE,
  FO_LOCALE_MAX_AGE,
  readLocaleCookie,
  serialiseLocaleCookie,
} from "../../src/modules/i18n/hints.ts";
import { launchLocaleCodes } from "../../src/modules/i18n/routing.ts";
import { LocaleCookieSchema } from "../../src/modules/i18n/schemas.ts";

describe("LocaleCookieSchema (AC-12)", () => {
  it("is exactly the launch locale set, so the config and the cookie cannot drift", () => {
    expect([...LocaleCookieSchema.options].sort()).toEqual(
      [...launchLocaleCodes()].sort(),
    );
  });

  for (const code of launchLocaleCodes()) {
    it(`accepts \`${code}\``, () => {
      expect(LocaleCookieSchema.parse(code)).toBe(code);
    });
  }

  for (const [name, value] of [
    ["a forged code", "zz"],
    ["a retired locale", "fr"],
    ["a mis-cased launch code", "EN"],
    ["a mis-cased regional code", "en-GB"],
    ["an underscore form", "en_gb"],
    ["a padded value", " de "],
    ["an empty value", ""],
    ["a traversal attempt", "../../etc/passwd"],
    ["a script payload", "<script>alert(1)</script>"],
    ["a comma-joined pair", "de,en"],
  ] as const) {
    it(`rejects ${name}`, () => {
      expect(LocaleCookieSchema.safeParse(value).success).toBe(false);
    });
  }

  it("rejects every non-string, including the ones a JSON body could carry", () => {
    for (const value of [null, undefined, 1, true, ["de"], { code: "de" }]) {
      expect(LocaleCookieSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("readLocaleCookie", () => {
  it("is `null` when there is no cookie at all", () => {
    expect(readLocaleCookie(null)).toBeNull();
    expect(readLocaleCookie("")).toBeNull();
  });

  it("finds the value wherever it sits in the string", () => {
    expect(readLocaleCookie("fo_locale=de")).toBe("de");
    expect(readLocaleCookie("a=1; fo_locale=pl; b=2")).toBe("pl");
    expect(readLocaleCookie("a=1;fo_locale=en-gb")).toBe("en-gb");
    expect(readLocaleCookie("a=1; fo_locale = en ; b=2")).toBe("en");
  });

  /**
   * `/review 23`'s blocker. The reader used to `decodeURIComponent()` the value, which throws
   * `URIError` on a lone or truncated escape — and it is called from the island's `useState`
   * initialiser, so the throw became a first-render error with no boundary above it and React
   * replaced the whole document with the error page. A one-character cookie any script or
   * extension can set therefore broke every page for the 365 days the cookie lives.
   *
   * The value is now matched raw: the enum is `a-z` and `-`, nothing percent-encoding touches,
   * and the only writer is `serialiseLocaleCookie`. A percent-escape is consequently just
   * another value that is not a launch locale code — ignored exactly like `zz`, never decoded
   * and never thrown on. These cases are assertions about *not throwing* first and about the
   * `null` second, which is why each is wrapped rather than compared directly.
   */
  it("never throws on a malformed percent-escape (site-wide client DoS)", () => {
    for (const cookie of [
      "fo_locale=%",
      "fo_locale=en%",
      "fo_locale=%zz",
      "fo_locale=%E0%A4%A",
      "fo_locale=%%",
      "fo_locale=de%",
    ]) {
      expect(() => readLocaleCookie(cookie), cookie).not.toThrow();
      expect(readLocaleCookie(cookie), cookie).toBeNull();
    }
  });

  it("ignores a malformed escape sitting among valid cookies", () => {
    expect(readLocaleCookie("a=1; fo_locale=%; b=2")).toBeNull();
    expect(readLocaleCookie("consent=1; fo_locale=en%; theme=dark")).toBeNull();
  });

  it("does not decode a percent-encoded value: it is not a launch code", () => {
    expect(readLocaleCookie("fo_locale=en%2Dgb")).toBeNull();
  });

  it("ignores a forged value instead of repairing or clearing it (AC-12)", () => {
    for (const cookie of [
      "fo_locale=zz",
      "fo_locale=EN",
      "fo_locale=",
      "fo_locale",
      "fo_locale=<script>",
      "fo_locale=de,pl",
    ]) {
      expect(readLocaleCookie(cookie), cookie).toBeNull();
    }
  });

  it("does not match a cookie whose name merely contains `fo_locale`", () => {
    expect(readLocaleCookie("x_fo_locale=de; fo_locale_old=pl")).toBeNull();
  });

  it("takes the first valid `fo_locale` when a string carries two", () => {
    expect(readLocaleCookie("fo_locale=de; fo_locale=pl")).toBe("de");
  });
});

describe("serialiseLocaleCookie (§13 Q4 attributes)", () => {
  it("writes `Path=/`, 365 days, `SameSite=Lax` and `Secure` on https", () => {
    expect(serialiseLocaleCookie("pl", { secure: true })).toBe(
      "fo_locale=pl; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });

  it("omits `Secure` in development, where the origin is http://localhost", () => {
    expect(serialiseLocaleCookie("pl", { secure: false })).toBe(
      "fo_locale=pl; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });

  it("never writes `HttpOnly`: the island owns the cookie (§2)", () => {
    expect(serialiseLocaleCookie("de", { secure: true })).not.toContain(
      "HttpOnly",
    );
  });

  it("never writes `Domain` or `Expires`, so the cookie stays first-party and rolling", () => {
    const cookie = serialiseLocaleCookie("de", { secure: true });

    expect(cookie).not.toContain("Domain");
    expect(cookie).not.toContain("Expires");
  });

  it("keeps the 365-day lifetime of `plan/03` §1 rather than an analytics lifetime", () => {
    expect(FO_LOCALE_MAX_AGE).toBe(365 * 24 * 60 * 60);
    expect(FO_LOCALE_COOKIE).toBe("fo_locale");
  });

  it("refuses to serialise anything that is not a launch locale", () => {
    expect(() => serialiseLocaleCookie("zz", { secure: true })).toThrow();
    expect(() => serialiseLocaleCookie("EN", { secure: true })).toThrow();
  });

  it("round-trips through the reader for every launch locale", () => {
    for (const code of launchLocaleCodes()) {
      const [pair] = serialiseLocaleCookie(code, { secure: true }).split("; ");
      expect(readLocaleCookie(pair ?? "")).toBe(code);
    }
  });
});
