/**
 * Sentry, edge runtime (edge routes). Spec 001 §5, AC-13, TASK-005.
 * Loaded from `instrumentation.ts`. Inert without a DSN.
 *
 * Since Next 16 runs `proxy` on Node.js, the repo has no edge runtime code today; this config is
 * in place for future edge routes.
 */
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

const options = sentryOptions(process.env.SENTRY_DSN);
if (options) Sentry.init(options);
