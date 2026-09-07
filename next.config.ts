import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { assertEnv } from "./src/lib/env.assert";

// Fail the build before compiling anything when a variable is missing or malformed. The error
// names the offending keys and prints no value (spec 001 AC-10, TASK-005).
assertEnv();

const nextConfig: NextConfig = {};

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
