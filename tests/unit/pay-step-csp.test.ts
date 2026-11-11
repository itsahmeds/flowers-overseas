/**
 * T-02, policy half (spec 013 §5.4, AC-2; ADR-0016, ADR-0020; TASK-262): step 3's
 * Content-Security-Policy in `test` and `live`, and the proof that no other policy moved.
 *
 * The pay-step policy is asserted as **whole strings**, like `tests/unit/csp.test.ts` does for the
 * static one, so a widening (a broader Stripe wildcard, a fourth origin) is a visible diff here
 * and not a `toContain` that keeps passing. Which response carries it is the wiring question in
 * `docs/tasks/TASK-262.md` `## Escalations`; this file owns the value.
 */
import { describe, expect, it } from "vitest";

import {
  CSP_HEADER,
  CSP_REPORT_GROUP,
  CSP_REPORT_ONLY_HEADER,
  CSP_REPORT_PATH,
  GOOGLE_ANALYTICS_ORIGIN,
  GOOGLE_TAG_MANAGER_ORIGIN,
  PAY_STEP_STRIPE_SOURCES,
  VERCEL_LIVE_ORIGIN,
  cspValue,
  isCspNonce,
  newCspNonce,
  payStepCspHeader,
  payStepCspValue,
  securityHeaderRules,
} from "../../src/lib/csp";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin";
import {
  type HostPlatform,
  deploymentEnvironments,
} from "../../src/lib/env.schema";

/** A fixed nonce, 16 bytes of base64, so the strings below can be written out. */
const NONCE = "AAECAwQFBgcICQoLDA0ODw==";

/** Step 3 in production on Railway, verbatim (spec 013 §5.4's list, nothing else). */
const PAY_STEP_PRODUCTION =
  "default-src 'self'; " +
  `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com; ` +
  "style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob: ${MEDIA_ORIGIN}; ` +
  "font-src 'self'; " +
  "connect-src 'self' https://api.stripe.com; " +
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "object-src 'none'; " +
  "form-action 'self'; " +
  `report-to ${CSP_REPORT_GROUP}; ` +
  `report-uri ${CSP_REPORT_PATH}; ` +
  "upgrade-insecure-requests;";

/** Step 3 on a Vercel preview: the same, with `vercel.live` where the static preview policy has it. */
const PAY_STEP_PREVIEW =
  "default-src 'self'; " +
  `script-src 'self' ${VERCEL_LIVE_ORIGIN} 'nonce-${NONCE}' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com; ` +
  "style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob: ${MEDIA_ORIGIN}; ` +
  "font-src 'self'; " +
  `connect-src 'self' ${VERCEL_LIVE_ORIGIN} https://api.stripe.com; ` +
  `frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com ${VERCEL_LIVE_ORIGIN}; ` +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "object-src 'none'; " +
  "form-action 'self'; " +
  `report-to ${CSP_REPORT_GROUP}; ` +
  `report-uri ${CSP_REPORT_PATH}; ` +
  "upgrade-insecure-requests;";

const PLATFORMS: readonly HostPlatform[] = ["vercel", "railway", "local"];

/** Every option combination the static policy is built under. */
const COMBINATIONS = PLATFORMS.flatMap((platform) =>
  deploymentEnvironments.flatMap((environment) =>
    [false, true].flatMap((ga4) =>
      [[], ["sha256-AAAA"]].map((inlineHashes) => ({
        environment,
        options: { platform, ga4, inlineHashes },
      })),
    ),
  ),
);

/** `{ directive → value }` of a policy string, for the per-directive comparison. */
function directivesOf(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const [name = "", ...values] = trimmed.split(" ");
    map.set(name, values.join(" "));
  }
  return map;
}

describe("step 3's policy in test and live (spec 013 §5.4, AC-2)", () => {
  it("is exactly §5.4's Stripe origins with a nonce and 'strict-dynamic', in production", () => {
    expect(
      payStepCspValue("production", { platform: "railway", nonce: NONCE }),
    ).toBe(PAY_STEP_PRODUCTION);
  });

  it("keeps vercel.live beside Stripe on a Vercel preview, and frames nothing else", () => {
    expect(
      payStepCspValue("preview", { platform: "vercel", nonce: NONCE }),
    ).toBe(PAY_STEP_PREVIEW);
  });

  it("names the three directives' Stripe sources and no other Stripe origin", () => {
    expect(PAY_STEP_STRIPE_SOURCES).toEqual({
      script: ["https://js.stripe.com", "https://*.js.stripe.com"],
      frame: [
        "https://js.stripe.com",
        "https://*.js.stripe.com",
        "https://hooks.stripe.com",
      ],
      connect: ["https://api.stripe.com"],
    });
    const policy = payStepCspValue("production", { nonce: NONCE });
    const stripe = policy.match(/https:\/\/[^\s;]*stripe[^\s;]*/gu) ?? [];
    expect(stripe).toEqual([
      "https://js.stripe.com",
      "https://*.js.stripe.com",
      "https://api.stripe.com",
      "https://js.stripe.com",
      "https://*.js.stripe.com",
      "https://hooks.stripe.com",
    ]);
  });

  it("differs from the static policy in script-src, connect-src and frame-src only, for every option set", () => {
    for (const { environment, options } of COMBINATIONS) {
      const label = JSON.stringify({ environment, ...options });
      const stat = directivesOf(cspValue(environment, options));
      const pay = directivesOf(
        payStepCspValue(environment, { ...options, nonce: NONCE }),
      );
      expect([...pay.keys()], label).toEqual([...stat.keys()]);
      for (const [name, value] of stat) {
        if (name === "script-src") {
          expect(pay.get(name), label).toBe(
            `${value} 'nonce-${NONCE}' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com`,
          );
        } else if (name === "connect-src") {
          expect(pay.get(name), label).toBe(`${value} https://api.stripe.com`);
        } else if (name === "frame-src") {
          const frames =
            "https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com";
          expect(pay.get(name), label).toBe(
            value === "'none'" ? frames : `${frames} ${value}`,
          );
        } else {
          expect(pay.get(name), label).toBe(value);
        }
      }
    }
  });

  it("keeps the consent hash and the GA4 tag origin ahead of the nonce", () => {
    const policy = payStepCspValue("production", {
      nonce: NONCE,
      ga4: true,
      inlineHashes: ["sha256-AAAA"],
    });
    expect(directivesOf(policy).get("script-src")).toBe(
      `'self' 'sha256-AAAA' ${GOOGLE_TAG_MANAGER_ORIGIN} 'nonce-${NONCE}' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com`,
    );
    expect(directivesOf(policy).get("connect-src")).toBe(
      `'self' ${GOOGLE_ANALYTICS_ORIGIN} https://*.analytics.google.com ${GOOGLE_TAG_MANAGER_ORIGIN} https://api.stripe.com`,
    );
  });

  it("carries no 'unsafe-inline' or 'unsafe-eval' in script-src", () => {
    const script =
      directivesOf(payStepCspValue("production", { nonce: NONCE })).get(
        "script-src",
      ) ?? "";
    expect(script).not.toContain("unsafe");
  });

  it("stays under 1 024 bytes in its widest form, far below any proxy's header limit", () => {
    const widest = payStepCspValue("preview", {
      platform: "vercel",
      ga4: true,
      inlineHashes: [`sha256-${"A".repeat(43)}=`],
      nonce: newCspNonce(),
    });
    expect(new TextEncoder().encode(widest).length).toBeLessThanOrEqual(1024);
  });
});

describe("every other policy is today's (AC-2: no Stripe origin anywhere else)", () => {
  it("names no Stripe origin in the static policy, under any environment, platform or option", () => {
    for (const { environment, options } of COMBINATIONS) {
      expect(cspValue(environment, options), environment).not.toMatch(
        /stripe/iu,
      );
    }
  });

  it("names no Stripe origin and no nonce in the headers next.config.ts sends on every path", () => {
    for (const environment of deploymentEnvironments) {
      for (const platform of PLATFORMS) {
        const values = (
          securityHeaderRules(environment, { platform, ga4: true })[0]
            ?.headers ?? []
        ).map((header) => header.value);
        for (const value of values) {
          expect(value).not.toMatch(/stripe|nonce-|strict-dynamic/iu);
        }
      }
    }
  });
});

describe("the nonce", () => {
  it("is 128 bits of base64 that the policy accepts", () => {
    const nonce = newCspNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/u);
    expect(isCspNonce(nonce)).toBe(true);
    expect(payStepCspValue("production", { nonce })).toContain(
      `'nonce-${nonce}'`,
    );
  });

  it("is never reused: 2 000 draws, 2 000 values", () => {
    const draws = Array.from({ length: 2000 }, () => newCspNonce());
    expect(new Set(draws).size).toBe(2000);
  });

  it("refuses a value that could end the source or open a directive", () => {
    for (const bad of [
      "",
      "short",
      `${NONCE}'; script-src *`,
      `${NONCE} https://evil.example`,
      `${NONCE};`,
      "AAECAwQFBgcICQoLDA0ODw==\n",
      "AAECAwQF-gcICQoLDA0ODw==",
    ]) {
      expect(isCspNonce(bad), JSON.stringify(bad)).toBe(false);
      expect(() => payStepCspValue("production", { nonce: bad })).toThrow(
        /not a base64 CSP nonce/u,
      );
    }
  });
});

describe("report-only versus enforced", () => {
  it("uses the enforcing name only when the deployment enforces", () => {
    const enforced = payStepCspHeader("production", {
      nonce: NONCE,
      enforce: true,
      platform: "railway",
    });
    expect(enforced).toEqual({ key: CSP_HEADER, value: PAY_STEP_PRODUCTION });
    const reportOnly = payStepCspHeader("production", {
      nonce: NONCE,
      enforce: false,
      platform: "railway",
    });
    expect(reportOnly).toEqual({
      key: CSP_REPORT_ONLY_HEADER,
      value: PAY_STEP_PRODUCTION,
    });
  });
});
