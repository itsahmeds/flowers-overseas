/**
 * The GA4 tag URL (spec 004 §5.2; spec 023 §5.2 "Loading and withdrawal"; TASK-492).
 *
 * Import-free on purpose: the deferred chunk (`client/deferred.ts`) builds the URL it injects
 * after a grant from this file, and nothing else may ride into that chunk. The host is inside the
 * consent-active build's `script-src` source `https://*.googletagmanager.com` (`src/lib/csp.ts`).
 * `tests/unit/url-pii.test.ts` names the URL's line, so keep it where it is.
 */
export const GTAG_SCRIPT_ORIGIN = "https://www.googletagmanager.com";

/** The tag URL for a measurement id. The id is validated by `ga4MeasurementId()` upstream. */
export function ga4TagUrl(measurementId: string): string {
  return `${GTAG_SCRIPT_ORIGIN}/gtag/js?id=${encodeURIComponent(measurementId)}`;
}
