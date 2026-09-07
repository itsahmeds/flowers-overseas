/**
 * Sentry, browser (spec 001 §5, AC-13, TASK-005).
 *
 * Only `NEXT_PUBLIC_SENTRY_DSN` is readable in the browser bundle. Next ≥ 15.3 loads the client
 * SDK from `instrumentation-client.ts`, which imports this module, so the file name convention of
 * spec 001 §5 is kept while the SDK gets the entrypoint it expects.
 */
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

const options = sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN);
if (options) Sentry.init(options);
