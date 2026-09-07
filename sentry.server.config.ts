/**
 * Sentry, node runtime (spec 001 §5, AC-13, TASK-005). Loaded from `instrumentation.ts`.
 * No DSN ⇒ `Sentry.init` is never called ⇒ `Sentry.getClient()` is `undefined`.
 */
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

const options = sentryOptions(process.env.SENTRY_DSN);
if (options) Sentry.init(options);
