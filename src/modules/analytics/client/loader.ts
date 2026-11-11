/**
 * The first-load half of GA4 (spec 023 §5.2 "Loading and withdrawal", AC-1, AC-2, AC-5; ADR-0022;
 * TASK-492). At most 256 B Brotli on every page, so it holds two checks and one `import()`:
 *
 *  1. the build has a measurement id and the bootstrap element carries it (`data-fo-ga4`); no
 *     id, nothing loads;
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
type Stored = { v?: unknown; a?: unknown } | null;

/** Whether `fo_consent` (`name`) grants analytics for `version`. */
export function analyticsGranted(name: string, version: number): boolean {
  let stored: Stored = null;
  try {
    stored = JSON.parse(
      decodeURIComponent(
        document.cookie.match(`(?:^|; )${name}=([^;]*)`)?.[1] ?? "",
      ),
    ) as Stored;
  } catch {
    // No cookie, or a forged or truncated one: no consent.
  }
  return stored?.v === version && stored.a === true;
}

/**
 * Start GA4 when the document has an id and the visitor granted analytics. The build without a
 * measurement id compiles the body away (`next.config.ts` inlines the id, empty when unset), so it
 * ships no loader and no `import()` at all; the same build-time value decides the CSP sources.
 */
export function startAnalyticsIfGranted(
  cookieName: string,
  policyVersion: number,
): void {
  if (!process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) return;
  const id = document
    .getElementById("fo-consent-mode")
    ?.getAttribute("data-fo-ga4");
  if (!id || !analyticsGranted(cookieName, policyVersion)) return;
  const run = (): void => {
    void import("./deferred").then((chunk) => {
      chunk.startDeferred(id);
    });
  };
  // After `load`, then when the main thread is idle (a bare timeout where idle callbacks are
  // missing).
  const idle = (): void => {
    (window.requestIdleCallback ?? setTimeout)(run);
  };
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}
