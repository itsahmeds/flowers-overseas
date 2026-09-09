/**
 * The GA4 tag seam (spec 004 §2 "Consent", §5.2, AC-21; TASK-050).
 *
 * Pure and tiny on purpose: the *event* plan, the `consent_state` dimension and the server-side
 * `purchase` event are spec 023's (§3). All that lives here is what Phase 0 needs — the URL of
 * the tag for a configured measurement id, built from the one origin the CSP allowlists, so the
 * policy and the loader cannot name different hosts.
 */
import { GOOGLE_TAG_MANAGER_ORIGIN } from "@/lib/csp";

/** The tag URL for a measurement id. The id is validated by `ga4MeasurementId()` upstream. */
export function ga4TagUrl(measurementId: string): string {
  return `${GOOGLE_TAG_MANAGER_ORIGIN}/gtag/js?id=${measurementId}`;
}
