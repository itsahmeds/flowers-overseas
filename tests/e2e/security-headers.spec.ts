/**
 * T-25, served half (spec 004 AC-23, ADR-0016; TASK-046).
 *
 * `tests/unit/csp.test.ts` asserts the two policy *strings*; this file asserts that the deployment
 * actually sends them, on the three response classes that exist today — the chooser (`/`, a static
 * document), a locale home (`/en`, SSG through `generateStaticParams`) and an API route
 * (`/api/health`, `force-dynamic`). The unit test cannot tell whether `next.config.ts`'s
 * `headers()` reached a cached edge response, which is the only thing that matters about a policy
 * on an SSG site.
 *
 * The target is `PLAYWRIGHT_BASE_URL` — the Vercel preview in CI, `http://localhost:3000` locally
 * against `pnpm build && pnpm start`. Neither is production, so both carry the preview policy and
 * the `vercel.live` allowance; the production-only clauses (`vercel.live` absent, HSTS present) are
 * asserted in the unit test, which is the only place they can be asserted before there is a
 * production deployment to point at. Both facts are written down here so nobody reads this file as
 * evidence that production is covered.
 */
import { expect, test } from "@playwright/test";

/** Every path that must carry the headers, one per response class. */
const PATHS = ["/", "/en", "/api/health"] as const;

const REPORT_ONLY = "content-security-policy-report-only";

test.describe("security headers (AC-23)", () => {
  for (const path of PATHS) {
    test(`\`${path}\` carries the Report-Only CSP`, async ({ request }) => {
      const response = await request.get(path);
      const headers = response.headers();

      const policy = headers[REPORT_ONLY];
      expect(policy, `${path} sent no ${REPORT_ONLY}`).toBeDefined();
      // The enforcing header must be absent while the rollout is Report-Only: sending both would
      // make the evidence period meaningless, because the policy would already be blocking.
      expect(headers["content-security-policy"]).toBeUndefined();

      for (const directive of [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "report-uri /api/csp-report",
        "report-to csp-endpoint",
      ]) {
        expect(policy, directive).toContain(directive);
      }
      // No hash yet: TASK-050 adds the consent bootstrap and its hash in one PR.
      expect(policy).not.toContain("sha256-");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(headers["reporting-endpoints"]).toContain(
        'csp-endpoint="/api/csp-report"',
      );
    });

    test(`\`${path}\` carries the other security headers`, async ({
      request,
    }) => {
      const headers = (await request.get(path)).headers();

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
      for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
        expect(headers["permissions-policy"], feature).toContain(feature);
      }
    });
  }

  test("the non-production target carries the vercel.live allowance and no HSTS", async ({
    request,
  }) => {
    // Both clauses are properties of *this* target being a preview or a local build, not of the
    // policy in general: production drops the origin and gains HSTS, which `tests/unit/csp.test.ts`
    // asserts on the string because there is no production deployment to fetch.
    const response = await request.get("/en");
    expect(response.headers()[REPORT_ONLY]).toContain("https://vercel.live");
    expect(response.headers()["strict-transport-security"]).toBeUndefined();
  });
});

test.describe("POST /api/csp-report (AC-23)", () => {
  test("accepts a report-uri body and answers 204, uncacheable and unindexable", async ({
    request,
  }) => {
    const response = await request.post("/api/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: {
        "csp-report": {
          "document-uri": "https://example.test/en?q=marker",
          "effective-directive": "script-src",
          "blocked-uri": "https://evil.test/a?token=marker",
          "script-sample": 'alert("marker")',
        },
      },
    });

    expect(response.status()).toBe(204);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("accepts a Reporting-API batch", async ({ request }) => {
    const response = await request.post("/api/csp-report", {
      headers: { "content-type": "application/reports+json" },
      data: [
        {
          type: "csp-violation",
          body: {
            effectiveDirective: "img-src",
            blockedURL: "https://x.test/a",
          },
        },
      ],
    });
    expect(response.status()).toBe(204);
  });

  test("refuses a content type no browser sends, and never 5xx on rubbish", async ({
    request,
  }) => {
    const wrongType = await request.post("/api/csp-report", {
      headers: { "content-type": "application/json" },
      data: { "csp-report": {} },
    });
    expect(wrongType.status()).toBe(415);

    const rubbish = await request.post("/api/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: "not json at all",
    });
    expect(rubbish.status()).toBeLessThan(500);
  });
});
