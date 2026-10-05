import path from "node:path";

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

import { consentBootstrapHash } from "./src/lib/consent-bootstrap";
import { securityHeaderRules } from "./src/lib/csp";
import { assertBuildEnv } from "./src/lib/env.assert";
import { listingCacheHeaderRules } from "./src/lib/listing-cache-headers";
import {
  listingRewriteRules,
  parameterRouteHeaderRules,
} from "./src/lib/listing-rewrites";
import {
  appEnvironment,
  ga4MeasurementId,
  hostPlatform,
} from "./src/lib/env.schema";
import {
  mediaCacheHeaderRules,
  mediaHeaderRules,
} from "./src/lib/media-headers";
import { noindexHeaderRules } from "./src/lib/robots-headers";
import { rootRedirectRules } from "./src/lib/root-redirect";

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

// The host, for the two things it decides: whether `vercel.live` belongs in the policy (§5.2,
// AC-6), and whether the build emits standalone output (below, TASK-135). Both are properties of
// the deploying toolchain rather than of the product — a Vercel preview and a Railway staging
// deploy can share an `APP_ENV`, so `appEnvironment()` cannot express either. **No application
// behaviour may branch on the host**; that rule (spec 040 §5.2) is about what the product does,
// not about how it is packaged.
const platform = hostPlatform(process.env);

// Security headers on every path, per environment (spec 004 §5.2, AC-23, **ADR-0016**;
// TASK-046). `headers()` rather than `src/proxy.ts` because it is applied to cached responses
// too — which is the response class an SSG/ISR site is made of — and because a static config
// value can be asserted from a unit test without a running server (`src/lib/csp.ts` explains the
// choice, `tests/unit/csp.test.ts` asserts both header strings).
//
// This static CSP is always `Content-Security-Policy-Report-Only` (TASK-058). The **enforced**
// policy is per cached document — this same string plus the hashes of that document's flight
// blocks, and of no other inline script — written by the `cacheHandler` below when the server
// runs with `CSP_REPORT_ONLY=false` (`src/lib/csp-response.ts`, spec 004 §14 A2).
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
  // `/media/*` for a year, `immutable` (spec 006 §2.5, §5.4; TASK-079): since TASK-138 this
  // origin serves only the `hero` slot's committed variants (founder, 2026-10-03, option (a)),
  // and every other photograph carries the same value as metadata on its object in the bucket.
  ...mediaCacheHeaderRules(),
  // The connection hint for the media origin that serves every other photograph — same
  // `MEDIA_ORIGIN` constant as the `img-src` below and as every bucket URL, and a response header
  // rather than a `<link>` because nothing rendered into `<head>` can be emitted ahead of an image
  // preload (`src/lib/media-headers.ts` has the measurements).
  ...mediaHeaderRules(),
  // The country shop root's parameterised requests are rendered per request (the rewrite below
  // sends `?page=`/`?sort=`/a facet to the parameter route; its bare URL is prebuilt) and every
  // response at that address is cached at the edge by full URL for an hour, stale-while-revalidate for a day — spec 008 §5.4 and §13 Q2 as
  // the founder resolved them, under ADR-0018's single replica behind Cloudflare. The sources
  // name each locale's own shop segment, so no other page type's caching changes
  // (`src/lib/listing-cache-headers.ts` carries the reasoning; TASK-114).
  ...listingCacheHeaderRules(),
  // `X-Robots-Tag: noindex, nofollow` on a **direct** request to the internal parameter route
  // (`/{locale}/_query/…`); a request rewritten there keeps the address it was asked for, which
  // this source does not match. After `noindexHeaderRules()`, so its value is the one served on a
  // direct hit (`src/lib/listing-rewrites.ts`; TASK-170, `/review 143`).
  ...parameterRouteHeaderRules(),
  ...securityHeaderRules(environment, {
    inlineHashes: [consentBootstrapHash()],
    ga4: ga4MeasurementId(process.env) !== undefined,
    platform,
  }),
];

const nextConfig: NextConfig = {
  // The FX snapshot `scripts/build.ts` fetched for this build (spec 005 §14 A7 Corrected 2;
  // TASK-181), inlined into the bundle so `process.env.FX_BUILD_SNAPSHOT` in
  // `src/modules/catalog/static/index.ts` is a constant in the running deployment: no request
  // reads it from the environment and none fetches a rate. Empty — the committed snapshot — for
  // `next dev`, a bare `next build`, and every build whose fetch failed. Public data only: a date
  // and ten integer rates.
  env: { FX_BUILD_SNAPSHOT: process.env.FX_BUILD_SNAPSHOT ?? "" },
  // The container of spec 040 §5.3 (AC-8, TASK-098) runs `node server.js` from `.next/standalone`:
  // Next traces the server's dependencies and writes a self-contained tree, so the runtime image
  // carries no development `node_modules`.
  //
  // **Not on Vercel.** TASK-098 shipped this unconditionally on the claim that "Vercel ignores this
  // setting"; it does not. Vercel runs its own tracer in `onBuildComplete` and reads
  // `.next/next-server.js.nft.json`, which standalone output does not leave at that path, so every
  // deployment after `d0a1d66` failed with `ENOENT … next-server.js.nft.json` — compiled, generated
  // all 31 static pages, then died at the last step, freezing the demo URL of ADR-0018 on its last
  // good build. `hostPlatform()` is the one host axis spec 040 §5.2 allows to exist, and this is a
  // build-output shape rather than application behaviour, so branching on it here is inside that
  // build-output shape, recorded as spec 040 §14 A2. Pinned by `tests/unit/container.test.ts`.
  ...(platform === "vercel" ? {} : { output: "standalone" as const }),
  headers: () => Promise.resolve(headerRules),
  // The enforced Content-Security-Policy of every cached HTML document (spec 004 §14 A2,
  // ADR-0016; TASK-058). Next's own file-system cache, extended to stamp each `APP_PAGE` entry
  // with the static policy above plus the `'sha256-…'` of that document's flight blocks — the
  // one place the HTML and its headers meet before either is sent. A hash describes bytes, so it
  // is cached with them; no nonce is ever put in cached HTML. Switched on at run time by
  // `CSP_REPORT_ONLY=false`. Next `import()`s it unbundled, on Node's type stripping; traced into the
  // standalone output by Next. **Not on Vercel**, where the platform serves prerenders itself and
  // never consults this handler — so the cold fallback stays Report-Only, which is recorded in
  // `docs/runbooks/csp-enforce.md`.
  ...(platform === "vercel"
    ? {}
    : {
        cacheHandler: path.join(process.cwd(), "src/lib/csp-cache-handler.ts"),
      }),
  // `/` answers one permanent 308 to the x-default locale home, identical for every request: no
  // `has`, no `missing`, nothing read about the visitor, so it is not a geo-redirect (ADR-0006)
  // and the response needs no `Vary` (spec 003 §14 A16 clause 1; TASK-119). It is the only
  // redirect in the application, and `src/lib/root-redirect.ts` says why it lives here and not in
  // `src/proxy.ts` or at the edge.
  redirects: () => Promise.resolve(rootRedirectRules()),
  // A country shop root request carrying a parameter the listing honours is answered by the
  // internal parameter route, so no route file reads the query string and the depth-3 route stays
  // prebuilt — which is what keeps the router's `dynamicParams = false` gate, and so the localised
  // `lang` 404, at that depth (spec 003 AC-8, spec 008 §5.4; TASK-170 E-1, option (a)).
  // `beforeFiles`: before the filesystem routes match, after `src/proxy.ts`. No redirect, and the
  // address in the browser does not change (`src/lib/listing-rewrites.ts`).
  rewrites: () =>
    Promise.resolve({
      beforeFiles: listingRewriteRules(),
      afterFiles: [],
      fallback: [],
    }),
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
