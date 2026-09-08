/**
 * T-25, policy half (spec 004 AC-23, ADR-0016; TASK-046).
 *
 * AC-23 asserts **both header strings**, so both are written out here in full rather than probed
 * directive by directive. That is deliberate and the reason is the `vercel.live` row of spec 001's
 * deferred decisions (`/review 8`): the whole value of "the origin is in preview and not in
 * production" is that nobody can add it to the wrong one without a reviewer seeing the diff, and a
 * test that only checks `toContain("vercel.live")` on preview would pass just as happily if the
 * production policy grew the origin too.
 *
 * The `next.config.ts` wiring is asserted from the file's source, because that module calls
 * `assertEnv()` at import time and cannot be imported into a unit test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CSP_HEADER,
  CSP_REPORT_GROUP,
  CSP_REPORT_ONLY_HEADER,
  CSP_REPORT_PATH,
  HSTS_VALUE,
  PERMISSIONS_POLICY,
  REPORTING_ENDPOINTS_HEADER,
  VERCEL_LIVE_ORIGIN,
  allowsPreviewFeedback,
  cspHeader,
  cspValue,
  securityHeaderRules,
  sendsHsts,
} from "../../src/lib/csp";
import { cspReportOnly } from "../../src/lib/env.schema";
import { ALL_PATHS } from "../../src/lib/robots-headers";

/** The production policy, verbatim. */
const PRODUCTION_POLICY =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "frame-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "object-src 'none'; " +
  "form-action 'self'; " +
  `report-to ${CSP_REPORT_GROUP}; ` +
  `report-uri ${CSP_REPORT_PATH}; ` +
  "upgrade-insecure-requests;";

/** The preview policy, verbatim: the same policy plus `vercel.live` in three directives. */
const PREVIEW_POLICY =
  "default-src 'self'; " +
  `script-src 'self' ${VERCEL_LIVE_ORIGIN}; ` +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  `connect-src 'self' ${VERCEL_LIVE_ORIGIN}; ` +
  `frame-src ${VERCEL_LIVE_ORIGIN}; ` +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "object-src 'none'; " +
  "form-action 'self'; " +
  `report-to ${CSP_REPORT_GROUP}; ` +
  `report-uri ${CSP_REPORT_PATH}; ` +
  "upgrade-insecure-requests;";

describe("the policy string per environment (AC-23)", () => {
  it("is exactly the production policy in production", () => {
    expect(cspValue("production")).toBe(PRODUCTION_POLICY);
  });

  it("is exactly the preview policy on a preview", () => {
    expect(cspValue("preview")).toBe(PREVIEW_POLICY);
  });

  it("names vercel.live on preview and never in production", () => {
    expect(cspValue("preview")).toContain(VERCEL_LIVE_ORIGIN);
    expect(cspValue("production")).not.toContain("vercel.live");
    // The origin is allowed in exactly three directives, not everywhere.
    expect(cspValue("preview").split(VERCEL_LIVE_ORIGIN)).toHaveLength(4);
  });

  it("frames nothing in production and only vercel.live on a preview", () => {
    expect(cspValue("production")).toContain("frame-src 'none'");
    expect(cspValue("preview")).toContain(`frame-src ${VERCEL_LIVE_ORIGIN}`);
    // `frame-ancestors 'none'` is unconditional: no environment may be framed.
    for (const environment of [
      "development",
      "test",
      "preview",
      "production",
    ] as const) {
      expect(cspValue(environment), environment).toContain(
        "frame-ancestors 'none'",
      );
    }
  });

  it("gives local and CI the preview policy, since they run the same artefact", () => {
    for (const environment of ["development", "test"] as const) {
      expect(allowsPreviewFeedback(environment), environment).toBe(true);
      expect(cspValue(environment), environment).toContain(VERCEL_LIVE_ORIGIN);
    }
    expect(allowsPreviewFeedback("production")).toBe(false);
  });

  it("upgrades insecure requests only where there is https to upgrade to", () => {
    for (const environment of ["preview", "production"] as const) {
      expect(cspValue(environment), environment).toContain(
        "upgrade-insecure-requests",
      );
    }
    for (const environment of ["development", "test"] as const) {
      expect(cspValue(environment), environment).not.toContain(
        "upgrade-insecure-requests",
      );
    }
  });

  it("allows no third-party script or font origin at all in production", () => {
    const policy = cspValue("production");
    for (const origin of [
      "googletagmanager.com",
      "google-analytics.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "sentry.io",
      "vercel.live",
    ]) {
      expect(policy, origin).not.toContain(origin);
    }
  });

  it("keeps `'unsafe-inline'` for styles only, and no `'unsafe-eval'` anywhere", () => {
    const policy = cspValue("production");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("points both report mechanisms at /api/csp-report", () => {
    expect(cspValue("production")).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(cspValue("production")).toContain(`report-to ${CSP_REPORT_GROUP}`);
    expect(CSP_REPORT_PATH).toBe("/api/csp-report");
  });
});

describe("the inline-script hash slot (the seam TASK-050 uses)", () => {
  it("renders each hash quoted, in `script-src`, and nowhere else", () => {
    const hash = "sha256-AbCd0123+/=";
    const policy = cspValue("production", { inlineHashes: [hash] });
    expect(policy).toContain(`script-src 'self' '${hash}';`);
    expect(policy.split(hash)).toHaveLength(2);
  });

  it("renders several hashes in order", () => {
    const policy = cspValue("production", {
      inlineHashes: ["sha256-one", "sha256-two"],
    });
    expect(policy).toContain("script-src 'self' 'sha256-one' 'sha256-two';");
  });

  it("ships zero hashes today: the app has no inline script yet", () => {
    expect(cspValue("production")).not.toContain("sha256-");
    expect(cspValue("production", { inlineHashes: [] })).toBe(
      PRODUCTION_POLICY,
    );
  });

  it("puts the hash before the preview origin, so the diff of adding one is one token", () => {
    expect(cspValue("preview", { inlineHashes: ["sha256-one"] })).toContain(
      `script-src 'self' 'sha256-one' ${VERCEL_LIVE_ORIGIN};`,
    );
  });
});

describe("report-only versus enforce", () => {
  it("defaults to Report-Only, so a forgotten variable reports rather than blocks", () => {
    expect(cspHeader("production").key).toBe(CSP_REPORT_ONLY_HEADER);
    expect(cspHeader("production", {}).key).toBe(CSP_REPORT_ONLY_HEADER);
  });

  it("enforces only when explicitly told to", () => {
    expect(cspHeader("production", { reportOnly: false }).key).toBe(CSP_HEADER);
  });

  it("sends the same policy either way, so the evidence is about the policy that will enforce", () => {
    expect(cspHeader("preview", { reportOnly: true }).value).toBe(
      cspHeader("preview", { reportOnly: false }).value,
    );
  });

  it("reads `CSP_REPORT_ONLY` asymmetrically: only the exact string `false` enforces", () => {
    expect(cspReportOnly({})).toBe(true);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "" })).toBe(true);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "true" })).toBe(true);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "False" })).toBe(true);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "0" })).toBe(true);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "false" })).toBe(false);
  });
});

describe("the other security headers (AC-23)", () => {
  const rulesFor = (environment: "preview" | "production") =>
    securityHeaderRules(environment);
  const headerMap = (environment: "preview" | "production") =>
    new Map(
      (rulesFor(environment)[0]?.headers ?? []).map((header) => [
        header.key,
        header.value,
      ]),
    );

  it("applies to every path, documents and /api/* alike", () => {
    const rules = rulesFor("production");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe(ALL_PATHS);
  });

  it("sends nosniff, a referrer policy, DENY, a minimal permissions policy and COOP", () => {
    for (const environment of ["preview", "production"] as const) {
      const headers = headerMap(environment);
      expect(headers.get("X-Content-Type-Options"), environment).toBe(
        "nosniff",
      );
      expect(headers.get("Referrer-Policy"), environment).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers.get("X-Frame-Options"), environment).toBe("DENY");
      expect(headers.get("Permissions-Policy"), environment).toBe(
        PERMISSIONS_POLICY,
      );
      expect(headers.get("Cross-Origin-Opener-Policy"), environment).toBe(
        "same-origin",
      );
      expect(headers.get(REPORTING_ENDPOINTS_HEADER), environment).toBe(
        `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
      );
    }
  });

  it("switches every powerful feature off, including payment (spec 013 revisits it)", () => {
    for (const feature of [
      "camera",
      "microphone",
      "geolocation",
      "payment",
      "usb",
      "display-capture",
    ]) {
      expect(PERMISSIONS_POLICY, feature).toContain(`${feature}=()`);
    }
    // No feature is allowed for any origin: the policy is a list of empty allowlists.
    expect(PERMISSIONS_POLICY).not.toMatch(/=\((?!\))/);
  });

  it("sends HSTS in production only", () => {
    expect(headerMap("production").get("Strict-Transport-Security")).toBe(
      HSTS_VALUE,
    );
    expect(headerMap("preview").has("Strict-Transport-Security")).toBe(false);
    for (const environment of ["development", "test", "preview"] as const) {
      expect(sendsHsts(environment), environment).toBe(false);
    }
    expect(HSTS_VALUE).toContain("max-age=63072000");
    expect(HSTS_VALUE).toContain("includeSubDomains");
  });

  it("carries the CSP under the Report-Only name by default", () => {
    expect(headerMap("production").has(CSP_REPORT_ONLY_HEADER)).toBe(true);
    expect(headerMap("production").has(CSP_HEADER)).toBe(false);
  });

  it("returns fresh objects, so a caller cannot mutate the shipped policy", () => {
    const first = securityHeaderRules("production");
    first[0]?.headers.push({ key: "X-Nope", value: "1" });
    expect(
      securityHeaderRules("production")[0]?.headers.map((header) => header.key),
    ).not.toContain("X-Nope");
  });
});

describe("next.config.ts wiring", () => {
  const source = readFileSync(
    resolve(__dirname, "../../next.config.ts"),
    "utf8",
  );

  it("emits the security headers alongside the noindex rules", () => {
    expect(source).toContain("securityHeaderRules(environment");
    expect(source).toContain("noindexHeaderRules(environment)");
    expect(source).toContain("reportOnly: cspReportOnly(process.env)");
  });

  it("ships no inline-script hash yet, and says which task adds one", () => {
    expect(source).toContain("inlineHashes: []");
    expect(source).toContain("TASK-050");
  });

  it("keeps the policy out of src/proxy.ts", () => {
    const proxy = readFileSync(
      resolve(__dirname, "../../src/proxy.ts"),
      "utf8",
    );
    expect(proxy).not.toContain("Content-Security-Policy");
  });
});
