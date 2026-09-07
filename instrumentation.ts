/**
 * Next server instrumentation (spec 001 §5, TASK-005). Loads the Sentry config for the runtime
 * that is starting; both are no-ops without `SENTRY_DSN`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
