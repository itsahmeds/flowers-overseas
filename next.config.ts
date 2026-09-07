import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { assertEnv } from "./src/lib/env.assert";
import { deploymentEnvironment } from "./src/lib/env.schema";
import { noindexHeaderRules } from "./src/lib/robots-headers";

// Fail the build before compiling anything when a variable is missing or malformed. The error
// names the offending keys and prints no value (spec 001 AC-10, TASK-005).
assertEnv();

// `X-Robots-Tag: noindex` on every response outside production, permanently: previews and
// staging are never indexable (spec 001 §2, §6, AC-15, TASK-006). Production gets no header here
// — `src/app/robots.ts` and the root `noindex` meta cover the 001 production alias, and spec 007
// lifts exactly those two. `/api/*` sets its own `X-Robots-Tag` in every environment
// (`src/lib/health.ts`).
const headerRules = noindexHeaderRules(deploymentEnvironment(process.env));

const nextConfig: NextConfig = {
  headers: () => Promise.resolve(headerRules),
};

// Sentry's build plugin is only applied when a DSN exists, so a Phase 0 build (no DSN, no auth
// token, no Vercel project) needs no network and stays a no-op (spec 001 §5, AC-13).
const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export default sentryDsn
  ? withSentryConfig(nextConfig, {
      silent: true,
      // Uploading source maps requires SENTRY_AUTH_TOKEN; without it the plugin skips upload.
      sourcemaps: { disable: process.env.SENTRY_AUTH_TOKEN === undefined },
      telemetry: false,
    })
  : nextConfig;
