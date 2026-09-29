import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";
export { captureRequestError } from "@sentry/nextjs";
export const load = () => import("@sentry/nextjs");
export { Sentry };
export type { ErrorEvent };
