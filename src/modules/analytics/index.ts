/** Public barrel for `analytics` (Consent Mode v2 + the gated GA4 tag; GA4 event schema, consent state, server-side events). Owned by: spec 004 (loader), spec 023 (events). */
export { ga4TagUrl } from "./ga4";
// Spec 023 (TASK-491): the GA4 server side and the builders the page payloads share.
export { toGa4Value } from "./money";
export {
  ADDON_ITEM_CATEGORY,
  GA4_MAX_LIST_ITEMS,
  type Ga4Item,
  Ga4ItemSchema,
  type Ga4OrderLine,
  type Ga4ProductProjection,
  ga4ItemFromProjection,
  ga4ItemsFromOrderLines,
  SURCHARGE_ITEM_CATEGORY,
  SURCHARGE_ITEM_ID,
  SURCHARGE_ITEM_NAME,
} from "./items";
export {
  type AnalyticsContext,
  AnalyticsContextSchema,
  type CookieReader,
  GaClientCookieSchema,
  GaSessionCookieSchema,
  gaSessionCookieName,
  readAnalyticsContext,
} from "./context";
export { recordOrderContext } from "./record";
export {
  CHECKOUT_CHANNELS,
  type CheckoutChannel,
  MpPurchaseBodySchema,
  MpRefundBodySchema,
  MpValidationResponseSchema,
} from "./events";
export {
  ANALYTICS_MP_FLAG,
  ANALYTICS_TARGET_NAME,
  ga4OutboxHandler,
  registerAnalyticsOutbox,
} from "./outbox/handler";
export {
  type ConsentCategory,
  type ConsentSources,
  consentPrompt,
  consentSources,
} from "./consent-sources";
export { AnalyticsScripts } from "./ui/AnalyticsScripts";
// Spec 023 (TASK-492): the GA4 client's page payloads and their schemas.
export { PageAnalytics } from "./ui/PageAnalytics";
export {
  type AnalyticsPageType,
  type ClientEvent,
  ClientEventSchema,
  type CommonParams,
  type PageAnalytics as PageAnalyticsPayload,
  PageAnalyticsSchema,
  type PageEvent,
  checkoutAnalytics,
  listingAnalytics,
  pageAnalytics,
  pageCommon,
  productAnalytics,
} from "./page";
export {
  type CheckoutPayloadContext,
  checkoutPagePayload,
  listingPagePayload,
  productPagePayload,
} from "./views";
export {
  isPrivateLocation,
  sanitisePageLocation,
  sanitiseReferrer,
} from "./location";
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
