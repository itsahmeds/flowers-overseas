import {
  CONSENT_BOOTSTRAP_ID,
  CONSENT_BOOTSTRAP_SCRIPT,
  GA4_ID_ATTRIBUTE,
} from "@/lib/consent-bootstrap";

/**
 * The one script element every localised document carries (spec 004 §2 "Consent", AC-18; spec
 * 023 §2 A, AC-4; ADR-0022; TASK-492): the inline Consent Mode v2 **default-denied** bootstrap.
 *
 * A Server Component with no state and no `use client`: the bootstrap must be in the HTML, not
 * added by hydration, so the consent default is in `dataLayer` before anything else runs.
 *
 * **The inline bytes are `CONSENT_BOOTSTRAP_SCRIPT` and nothing else.** Its `'sha256-'` hash is in
 * the CSP `script-src` of every environment (`next.config.ts`, ADR-0016), so the only
 * per-environment value, the measurement id, rides on the `data-fo-ga4` **attribute**, which a
 * hash does not cover. `tests/unit/consent-bootstrap.test.tsx` hashes the rendered markup.
 *
 * **No tag element, in any build.** Consent Mode basic: no Google `<script src>` is served. After
 * an analytics grant the deferred loader (`../client/loader.ts`) reads `data-fo-ga4` and injects
 * `gtag.js` itself, after `load` and idle. No id means no attribute, and then nothing loads.
 */
export function AnalyticsScripts({
  measurementId,
}: {
  /** From `NEXT_PUBLIC_GA4_MEASUREMENT_ID` via `ga4MeasurementId()`; `undefined` while dark. */
  readonly measurementId: string | undefined;
}) {
  return (
    <script
      id={CONSENT_BOOTSTRAP_ID}
      {...(measurementId === undefined
        ? {}
        : { [GA4_ID_ATTRIBUTE]: measurementId })}
      // The one inline script in the application (spec 004 §2), hashed into the CSP.
      dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP_SCRIPT }}
    />
  );
}
