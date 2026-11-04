/**
 * T-02, header half (spec 013 §5.4, AC-2 as ruled 2026-11-04, option (a); TASK-262): the
 * checkout steps page carries step 3's policy when both Stripe keys are configured, and nothing
 * else changes. The policy value itself is `tests/unit/pay-step-csp.test.ts`'s.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STRIPE_KEY_NAMES,
  checkoutCspHeaders,
  isCheckoutStepsPath,
  stripeKeysConfigured,
} from "../../src/lib/checkout-csp";
import { consentBootstrapHash } from "../../src/lib/consent-bootstrap";
import {
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  payStepCspValue,
} from "../../src/lib/csp";
import {
  appEnvironment,
  ga4MeasurementId,
  hostPlatform,
} from "../../src/lib/env.schema";
import { proxy } from "../../src/proxy";

const NONCE = "AAECAwQFBgcICQoLDA0ODw==";
const KEYS = {
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
} as const;

/** What `next.config.ts` passes for production on Railway with no GA4 id, plus the nonce. */
const PRODUCTION_PAY_POLICY = payStepCspValue("production", {
  nonce: NONCE,
  inlineHashes: [consentBootstrapHash()],
  ga4: false,
  platform: "railway",
});

const PRODUCTION_RAILWAY = {
  APP_ENV: "production",
  RAILWAY_ENVIRONMENT_NAME: "production",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function quietProxy(url: string, headers: Record<string, string> = {}) {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const response = proxy(new NextRequest(new Request(url, { headers })));
  vi.restoreAllMocks();
  return response;
}

/** The request header names the proxy hands downstream (Next's override list). */
function overriddenNames(response: Response): string[] {
  return (response.headers.get("x-middleware-override-headers") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

function stubKeys(): void {
  for (const [name, value] of Object.entries(KEYS)) vi.stubEnv(name, value);
}

describe("the key test (wiring.ts's own: both keys, non-empty)", () => {
  it("is true only with both keys present and non-empty", () => {
    expect(STRIPE_KEY_NAMES).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_PUBLISHABLE_KEY",
    ]);
    expect(stripeKeysConfigured(KEYS)).toBe(true);
    expect(stripeKeysConfigured({})).toBe(false);
    expect(stripeKeysConfigured({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe(
      false,
    );
    expect(stripeKeysConfigured({ STRIPE_PUBLISHABLE_KEY: "pk_test_x" })).toBe(
      false,
    );
    expect(stripeKeysConfigured({ ...KEYS, STRIPE_SECRET_KEY: "" })).toBe(
      false,
    );
    expect(stripeKeysConfigured({ ...KEYS, STRIPE_PUBLISHABLE_KEY: "" })).toBe(
      false,
    );
  });
});

describe("the path (the checkout steps page and nothing else)", () => {
  it("matches /{launch locale}/checkout exactly", () => {
    for (const path of ["/en/checkout", "/de/checkout", "/pl/checkout"]) {
      expect(isCheckoutStepsPath(path), path).toBe(true);
    }
  });

  it("matches no other path, including the confirmation and the return route", () => {
    for (const path of [
      "/",
      "/en",
      "/checkout",
      "/xx/checkout",
      "/en/checkout/",
      "/en/checkout/done",
      "/en/checkout/return",
      "/en/basket",
      "/en/checkoutx",
      "/en/flowers/checkout",
      "/api/checkout/start",
    ]) {
      expect(isCheckoutStepsPath(path), path).toBe(false);
      expect(checkoutCspHeaders(path, KEYS), path).toBeNull();
    }
  });
});

describe("checkoutCspHeaders", () => {
  it("is null on the steps page without both keys: today's policy stays", () => {
    expect(checkoutCspHeaders("/en/checkout", {})).toBeNull();
    expect(
      checkoutCspHeaders("/en/checkout", { STRIPE_SECRET_KEY: "sk_live_x" }),
    ).toBeNull();
  });

  it("sends the pay-step policy as Report-Only, and only that, while the deployment reports", () => {
    const headers = checkoutCspHeaders(
      "/en/checkout",
      { ...KEYS, ...PRODUCTION_RAILWAY },
      () => NONCE,
    );
    expect(headers).toEqual([
      { key: CSP_REPORT_ONLY_HEADER, value: PRODUCTION_PAY_POLICY },
    ]);
  });

  it("adds the enforcing header, same value, only under CSP_REPORT_ONLY=false", () => {
    const headers = checkoutCspHeaders(
      "/en/checkout",
      { ...KEYS, ...PRODUCTION_RAILWAY, CSP_REPORT_ONLY: "false" },
      () => NONCE,
    );
    expect(headers).toEqual([
      { key: CSP_REPORT_ONLY_HEADER, value: PRODUCTION_PAY_POLICY },
      { key: CSP_HEADER, value: PRODUCTION_PAY_POLICY },
    ]);
    for (const value of ["true", "False", "0", ""]) {
      const reported = checkoutCspHeaders(
        "/en/checkout",
        { ...KEYS, ...PRODUCTION_RAILWAY, CSP_REPORT_ONLY: value },
        () => NONCE,
      );
      expect(
        reported?.map((header) => header.key),
        value,
      ).toEqual([CSP_REPORT_ONLY_HEADER]);
    }
  });

  it("draws a fresh nonce on every call", () => {
    const first = checkoutCspHeaders("/en/checkout", KEYS)?.[0]?.value ?? "";
    const second = checkoutCspHeaders("/en/checkout", KEYS)?.[0]?.value ?? "";
    const nonceOf = (value: string) => /'nonce-([^']+)'/u.exec(value)?.[1];
    expect(nonceOf(first)).toBeDefined();
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });
});

describe("the proxy", () => {
  it("puts the policy on the response and on the request of the steps page, with both keys", () => {
    stubKeys();
    const response = quietProxy("https://example.com/en/checkout?step=review");
    const value = response.headers.get(CSP_REPORT_ONLY_HEADER) ?? "";
    expect(value).toBe(
      payStepCspValue(appEnvironment(process.env), {
        nonce: /'nonce-([^']+)'/u.exec(value)?.[1] ?? "missing",
        inlineHashes: [consentBootstrapHash()],
        ga4: ga4MeasurementId(process.env) !== undefined,
        platform: hostPlatform(process.env),
      }),
    );
    expect(response.headers.get(CSP_HEADER)).toBeNull();
    expect(overriddenNames(response)).toContain(
      CSP_REPORT_ONLY_HEADER.toLowerCase(),
    );
    expect(
      response.headers.get(
        `x-middleware-request-${CSP_REPORT_ONLY_HEADER.toLowerCase()}`,
      ),
    ).toBe(value);
  });

  it("enforces under CSP_REPORT_ONLY=false, the same value on both names", () => {
    stubKeys();
    vi.stubEnv("CSP_REPORT_ONLY", "false");
    const response = quietProxy("https://example.com/de/checkout");
    const enforced = response.headers.get(CSP_HEADER);
    expect(enforced).toMatch(/'nonce-[A-Za-z0-9+/]{22}==' 'strict-dynamic'/u);
    expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toBe(enforced);
    expect(
      response.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`),
    ).toBe(enforced);
  });

  it("drops a client-sent CSP request header, so Next can only read our nonce", () => {
    stubKeys();
    const response = quietProxy("https://example.com/en/checkout", {
      [CSP_HEADER]: "script-src 'nonce-attackerattackerattack=='",
    });
    expect(overriddenNames(response)).not.toContain(CSP_HEADER.toLowerCase());
    expect(
      response.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`),
    ).toBeNull();
  });

  it("gives two requests two nonces", () => {
    stubKeys();
    const first = quietProxy("https://example.com/en/checkout").headers.get(
      CSP_REPORT_ONLY_HEADER,
    );
    const second = quietProxy("https://example.com/en/checkout").headers.get(
      CSP_REPORT_ONLY_HEADER,
    );
    expect(first).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it("sets no CSP on the steps page without both keys", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "");
    const response = quietProxy("https://example.com/en/checkout");
    expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toBeNull();
    expect(response.headers.get(CSP_HEADER)).toBeNull();
    expect(overriddenNames(response).join(",")).not.toMatch(
      /content-security-policy/u,
    );
  });

  it("sets no CSP on any other path, with both keys", () => {
    stubKeys();
    for (const path of [
      "/",
      "/en",
      "/en/checkout/done",
      "/en/checkout/return",
      "/en/basket",
      "/api/health",
    ]) {
      const response = quietProxy(`https://example.com${path}`);
      expect(response.headers.get(CSP_REPORT_ONLY_HEADER), path).toBeNull();
      expect(response.headers.get(CSP_HEADER), path).toBeNull();
      expect(overriddenNames(response).join(","), path).not.toMatch(
        /content-security-policy/u,
      );
    }
  });
});
