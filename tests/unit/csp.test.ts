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
 *
 * Spec 040 T-06 / AC-6 (TASK-097) widened the same idea to a second axis. The policy is now a
 * function of the environment **and** the host platform, because `vercel.live` is a Vercel widget
 * and naming it in the policy of a Railway deploy would allow an origin nothing can serve
 * (ADR-0016: a shorter allowlist is strictly better). So the table below is 5 environments × 3
 * platforms = 15 rows, each asserted against one of **four verbatim strings** — the four distinct
 * policies those fifteen combinations can produce. Two of them, `PRODUCTION_POLICY` and
 * `PREVIEW_POLICY`, are byte-for-byte the strings this file pinned before spec 040, which is how
 * "behaviour-preserving on Vercel" is checked rather than asserted.
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
import { consentBootstrapHash } from "../../src/lib/consent-bootstrap";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin";
import type { HostPlatform } from "../../src/lib/env.schema";
import {
  cspReportOnly,
  deploymentEnvironments,
} from "../../src/lib/env.schema";
import { ALL_PATHS } from "../../src/lib/robots-headers";

/** The production policy, verbatim. */
const PRODUCTION_POLICY =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob: ${MEDIA_ORIGIN}; ` +
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
  `img-src 'self' data: blob: ${MEDIA_ORIGIN}; ` +
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

/** Http environments (`development`, `test`) off Vercel: no widget, nothing to upgrade to. */
const LOCAL_POLICY = PRODUCTION_POLICY.replace(
  " upgrade-insecure-requests;",
  "",
);

/** The same, on Vercel, where the widget is injected into every non-production deployment. */
const LOCAL_FEEDBACK_POLICY = PREVIEW_POLICY.replace(
  " upgrade-insecure-requests;",
  "",
);

/**
 * T-06 / AC-6: environment × host platform → the exact policy string. Fifteen rows, four
 * distinct strings, and the two Vercel https rows are the pre-spec-040 strings unchanged.
 */
const POLICY_TABLE: readonly {
  environment: (typeof deploymentEnvironments)[number];
  platform: HostPlatform;
  policy: string;
}[] = (["vercel", "railway", "local"] as const).flatMap((platform) =>
  deploymentEnvironments.map((environment) => {
    const feedback = platform === "vercel" && environment !== "production";
    const https =
      environment === "preview" ||
      environment === "staging" ||
      environment === "production";
    return {
      environment,
      platform,
      policy: https
        ? feedback
          ? PREVIEW_POLICY
          : PRODUCTION_POLICY
        : feedback
          ? LOCAL_FEEDBACK_POLICY
          : LOCAL_POLICY,
    };
  }),
);

describe("the policy string per environment × host platform (AC-23, spec 040 T-06)", () => {
  it.each(POLICY_TABLE)(
    "$environment on $platform is exactly one of the four policies",
    ({ environment, platform, policy }) => {
      expect(cspValue(environment, { platform })).toBe(policy);
    },
  );

  it("is byte-identical to the pre-spec-040 strings on Vercel", () => {
    expect(cspValue("production", { platform: "vercel" })).toBe(
      PRODUCTION_POLICY,
    );
    expect(cspValue("preview", { platform: "vercel" })).toBe(PREVIEW_POLICY);
  });

  it("names no vercel.live on Railway, in any environment (spec 040 AC-6)", () => {
    for (const environment of deploymentEnvironments) {
      expect(
        cspValue(environment, { platform: "railway" }),
        environment,
      ).not.toContain("vercel.live");
      expect(allowsPreviewFeedback(environment, "railway"), environment).toBe(
        false,
      );
    }
  });

  it("names vercel.live on a Vercel preview and never in production", () => {
    const preview = cspValue("preview", { platform: "vercel" });
    expect(preview).toContain(VERCEL_LIVE_ORIGIN);
    expect(cspValue("production", { platform: "vercel" })).not.toContain(
      "vercel.live",
    );
    // The origin is allowed in exactly three directives, not everywhere.
    expect(preview.split(VERCEL_LIVE_ORIGIN)).toHaveLength(4);
  });

  it("frames nothing in production and only vercel.live on a Vercel preview", () => {
    expect(cspValue("production")).toContain("frame-src 'none'");
    expect(cspValue("preview", { platform: "vercel" })).toContain(
      `frame-src ${VERCEL_LIVE_ORIGIN}`,
    );
    // `frame-ancestors 'none'` is unconditional: no environment may be framed.
    for (const environment of deploymentEnvironments) {
      expect(cspValue(environment), environment).toContain(
        "frame-ancestors 'none'",
      );
    }
  });

  it("defaults the platform to `local`, the shortest allowlist", () => {
    // A caller that says nothing must not widen the policy: ADR-0016's rule, and the reason the
    // default is not `vercel`. `next.config.ts` passes `hostPlatform(process.env)`.
    expect(cspValue("preview")).toBe(
      cspValue("preview", { platform: "local" }),
    );
    expect(cspValue("preview")).not.toContain("vercel.live");
  });

  it("upgrades insecure requests only where there is https to upgrade to", () => {
    // `staging` joined `preview` and `production` in spec 040 §5.2: it is https and
    // production-like, and it is where the florist demos run.
    for (const environment of ["preview", "staging", "production"] as const) {
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

  it("carries no hash when the caller passes none, so the two policy strings above stay readable", () => {
    expect(cspValue("production")).not.toContain("sha256-");
    expect(cspValue("production", { inlineHashes: [] })).toBe(
      PRODUCTION_POLICY,
    );
  });

  /**
   * TASK-050 filled the slot. The *shipped* policy therefore has exactly one hash — the ≤1 KB
   * Consent-Mode bootstrap — and the two verbatim strings above are the policy plus that one
   * token, which is what keeps a second inline script from being added without a reviewer seeing
   * it in the diff. The hash's equality with the emitted bytes is
   * `tests/unit/consent-bootstrap.test.tsx`.
   */
  it("is the consent bootstrap's hash that ships, in both environments, exactly once", () => {
    const hash = consentBootstrapHash();
    for (const [environment, base, platform] of [
      ["production", PRODUCTION_POLICY, "vercel"],
      ["preview", PREVIEW_POLICY, "vercel"],
      ["staging", PRODUCTION_POLICY, "railway"],
    ] as const) {
      const policy = cspValue(environment, {
        inlineHashes: [hash],
        platform,
      });
      expect(policy, environment).toBe(
        base.replace("script-src 'self'", `script-src 'self' '${hash}'`),
      );
      expect(policy.split("sha256-"), environment).toHaveLength(2);
    }
  });

  it("puts the hash before the preview origin, so the diff of adding one is one token", () => {
    expect(
      cspValue("preview", {
        inlineHashes: ["sha256-one"],
        platform: "vercel",
      }),
    ).toContain(`script-src 'self' 'sha256-one' ${VERCEL_LIVE_ORIGIN};`);
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
    expect(
      cspHeader("preview", { reportOnly: true, platform: "vercel" }).value,
    ).toBe(
      cspHeader("preview", { reportOnly: false, platform: "vercel" }).value,
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
    // `staging` sends none either: it runs on a Railway subdomain we do not want pinned
    // (spec 040 §5.2, unchanged rule, new value).
    for (const environment of [
      "development",
      "test",
      "preview",
      "staging",
    ] as const) {
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

  it("passes the consent bootstrap's hash and the GA4 gate (TASK-050)", () => {
    expect(source).toContain("inlineHashes: [consentBootstrapHash()]");
    expect(source).not.toContain("inlineHashes: []");
    expect(source).toContain(
      "ga4: ga4MeasurementId(process.env) !== undefined",
    );
  });

  // Spec 040 AC-1, AC-6 (TASK-097): the config reads the environment through `appEnvironment()`
  // and passes the host platform to the CSP, which is the only thing allowed to branch on it.
  it("resolves the environment with appEnvironment and passes hostPlatform to the CSP", () => {
    expect(source).toContain("appEnvironment(process.env)");
    expect(source).not.toContain("deploymentEnvironment(process.env)");
    expect(source).toContain("hostPlatform(process.env)");
    expect(source).toContain("platform,");
  });

  it("keeps the policy out of src/proxy.ts", () => {
    const proxy = readFileSync(
      resolve(__dirname, "../../src/proxy.ts"),
      "utf8",
    );
    expect(proxy).not.toContain("Content-Security-Policy");
  });
});
