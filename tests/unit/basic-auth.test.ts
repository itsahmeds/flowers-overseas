/**
 * The non-production access gate (spec 040 §5.3, §5.6, AC-25 / T-26; TASK-098).
 *
 * T-26 is an e2e case against a running deployment (`tests/e2e/staging-auth.spec.ts`); this file
 * is the same truth table on the pure decision function, which is the only place where every
 * environment can be exercised without a deploy.
 */
import { describe, expect, it } from "vitest";

import {
  AUTH_EXEMPT_PATHS,
  BASIC_AUTH_CHALLENGE,
  BASIC_AUTH_CHALLENGE_HEADERS,
  STAGING_BASIC_AUTH_KEY,
  basicAuthDecision,
  isAuthExempt,
  parseCredential,
} from "../../src/lib/basic-auth";

const CREDENTIAL = "florist:sekret-passphrase";
const HEADER = `Basic ${Buffer.from(CREDENTIAL).toString("base64")}`;

const decide = (
  overrides: Partial<Parameters<typeof basicAuthDecision>[0]> = {},
): string =>
  basicAuthDecision({
    environment: "staging",
    credential: CREDENTIAL,
    pathname: "/en",
    authorization: null,
    ...overrides,
  });

describe("parseCredential", () => {
  it("treats absent and blank as absent, which is the off switch (§12)", () => {
    expect(parseCredential(undefined).kind).toBe("absent");
    expect(parseCredential("").kind).toBe("absent");
    expect(parseCredential("   ").kind).toBe("absent");
  });

  it("accepts user:password and trims surrounding whitespace", () => {
    const parsed = parseCredential(`  ${CREDENTIAL}  `);
    expect(parsed).toEqual({ kind: "configured", value: CREDENTIAL });
  });

  it("rejects a malformed value rather than half-configuring the gate", () => {
    for (const raw of ["nocolon", ":password", "user:", "user name:pw"]) {
      expect(parseCredential(raw).kind, raw).toBe("invalid");
    }
  });

  it("names the variable it reads", () => {
    expect(STAGING_BASIC_AUTH_KEY).toBe("STAGING_BASIC_AUTH");
  });
});

describe("isAuthExempt (AC-25, AC-31)", () => {
  it("exempts /api/health, with or without a trailing slash", () => {
    expect(AUTH_EXEMPT_PATHS).toEqual(["/api/health"]);
    expect(isAuthExempt("/api/health")).toBe(true);
    expect(isAuthExempt("/api/health/")).toBe(true);
  });

  it("exempts nothing else — not a locale home, not another API route", () => {
    for (const path of [
      "/",
      "/en",
      "/de/flowers",
      "/api/csp-report",
      "/api/health/../en",
      "/robots.txt",
    ]) {
      expect(isAuthExempt(path), path).toBe(false);
    }
  });
});

describe("basicAuthDecision (AC-25)", () => {
  it("never gates production, credential or not", () => {
    expect(decide({ environment: "production" })).toBe("allow");
    expect(decide({ environment: "production", credential: undefined })).toBe(
      "allow",
    );
  });

  it("gates staging, preview, development and test when a credential is set", () => {
    for (const environment of [
      "staging",
      "preview",
      "development",
      "test",
    ] as const) {
      expect(decide({ environment }), environment).toBe("challenge");
    }
  });

  it("allows everything when the variable is absent (absent means off)", () => {
    for (const credential of [undefined, ""]) {
      expect(decide({ credential }), String(credential)).toBe("allow");
    }
  });

  it("allows /api/health unauthenticated in every non-production environment", () => {
    for (const environment of ["staging", "preview", "development"] as const) {
      expect(
        decide({ environment, pathname: "/api/health" }),
        environment,
      ).toBe("allow");
    }
  });

  it("allows the request that carries the credential", () => {
    expect(decide({ authorization: HEADER })).toBe("allow");
  });

  it("challenges a wrong, truncated or differently encoded credential", () => {
    const wrong = `Basic ${Buffer.from("florist:wrong").toString("base64")}`;
    const truncated = `Basic ${Buffer.from("florist:sekret-passphras").toString("base64")}`;
    for (const authorization of [
      wrong,
      truncated,
      "Basic not-base64!!",
      `Bearer ${Buffer.from(CREDENTIAL).toString("base64")}`,
      "Basic",
      "",
    ]) {
      expect(decide({ authorization }), authorization).toBe("challenge");
    }
  });

  it("fails closed on a malformed credential: no request can satisfy it", () => {
    expect(decide({ credential: "nocolon", authorization: HEADER })).toBe(
      "challenge",
    );
    // …but the health check still answers, or the service would never go live.
    expect(decide({ credential: "nocolon", pathname: "/api/health" })).toBe(
      "allow",
    );
  });
});

describe("the challenge response headers", () => {
  it("carries WWW-Authenticate so the browser prompts, and is never cached or indexed", () => {
    expect(BASIC_AUTH_CHALLENGE_HEADERS["www-authenticate"]).toBe(
      BASIC_AUTH_CHALLENGE,
    );
    expect(BASIC_AUTH_CHALLENGE).toMatch(/^Basic realm="/u);
    expect(BASIC_AUTH_CHALLENGE_HEADERS["cache-control"]).toBe("no-store");
    expect(BASIC_AUTH_CHALLENGE_HEADERS["x-robots-tag"]).toBe("noindex");
  });
});
