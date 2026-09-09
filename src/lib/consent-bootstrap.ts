/**
 * The one inline script in the application: the Consent Mode v2 **default-denied** bootstrap
 * (spec 004 §2 "Consent", §5.2, §8, AC-18, ADR-0016; TASK-050).
 *
 * Kept in `src/lib` and free of any Next or React import for the same reason as `csp.ts`:
 * `next.config.ts` computes the `'sha256-'` hash from `CONSENT_BOOTSTRAP_SCRIPT` at build time,
 * in plain Node, while `src/modules/analytics/ui/AnalyticsScripts.tsx` emits the identical bytes
 * into the document. One constant, two consumers, no way for the hash and the script to disagree
 * — and `tests/unit/consent-bootstrap.test.tsx` hashes the *rendered* markup to prove it.
 *
 * ## Why the measurement id is an attribute and not part of the script
 *
 * A CSP hash covers the script's **text content** and not its attributes. Interpolating the GA4
 * id into the source would make the hashed bytes depend on an environment variable, so the policy
 * would have to be recomputed per environment and a preview with the id set would report a
 * violation on the production hash. Instead the id rides on `data-fo-ga4` and the script reads it
 * from `document.currentScript`: the hashed bytes are a compile-time constant in every
 * environment, and the ordering guarantee that matters — consent default *before* `config` —
 * holds inside a single synchronous block.
 *
 * ## What it does, in order
 *
 *  1. creates `dataLayer` and publishes `window.gtag`, so the banner island (TASK-051) has
 *     something to call `gtag('consent','update',…)` on;
 *  2. sets the Consent Mode v2 **default**: the four ad/analytics signals denied,
 *     `functionality_storage` and `personalization_storage` denied, `security_storage` granted
 *     (the one signal it is honest to grant — it covers storage that is strictly necessary), and
 *     `wait_for_update` so a tag that loads before the visitor answers waits instead of guessing;
 *  3. switches `url_passthrough` off (no consent state in our URLs — `CLAUDE.md`: no PII in URLs)
 *     and `ads_data_redaction` on, which is the pre-consent behaviour §8 promises;
 *  4. only if `data-fo-ga4` is present, queues `js` and `config` for the tag that follows.
 *
 * With no id, steps 1–3 still run: `dataLayer` carries a default-denied entry on every localised
 * document, which is exactly what AC-18 asserts and what makes Phase 0 AC 7 true the moment the
 * founder pastes an id in.
 */
import { createHash } from "node:crypto";

/** The attribute the measurement id rides on. Not part of the hashed bytes (see above). */
export const GA4_ID_ATTRIBUTE = "data-fo-ga4";

/** `id` of the inline element, so a test and a reviewer can find it in a document. */
export const CONSENT_BOOTSTRAP_ID = "fo-consent-mode";

/** The number §5.2's "a hash on one tiny inline block" argument rests on. */
export const CONSENT_BOOTSTRAP_MAX_BYTES = 1024;

/**
 * The Consent Mode v2 default. Exported so the settings panel, the docs and the tests read the
 * same object the script is built from — a `denied` that existed only inside a string literal
 * would be a promise instead of a fact.
 */
export const CONSENT_DEFAULT_SIGNALS = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
  functionality_storage: "denied",
  personalization_storage: "denied",
  security_storage: "granted",
  /** Milliseconds a tag waits for `consent update` before acting on the default. */
  wait_for_update: 500,
} as const;

/**
 * The exact bytes emitted into the document and hashed into `script-src`. Minified by hand
 * rather than by a build step, because a build step that changed one byte would silently
 * invalidate the hash of a cached page.
 */
export const CONSENT_BOOTSTRAP_SCRIPT =
  `!function(){var w=window;w.dataLayer=w.dataLayer||[];` +
  `function g(){w.dataLayer.push(arguments)}w.gtag=g;` +
  `g("consent","default",${JSON.stringify(CONSENT_DEFAULT_SIGNALS)});` +
  `g("set","url_passthrough",false);g("set","ads_data_redaction",true);` +
  `var s=document.currentScript,i=s&&s.getAttribute("${GA4_ID_ATTRIBUTE}");` +
  `if(i){g("js",new Date());g("config",i)}}();`;

/**
 * The `'sha256-'` source expression for `script-src`, base64 as the CSP grammar wants it and
 * without the surrounding quotes (`cspValue()` adds those). Computed from the constant above, so
 * editing the script and forgetting the policy is not a reachable state.
 */
export function consentBootstrapHash(): string {
  const digest = createHash("sha256")
    .update(CONSENT_BOOTSTRAP_SCRIPT, "utf8")
    .digest("base64");
  return `sha256-${digest}`;
}
