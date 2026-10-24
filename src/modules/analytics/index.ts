/** Public barrel for `analytics` (Consent Mode v2 + the gated GA4 tag; GA4 event schema, consent state, server-side events). Owned by: spec 004 (loader), spec 023 (events). */
export { ga4TagUrl } from "./ga4";
export {
  type ConsentCategory,
  type ConsentSources,
  consentPrompt,
  consentSources,
} from "./consent-sources";
export { AnalyticsScripts } from "./ui/AnalyticsScripts";
