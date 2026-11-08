/**
 * The GA4 client's closed lists (spec 023 §5.2 "Common event parameters", "Location sanitising";
 * TASK-492). Data, not copy: GA4 reports are read in English and none of these values is shown to
 * a visitor.
 *
 *  - `PAGE_TYPES`: every `page_type` a localised page may carry. Spec 008's listing kinds in
 *    snake case, spec 009's `product` and the pages spec 023 names; spec 041's info pages join by
 *    their ids in `pageCommon()`. A page outside the union cannot build a payload.
 *  - `PRIVATE_ROUTES`: path templates whose parameter segments are replaced by the parameter name
 *    before any URL reaches GA4 (`/en-gb/track/:token`, `/r/:code`, ...). A private page also
 *    sends its `page_type` instead of its title.
 *  - `ALLOWED_QUERY_KEYS`: the only query keys a sent `page_location` keeps.
 */
// No import: the deferred chunk reads `PRIVATE_ROUTES` and `ALLOWED_QUERY_KEYS`, and an import
// here would carry its module into that chunk. Spec 041's info page ids join `PAGE_TYPES` in
// `src/modules/analytics/page.ts`, on the server.

export const PAGE_TYPES = [
  "home",
  "corridor",
  "shop_root",
  "country_category",
  "country_occasion",
  "category_hub",
  "occasion_hub",
  "occasions_index",
  "product",
  "basket",
  "checkout",
  "checkout_done",
  "tracking",
  "account",
  "search",
  "blog",
  "other",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/**
 * One private route: its literal segments and `:name` parameters, matched anywhere after the
 * locale segment. Every parameter segment is replaced by `:name`.
 */
export const PRIVATE_ROUTES: readonly (readonly string[])[] = [
  ["track", ":token"],
  ["r", ":code"],
  ["basket", "restore", ":token"],
  ["basket", "unsubscribe", ":token"],
  ["account", "orders", ":reference"],
  ["account", "invoices", ":invoice"],
];

/** `step` and the five campaign keys; every other query key is dropped. */
export const ALLOWED_QUERY_KEYS: readonly string[] = [
  "step",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/** Milliseconds `requestIdleCallback` may wait before the deferred chunk is imported anyway. */
export const ANALYTICS_IDLE_TIMEOUT_MS = 4000;
