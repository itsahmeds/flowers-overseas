import {
  CONSENT_BOOTSTRAP_ID,
  CONSENT_BOOTSTRAP_SCRIPT,
  GA4_ID_ATTRIBUTE,
} from "@/lib/consent-bootstrap";

import { ga4TagUrl } from "../ga4";

/**
 * The two script elements every localised document carries (spec 004 §2 "Consent", §5.2, AC-18,
 * AC-21; TASK-050): the inline Consent Mode v2 **default-denied** bootstrap, and — only when a
 * measurement id is configured — the GA4 tag that follows it.
 *
 * A Server Component with no state and no `use client`: the bootstrap must be in the HTML, not
 * added by hydration, or the first paint of a cached page would have no consent default in
 * `dataLayer` and a tag could act on a guess.
 *
 * ## Three decisions worth reading before editing this file
 *
 * **The inline bytes are `CONSENT_BOOTSTRAP_SCRIPT` and nothing else.** Its `'sha256-'` hash is in
 * the CSP `script-src` of every environment (`next.config.ts`, ADR-0016). Interpolating anything
 * into the text — a locale, an id, a version — invalidates the hash for every cached page, so the
 * only per-environment value, the measurement id, rides on the `data-fo-ga4` **attribute**, which
 * a hash does not cover. `tests/unit/consent-bootstrap.test.tsx` hashes the rendered markup.
 *
 * **`defer`, not `async`.** React 19 hoists `<script async src>` into `<head>`, which would let
 * `gtag.js` execute *before* an inline block that sits later in the document — and a tag that
 * runs before the consent default is a tag that decided for itself. `defer` preserves document
 * order at the cost of a slightly later first ping, which is the right trade for a tag that is
 * unset in Phase 0 anyway.
 *
 * **No id means no element.** Not a disabled tag, not a `dataLayer` stub pointing at Google: the
 * `<script src>` is absent, which is what makes AC-21's "zero requests to googletagmanager.com"
 * a property of the document rather than of a network mock.
 */
export function AnalyticsScripts({
  measurementId,
}: {
  /** From `NEXT_PUBLIC_GA4_MEASUREMENT_ID` via `ga4MeasurementId()`; `undefined` in Phase 0. */
  readonly measurementId: string | undefined;
}) {
  return (
    <>
      <script
        id={CONSENT_BOOTSTRAP_ID}
        {...(measurementId === undefined
          ? {}
          : { [GA4_ID_ATTRIBUTE]: measurementId })}
        // The one inline script in the application (spec 004 §2), hashed into the CSP.
        dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP_SCRIPT }}
      />
      {measurementId === undefined ? null : (
        <script src={ga4TagUrl(measurementId)} defer />
      )}
    </>
  );
}
