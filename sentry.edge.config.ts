/**
 * Sentry, edge runtime (edge routes). Spec 001 §5, AC-13, TASK-005.
 * Loaded from `instrumentation.ts`. Inert without a DSN.
 */
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

const options = sentryOptions(process.env.SENTRY_DSN);
if (options) Sentry.init(options);
