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
      // Exactly one inline-script hash: the ≤1 KB Consent-Mode bootstrap TASK-050 ships. Its
      // equality with the bytes the browser received is asserted in `tests/e2e/consent.spec.ts`,
      // which recomputes the digest from the served document.
      expect(policy?.split("sha256-")).toHaveLength(2);
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

  test("the vercel.live allowance follows the host, not just the environment", async ({
    request,
    baseURL,
  }) => {
    // A property of *this* target, not of the policy in general. Since spec 040 §5.2 (AC-6) the
    // allowance is `hostPlatform() === "vercel" && environment !== "production"`, so a Vercel
    // preview still carries the origin and a local `next start` — and every Railway deploy —
    // carries none. `tests/unit/csp.test.ts` asserts the full string for all fifteen
    // environment × platform combinations, because there is no production deployment to fetch.
    const host = new URL(baseURL ?? "http://localhost:3000").hostname;
    const onVercel = host.endsWith(".vercel.app");
    const policy = (await request.get("/en")).headers()[REPORT_ONLY] ?? "";
    if (onVercel) expect(policy).toContain("https://vercel.live");
    else expect(policy).not.toContain("vercel.live");
  });

  test("HSTS, if present here, came from the platform and not from us", async ({
    request,
  }) => {
    // Measured on the first CI run of this file: a Vercel preview answers with
    // `strict-transport-security: max-age=63072000; includeSubDomains; preload` that **Vercel**
    // adds, because `*.vercel.app` is itself on the HSTS preload list. Our own header is
    // production-only (`sendsHsts()`), so "no HSTS on a preview" is not an assertion this suite can
    // make: it would be asserting the platform's behaviour, and it would fail on a preview and pass
    // on a local `next start` for reasons that have nothing to do with this repository.
    //
    // What *is* worth pinning is the direction: whatever HSTS reaches a client must be a real,
    // long-lived policy, never a `max-age=0` that would switch protection off.
    const value = (await request.get("/en")).headers()[
      "strict-transport-security"
    ];
    if (value !== undefined) {
      const maxAge = /max-age=(\d+)/.exec(value)?.[1];
      expect(Number(maxAge)).toBeGreaterThanOrEqual(31_536_000);
    }
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
