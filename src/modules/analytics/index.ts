/** Public barrel for `analytics` (Consent Mode v2 + the gated GA4 tag; GA4 event schema, consent state, server-side events). Owned by: spec 004 (loader), spec 023 (events). */
export { ga4TagUrl } from "./ga4";
export {
  type ConsentCategory,
  type ConsentSources,
  consentPrompt,
  consentSources,
} from "./consent-sources";
export { AnalyticsScripts } from "./ui/AnalyticsScripts";
export {
  type Gtag,
  RESULTS_BUCKETS,
  type ResultsBucket,
  SEARCH_EVENT_NAME,
  type SearchEvent,
  SearchEventSchema,
  resultsBucket,
  searchEvent,
  sendPageAnalytics,
} from "./search-event";
// Spec 047 (TASK-447): the discount code payloads; never the code, nothing for demo or test.
export {
  DISCOUNT_CODE_APPLIED_EVENT,
  DISCOUNT_CODE_REJECTED_EVENT,
  DiscountAppliedEventSchema,
  DiscountRejectedEventSchema,
  PurchaseCouponParamsSchema,
  discountAppliedEvent,
  discountRejectedEvent,
  purchaseCouponParams,
  type DiscountAppliedEvent,
  type DiscountCodeRef,
  type DiscountRejectedEvent,
  type PurchaseCouponParams,
} from "./discount-events";
