/**
 * Content-Security-Policy and the other security response headers (spec 004 §5.2, AC-23,
 * **ADR-0016**; TASK-046). Discharges the "CSP with nonces" deferred row of
 * `docs/architecture.md` §4 and spec 001 §8.
 *
 * ## Why a static allowlist plus a hash, and not a nonce
 *
 * `plan/01` §9 said "CSP with nonces". A nonce cannot exist in an ISR/SSG response without either
 * making it a public constant — worthless, since an injected script can read it out of the
 * document — or rendering every indexable page per request, which is a direct hit on priorities #1
 * and #2 and on the whole LCP budget. So the policy is a **constant per environment**, emitted
 * from `next.config.ts`'s `headers()`, with a build-time `'sha256-'` hash slot for the single
 * ≤1 KB inline Consent-Mode block that TASK-050 ships. The full argument, the alternatives and the
 * accepted trade-off are ADR-0016; the nonce plus `'strict-dynamic'` variant is reserved for the
 * `no-store` routes (checkout, account, admin, vendor) and belongs to the spec that ships the
 * first one.
 *
 * ## Why the header lives in `next.config.ts` and not in `src/proxy.ts`
 *
 * Both can set a response header. `headers()` is applied by the platform to **cached** responses
 * as well, which is precisely the response class the policy has to cover, and it is a static
 * config value that can be asserted from a unit test without a running server — the same reason
 * `src/lib/robots-headers.ts` exists. `src/proxy.ts` stays what spec 001 §11 made it: a
 * request-id and one log line, "nothing else". The day a `no-store` route needs a per-request
 * nonce, that is the file it comes from, and it will *add* a header to those routes rather than
 * replace this one.
 *
 * ## Report-Only first
 *
 * `CSP_REPORT_ONLY` (absent ⇒ `true`) decides the header **name**, never its content: the same
 * policy string is either enforced or reported, so the evidence collected at `/api/csp-report`
 * is evidence about the policy that will be enforced. `Reporting-Endpoints` plus `report-to` is
 * the current shape; the deprecated `report-uri` is emitted alongside because Safari and older
 * Chromium still only implement that one, and a violation nobody hears about is the failure mode
 * this whole exercise exists to avoid.
 */
import type { DeploymentEnvironment, HostPlatform } from "./env.schema";
import type { HeaderRule } from "./robots-headers";

import { ALL_PATHS } from "./robots-headers";

/** The route `POST`ing violation reports lands on (`src/app/api/csp-report/route.ts`). */
export const CSP_REPORT_PATH = "/api/csp-report";

/** The `Reporting-Endpoints` group name `report-to` refers to. */
export const CSP_REPORT_GROUP = "csp-endpoint";

/**
 * Vercel injects its preview-feedback widget into protected previews from this origin. It is
 * absent from production, so the production policy must not name it — spec 001 left this as a
 * deferred row (`/review 8`) and AC-23 asserts both header strings. `tests/e2e/shell.spec.ts`
 * drops its own non-local allowance once the enforce flip lands.
 */
export const VERCEL_LIVE_ORIGIN = "https://vercel.live";

/**
 * Where `gtag.js` comes from when `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set (spec 004 §5.2,
 * AC-21; TASK-050). Named in `script-src` and `connect-src`, and **only** when an id is
 * configured: with no id there is no tag, so an allowance for it would widen the policy of every
 * environment that does not use it — including production today.
 *
 * The trade-off this origin carries is ADR-0016's accepted one, and it is the sharpest edge of
 * the allowlist approach: `googletagmanager.com` serves arbitrary container code, so an XSS that
 * can inject a `<script src>` to it is not blocked on a cached page. That is why the origin is
 * gated on configuration rather than allowed pre-emptively.
 */
export const GOOGLE_TAG_MANAGER_ORIGIN = "https://www.googletagmanager.com";

/**
 * Where GA4 sends its measurement pings (`connect-src` only). Wildcarded because the endpoint is
 * regionalised (`region1.google-analytics.com` in the EU) and the region is chosen by the tag,
 * not by us. It is deliberately **not** in `img-src`: gtag prefers `fetch`/`sendBeacon`, and if
 * the Report-Only evidence ever shows an image ping being reported, adding `img-src` is a
 * reviewed diff rather than a pre-emptive allowance.
 */
export const GOOGLE_ANALYTICS_ORIGIN = "https://*.google-analytics.com";

export const CSP_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const REPORTING_ENDPOINTS_HEADER = "Reporting-Endpoints";

export interface CspOptions {
  /**
   * `'sha256-…'` values for inline `<script>` blocks, base64 as the CSP grammar wants them and
   * **without** the surrounding quotes, which are added here. Empty in this spec: the app has no
   * inline script yet. TASK-050 adds one — the Consent-Mode default block — in the same PR as
   * the script itself, because a bootstrap the policy would report is a false negative in the
   * Report-Only evidence. The application then contains **exactly one APPLICATION inline script;
   * Next's flight blocks are unauthorised under this policy and are why the header stays
   * Report-Only (spec 004 §14 A2)** — the enforce flip waits for a task that adds nonce
   * propagation or accepts a hash per response, and is no longer TASK-056's.
   */
  readonly inlineHashes?: readonly string[];
  /** `false` enforces. Defaults to `true` (report only), like the env variable it comes from. */
  readonly reportOnly?: boolean;
  /**
   * Whether a GA4 measurement id is configured (TASK-050). `true` adds the tag origin to
   * `script-src` and the tag plus measurement origins to `connect-src`; `false` — the Phase 0
   * default in CI, locally, on previews and in production — leaves the policy free of any
   * analytics origin, which is what makes AC-21's "zero `googletagmanager.com` requests"
   * enforceable rather than merely observed.
   */
  readonly ga4?: boolean;
  /**
   * Which platform serves this deployment (spec 040 §5.2, AC-6; TASK-097). It decides one thing
   * and one thing only: whether `vercel.live` is in the policy. **Defaults to `"local"`**, the
   * shortest allowlist, because ADR-0016's rule is that a shorter allowlist is strictly better
   * and a default that widens a policy is the wrong way round. `next.config.ts` passes
   * `hostPlatform(process.env)`.
   */
  readonly platform?: HostPlatform;
}

/**
 * Whether this deployment gets the `vercel.live` allowance (spec 040 §5.2, AC-6; TASK-097).
 *
 * Two terms, and both must hold: the widget is injected **by Vercel** into non-production
 * deployments, so it is `hostPlatform === "vercel" && environment !== "production"`. On Railway
 * the origin is absent in *every* environment — there is no `vercel.live` there to inject
 * anything — and a policy that names an origin nothing can serve is exactly the widening ADR-0016
 * says to avoid. A local `next start` is the same case: the platform is `"local"`, so the
 * allowance is gone, and the Playwright suites that already branch on `isLocal` say so.
 *
 * Before spec 040 this was `environment !== "production"` alone, which was correct while Vercel
 * was the only host. The Vercel *strings* are unchanged: `allowsPreviewFeedback(e, "vercel")`
 * reproduces the old answer for every environment.
 */
export function allowsPreviewFeedback(
  environment: DeploymentEnvironment,
  platform: HostPlatform,
): boolean {
  return platform === "vercel" && environment !== "production";
}

/**
 * HSTS is production-only: an `http://localhost` build must not pin itself to https. Unchanged by
 * spec 040 — `staging` deliberately sends **no** HSTS, because it runs on a Railway subdomain we
 * do not want a browser to pin (§5.2).
 *
 * On a Vercel **preview** a `Strict-Transport-Security` header arrives anyway — the platform adds
 * it, because `*.vercel.app` is itself on the HSTS preload list (measured on this PR's first CI
 * run). That is the platform's header, not ours, and it is why `tests/e2e/security-headers.spec.ts`
 * cannot assert the absence of HSTS on a preview. Ours matters on the custom domain, where nobody
 * else sends one.
 */
export function sendsHsts(environment: DeploymentEnvironment): boolean {
  return environment === "production";
}

/** The environments served over https, and therefore the ones with something to upgrade to. */
const UPGRADES_INSECURE_REQUESTS: readonly DeploymentEnvironment[] = [
  "preview",
  "staging",
  "production",
];

const quoted = (hash: string): string => `'${hash}'`;

/**
 * The policy string for an environment. Directive order and spacing are stable, because AC-23
 * asserts the whole string and a reviewer has to be able to read a diff of it.
 */
export function cspValue(
  environment: DeploymentEnvironment,
  options: CspOptions = {},
): string {
  const previewFeedback = allowsPreviewFeedback(
    environment,
    options.platform ?? "local",
  );
  const live = previewFeedback ? [VERCEL_LIVE_ORIGIN] : [];
  // Present only when an id is configured (TASK-050); the build reads that from the env.
  const tagManager = (options.ga4 ?? false) ? [GOOGLE_TAG_MANAGER_ORIGIN] : [];
  const analytics =
    (options.ga4 ?? false)
      ? [GOOGLE_TAG_MANAGER_ORIGIN, GOOGLE_ANALYTICS_ORIGIN]
      : [];

  const directives: readonly (readonly [string, readonly string[]])[] = [
    ["default-src", ["'self'"]],
    // `'self'` plus one hash per inline block — in Phase 0 exactly one application inline
    // script, the ≤1 KB Consent-Mode bootstrap of `src/lib/consent-bootstrap.ts` (TASK-050);
    // Next's own flight blocks are unauthorised here, see `inlineHashes` above — plus the GA4
    // tag origin when a measurement id is configured. No `'unsafe-inline'`, no `'unsafe-eval'`,
    // and no Google Fonts origin: the fonts are self-hosted (spec 004 §5.1).
    [
      "script-src",
      [
        "'self'",
        ...(options.inlineHashes ?? []).map(quoted),
        ...tagManager,
        ...live,
      ],
    ],
    // A documented relaxation, with the reason: React writes `style` attributes and Next inlines
    // critical CSS, so a policy without `'unsafe-inline'` would report on every page. Revisited
    // the day either stops being true (spec 004 §5.2).
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    // Self-hosted Latin + Latin-Ext faces; no Google Fonts origin, ever (spec 004 §5.1).
    ["font-src", ["'self'"]],
    // No Sentry ingest: the browser SDK is off public routes in Phase 0 and returns scoped to
    // checkout in spec 013 (`docs/architecture.md` §4).
    ["connect-src", ["'self'", ...analytics, ...live]],
    ["frame-src", live.length > 0 ? live : ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["report-to", [CSP_REPORT_GROUP]],
    ["report-uri", [CSP_REPORT_PATH]],
  ];

  const parts = directives.map(
    ([name, values]) => `${name} ${values.join(" ")}`,
  );
  // Valueless directive, so it is appended rather than joined. Only where there is https to
  // upgrade to: on `http://localhost` it is noise in every header dump. `staging` joined the list
  // in spec 040 (§5.2, AC-6) — it is https and production-like, and it is the environment the
  // florist demos run on.
  if (UPGRADES_INSECURE_REQUESTS.includes(environment)) {
    parts.push("upgrade-insecure-requests");
  }
  return `${parts.join("; ")};`;
}

/** The CSP header as a name/value pair; the name is what `reportOnly` decides. */
export function cspHeader(
  environment: DeploymentEnvironment,
  options: CspOptions = {},
): { key: string; value: string } {
  return {
    key: (options.reportOnly ?? true) ? CSP_REPORT_ONLY_HEADER : CSP_HEADER,
    value: cspValue(environment, options),
  };
}

/**
 * `Permissions-Policy`, minimal: every powerful feature this product does not use is switched off
 * for every origin. `payment=()` is correct today and is the one entry spec 013 must revisit when
 * Stripe's Payment Request API lands — noted here rather than pre-allowed, so the relaxation is a
 * reviewed diff.
 */
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

/**
 * Two years, subdomains included, `preload` declared. Production only, and one consequence worth
 * stating: `preload` is a commitment — the day `flowersoverseas.com` is submitted to the HSTS
 * preload list, http on any subdomain stops working for browsers shipping that list, and removal
 * takes months. Kept because every environment of this product is https by policy anyway
 * (`NEXT_PUBLIC_SITE_URL` must use https in preview and production, `src/lib/env.schema.ts`).
 */
export const HSTS_VALUE = "max-age=63072000; includeSubDomains; preload";

/**
 * Every security header for an environment, in `next.config.ts`'s `headers()` shape, on `/(.*)`
 * — HTML documents and `/api/*` alike. Fresh objects on every call, like `noindexHeaderRules()`.
 *
 * `X-Frame-Options: DENY` is sent **as well as** `frame-ancestors 'none'`: the CSP directive is
 * the modern, correct one, and the legacy header is what a browser that ignores the Report-Only
 * policy still obeys. While the CSP is Report-Only, `frame-ancestors` reports rather than blocks,
 * so `X-Frame-Options` is the only clickjacking protection actually in force — which is the whole
 * reason it is not dropped as redundant.
 */
export function securityHeaderRules(
  environment: DeploymentEnvironment,
  options: CspOptions = {},
): HeaderRule[] {
  const headers = [
    {
      key: REPORTING_ENDPOINTS_HEADER,
      value: `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
    },
    cspHeader(environment, options),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (sendsHsts(environment)) {
    headers.push({ key: "Strict-Transport-Security", value: HSTS_VALUE });
  }
  return [{ source: ALL_PATHS, headers }];
}
