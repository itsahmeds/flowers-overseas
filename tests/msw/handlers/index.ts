/**
 * MSW request-handler barrel (spec 001 §2 "Testing harness", TASK-008).
 *
 * Empty in 001 by design: nothing in the repo makes an outbound HTTP call yet, and the
 * unhandled-request policy is `error` (AC-18), so the first module that does must add its
 * handlers here. Specs 005 (Stripe/Mollie), 006 (Resend) and 007 populate it; keeping one barrel
 * means `tests/msw/server.ts` never changes again.
 */
import type { RequestHandler } from "msw";

export const handlers: readonly RequestHandler[] = [];
