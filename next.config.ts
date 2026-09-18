import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

import { consentBootstrapHash } from "./src/lib/consent-bootstrap";
import { securityHeaderRules } from "./src/lib/csp";
import { assertBuildEnv } from "./src/lib/env.assert";
import { mediaCacheHeaderRules } from "./src/lib/media-headers";
import {
  appEnvironment,
  cspReportOnly,
  ga4MeasurementId,
  hostPlatform,
} from "./src/lib/env.schema";
import { noindexHeaderRules } from "./src/lib/robots-headers";

// Fail the build before compiling anything when a variable **the build consumes** is missing or
// malformed. The error names the offending keys and prints no value (spec 001 AC-10, TASK-005).
//
// `assertBuildEnv()` grades `BUILD_ENV_KEYS` only — `APP_ENV` plus the `NEXT_PUBLIC_*` set — and
// not the whole 28-key contract (spec 001 §14 A17, spec 040 §14 A1; TASK-135). Those are the keys
// a compiled artefact actually carries: `APP_ENV` decides the headers baked in below, the
// `NEXT_PUBLIC_*` values are inlined into the browser bundle. The server-only keys —
// `DATABASE_URL`, the R2 credentials, `INTERNAL_CRON_SECRET` — are asserted at server start by
// `instrumentation.ts` instead, because the alternative is handing a `docker build` ten secrets it
// would then carry in its layer history. Trigger: the Railway staging build log of 2026-09-18,
// where `RUN pnpm build` failed on ten keys that no build has ever read.
assertBuildEnv();

// `X-Robots-Tag: noindex` on every response outside production, permanently: previews and
// staging are never indexable (spec 001 §2, §6, AC-15, TASK-006). Production gets no header here
// — `src/app/robots.ts` and the root `noindex` meta cover the 001 production alias, and spec 007
// lifts exactly those two. `/api/*` sets its own `X-Robots-Tag` in every environment
// (`src/lib/health.ts`).
//
// Spec 040 §5.2 (TASK-097): the signal is `APP_ENV`, set by whichever platform runs the app, with
// `VERCEL_ENV` kept only as the compatibility fallback of the cold Vercel rollback. Unset resolves
// to `development` and therefore to `noindex`, which is the safe direction on a new host; a
// present-but-unparseable value throws here and fails the build naming the key.
const environment = appEnvironment(process.env);

// The host, for the one thing it decides: whether `vercel.live` belongs in the policy (§5.2,
// AC-6). Nothing else in the application may branch on it.
const platform = hostPlatform(process.env);

// Security headers on every path, per environment (spec 004 §5.2, AC-23, **ADR-0016**;
// TASK-046). `headers()` rather than `src/proxy.ts` because it is applied to cached responses
// too — which is the response class an SSG/ISR site is made of — and because a static config
// value can be asserted from a unit test without a running server (`src/lib/csp.ts` explains the
// choice, `tests/unit/csp.test.ts` asserts both header strings).
//
// The CSP is `Content-Security-Policy-Report-Only` unless `CSP_REPORT_ONLY=false`; the policy
// string is identical either way, so the evidence collected at `/api/csp-report` is evidence
// about the policy that will be enforced.
//
// `inlineHashes` carries exactly one value (TASK-050): the sha256 of the ≤1 KB Consent-Mode
// default-denied bootstrap in `src/lib/consent-bootstrap.ts`, computed here at build time from
// the same constant `<AnalyticsScripts />` emits into the document. It lands in the same PR as
// the script it authorises, because a bootstrap the policy would report is a false negative in
// the whole Report-Only evidence period. `ga4` adds the tag origins only when a measurement id is
// configured — unset in CI, locally and on previews, so no analytics origin widens the policy of
// an environment that loads no tag.
const headerRules = [
  ...noindexHeaderRules(environment),
  // `/media/*` for a year, `immutable` (spec 006 §2.5, §5.4; TASK-079): a variant URL is
  // content-addressed by asset version and width, so a changed image is a new URL and a stale
  // cache entry is impossible. `src/lib/media-headers.ts` carries the reasoning and the
  // crawlability requirement this path puts on spec 007.
  ...mediaCacheHeaderRules(),
  ...securityHeaderRules(environment, {
    reportOnly: cspReportOnly(process.env),
    inlineHashes: [consentBootstrapHash()],
    ga4: ga4MeasurementId(process.env) !== undefined,
    platform,
  }),
];

const nextConfig: NextConfig = {
  // The container of spec 040 §5.3 (AC-8, TASK-098) runs `node server.js` from `.next/standalone`:
  // Next traces the server's dependencies and writes a self-contained tree, so the runtime image
  // carries no development `node_modules`. Vercel ignores this setting, so the cold fallback of
  // ADR-0018 is unaffected.
  output: "standalone",
  headers: () => Promise.resolve(headerRules),
};

// next-intl's *rendering* layer only: the plugin points the library at the request config in
// `src/modules/i18n/request.ts` (spec 003 §5.2, TASK-034). `next-intl/middleware` is neither
// imported here nor anywhere else — it would redirect `/` to a detected locale and set its own
// cookie, which ADR-0006 forbids and `fo/no-geo-redirect` fails the lint on (spec 003 §2, AC-10).
const withNextIntl = createNextIntlPlugin("./src/modules/i18n/request.ts");

// Sentry's build plugin is only applied when a DSN exists, so a Phase 0 build (no DSN, no auth
// token, no Vercel project) needs no network and stays a no-op (spec 001 §5, AC-13).
const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export default sentryDsn
  ? withSentryConfig(withNextIntl(nextConfig), {
      silent: true,
      // Uploading source maps requires SENTRY_AUTH_TOKEN; without it the plugin skips upload.
      sourcemaps: { disable: process.env.SENTRY_AUTH_TOKEN === undefined },
      telemetry: false,
    })
  : withNextIntl(nextConfig);
