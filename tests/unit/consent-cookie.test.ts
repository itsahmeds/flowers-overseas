/**
 * T-21 (the cookie value half) / AC-19 (TASK-051): `fo_consent` read and written.
 *
 * The reader is the interesting half. Spec 003 `/review 23` found a cookie reader that threw
 * `URIError` on a malformed percent-escape, inside a Client Component's first render, which
 * replaces the whole document with the error page — so every hostile value below is asserted to
 * produce `null` rather than an exception, and `null` is what the island shows the banner for.
 */
import { describe, expect, it } from "vitest";

import {
  CONSENT_ACCEPT_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_REJECT_MAX_AGE_SECONDS,
} from "../../src/config/cookies";
import { CONSENT_POLICY_VERSION } from "../../src/lib/consent";
import {
  choicesOf,
  clearConsentCookie,
  parseConsentCookie,
  rawCookieValue,
  serialiseConsentCookie,
  type StoredConsent,
} from "../../src/modules/ui/consent/consentCookie";

const NAME = CONSENT_COOKIE_NAME;
const OPTIONS = { name: NAME, policyVersion: CONSENT_POLICY_VERSION };
const CID = "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e";

const decision: StoredConsent = {
  v: CONSENT_POLICY_VERSION,
  a: true,
  m: false,
  ts: "2026-09-09T10:00:00.000Z",
  cid: CID,
};

function cookieHeader(value: string): string {
  return `fo_locale=de; ${NAME}=${value}; other=1`;
}

describe("rawCookieValue", () => {
  it("finds the value among other cookies, and answers null when absent", () => {
    expect(rawCookieValue(cookieHeader("x"), NAME)).toBe("x");
    expect(rawCookieValue("fo_locale=de", NAME)).toBeNull();
    expect(rawCookieValue(null, NAME)).toBeNull();
  });

  it("does not match a cookie whose name merely contains ours", () => {
    expect(rawCookieValue(`not_${NAME}=x`, NAME)).toBeNull();
  });
});

describe("parseConsentCookie (round trip)", () => {
  it("reads back exactly what `serialiseConsentCookie` wrote", () => {
    const written = serialiseConsentCookie(decision, {
      name: NAME,
      maxAgeSeconds: CONSENT_ACCEPT_MAX_AGE_SECONDS,
      secure: true,
    });
    const value = written.split(";")[0]?.split("=").slice(1).join("=") ?? "";
    expect(parseConsentCookie(`${NAME}=${value}`, OPTIONS)).toEqual(decision);
  });

  it("projects the two category answers", () => {
    expect(choicesOf(decision)).toEqual({ analytics: true, marketing: false });
  });
});

describe("parseConsentCookie fails closed", () => {
  const refused: readonly (readonly [string, string])[] = [
    ["no cookie at all", ""],
    ["an empty value", ""],
    ["a malformed percent-escape (`/review 23`)", "%"],
    ["a truncated escape", "%7B%22v%22%3A"],
    ["not JSON", "hello"],
    ["a JSON string", encodeURIComponent('"granted"')],
    ["a JSON array", encodeURIComponent("[true,true]")],
    ["JSON null", encodeURIComponent("null")],
    ["a missing field", encodeURIComponent('{"v":1,"a":true,"m":false}')],
    [
      "a forged category (string, not boolean)",
      encodeURIComponent(
        `{"v":1,"a":"yes","m":false,"ts":"2026-09-09T10:00:00.000Z","cid":"${CID}"}`,
      ),
    ],
    [
      "a cid that is not a uuid",
      encodeURIComponent(
        '{"v":1,"a":true,"m":true,"ts":"2026-09-09T10:00:00.000Z","cid":"cid-1"}',
      ),
    ],
    [
      "an empty timestamp",
      encodeURIComponent(`{"v":1,"a":true,"m":true,"ts":"","cid":"${CID}"}`),
    ],
    [
      "a non-integer policy version",
      encodeURIComponent(
        `{"v":1.5,"a":true,"m":true,"ts":"2026-09-09T10:00:00.000Z","cid":"${CID}"}`,
      ),
    ],
    [
      "a stale policy version",
      encodeURIComponent(
        `{"v":${CONSENT_POLICY_VERSION + 1},"a":true,"m":true,"ts":"2026-09-09T10:00:00.000Z","cid":"${CID}"}`,
      ),
    ],
  ];

  for (const [label, value] of refused) {
    it(`treats ${label} as no consent, without throwing`, () => {
      const header = value === "" ? "fo_locale=de" : cookieHeader(value);
      expect(() => parseConsentCookie(header, OPTIONS)).not.toThrow();
      expect(parseConsentCookie(header, OPTIONS)).toBeNull();
    });
  }

  it("accepts a value that is not percent-encoded at all", () => {
    // Belt and braces: a hand-set cookie with literal JSON is still readable, because a value we
    // *can* honour must not be discarded on a formatting technicality.
    const raw = `{"v":${CONSENT_POLICY_VERSION},"a":false,"m":false,"ts":"2026-09-09T10:00:00.000Z","cid":"${CID}"}`;
    expect(parseConsentCookie(cookieHeader(raw), OPTIONS)?.cid).toBe(CID);
  });
});

describe("serialiseConsentCookie (the attribute set of the TASK-051 row)", () => {
  it("is first-party, path-wide, Lax, not HttpOnly, and Secure outside development", () => {
    const written = serialiseConsentCookie(decision, {
      name: NAME,
      maxAgeSeconds: CONSENT_ACCEPT_MAX_AGE_SECONDS,
      secure: true,
    });
    const attributes = written.split("; ");
    expect(attributes).toContain("Path=/");
    expect(attributes).toContain("SameSite=Lax");
    expect(attributes).toContain("Secure");
    expect(attributes).toContain(`Max-Age=${CONSENT_ACCEPT_MAX_AGE_SECONDS}`);
    expect(written).not.toContain("HttpOnly");
    expect(written).not.toContain("Domain=");
  });

  it("omits Secure on http (a development origin would drop the cookie)", () => {
    expect(
      serialiseConsentCookie(decision, {
        name: NAME,
        maxAgeSeconds: CONSENT_REJECT_MAX_AGE_SECONDS,
        secure: false,
      }),
    ).not.toContain("Secure");
  });

  it("carries the register's asymmetric lifetimes and nothing else", () => {
    // 12 months on accept, 6 on reject — the numbers come from the register, so this asserts the
    // relationship (§8) rather than restating two constants.
    expect(CONSENT_REJECT_MAX_AGE_SECONDS).toBeLessThan(
      CONSENT_ACCEPT_MAX_AGE_SECONDS,
    );
    expect(CONSENT_ACCEPT_MAX_AGE_SECONDS).toBe(365 * 86_400);
    expect(CONSENT_REJECT_MAX_AGE_SECONDS).toBe(183 * 86_400);
  });

  it("percent-encodes the value, so a JSON separator cannot end the cookie", () => {
    const written = serialiseConsentCookie(decision, {
      name: NAME,
      maxAgeSeconds: 60,
      secure: false,
    });
    const value = written.slice(`${NAME}=`.length, written.indexOf(";"));
    expect(value).not.toContain(";");
    expect(value).not.toContain(",");
    expect(value).not.toContain('"');
  });
});

describe("clearConsentCookie", () => {
  it("expires the value immediately and stores nothing in its place", () => {
    const written = clearConsentCookie({ name: NAME, secure: true });
    expect(written.startsWith(`${NAME}=;`)).toBe(true);
    expect(written).toContain("Max-Age=0");
    expect(written).toContain("Path=/");
    expect(parseConsentCookie(`${NAME}=`, OPTIONS)).toBeNull();
  });
});
