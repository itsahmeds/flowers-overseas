/**
 * The first-load half of GA4 (spec 023 §5.2 "Loading and withdrawal", AC-1, AC-2, AC-5; ADR-0022;
 * TASK-492). At most 256 B Brotli on every page, so it holds two checks and one `import()`:
 *
 *  1. the bootstrap element carries a measurement id (`data-fo-ga4`); no id, nothing loads;
 *  2. `fo_consent` grants analytics for the current policy version (an unparsable or old-version
 *     value is no consent, as spec 004 parses it);
 *  3. then, after the window `load` event and when the main thread is idle, the deferred chunk
 *     (`./deferred.ts`) is imported and started. It is in no route's initial chunk set.
 *
 * Spec 004's consent loader calls it on every page view, and the consent island calls it again
 * right after a Save that grants analytics, so no reload is needed (a second start is a no-op in
 * the chunk). A Save that withdraws calls `window.__foAnalytics.stop()`.
 *
 * The element id and the attribute are restated, not imported: `src/lib/consent-bootstrap.ts`
 * imports `node:crypto` for its hash and must not reach the browser. `tests/unit/
 * analytics-client.test.ts` pins the two strings to the bootstrap's constants.
 */
import { ANALYTICS_IDLE_TIMEOUT_MS } from "@/config/analytics";

/** Whether `fo_consent` (`name`) grants analytics for `version`. */
export function analyticsGranted(name: string, version: number): boolean {
  const raw = document.cookie.match(`(?:^|; )${name}=([^;]*)`)?.[1] ?? "";
  try {
    const stored = JSON.parse(decodeURIComponent(raw)) as {
      v?: unknown;
      a?: unknown;
    } | null;
    return stored?.v === version && stored.a === true;
  } catch {
    return false;
  }
}

/** Start GA4 when the document has an id and the visitor granted analytics. */
export function startAnalyticsIfGranted(
  cookieName: string,
  policyVersion: number,
): void {
  const id = document
    .getElementById("fo-consent-mode")
    ?.getAttribute("data-fo-ga4");
  if (!id || !analyticsGranted(cookieName, policyVersion)) return;
  const run = (): void => {
    void import("./deferred").then((chunk) => {
      chunk.startDeferred(id);
    });
  };
  const idle = (): void => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(run, { timeout: ANALYTICS_IDLE_TIMEOUT_MS });
    } else {
      setTimeout(run, 1);
    }
  };
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}
