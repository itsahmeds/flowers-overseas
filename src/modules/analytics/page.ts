/**
 * The server-rendered GA4 page payload (spec 023 §5.2 "Client events", "How payloads reach the
 * browser"; AC-8 to AC-14; TASK-492).
 *
 * Every builder reads the view model the page renders, so the value in an event is the price on
 * the screen (event price = visible price). The payload is rendered once per document as the
 * `data-fo-analytics` attribute of a hidden element (`ui/PageAnalytics.tsx`); on a cached page the
 * bytes are the same for every visitor, because nothing here reads a cookie or a header.
 *
 * The deferred chunk (`client/deferred.ts`) reads the payload, adds `common` to every event it
 * sends and sends `events` on load. It ships no zod: the schemas below are the unit tests' and the
 * builders' contract.
 */
import { z } from "zod";

import { PAGE_TYPES } from "@/config/analytics";
import { INFO_PAGE_IDS } from "@/config/info-pages";

import { CHECKOUT_CHANNELS } from "./events";
import { GA4_MAX_LIST_ITEMS, type Ga4Item, Ga4ItemSchema } from "./items";
import { toGa4Value } from "./money";

import type { Money } from "@/modules/i18n";

export const PageTypeSchema = z.enum([...PAGE_TYPES, ...INFO_PAGE_IDS]);
export type AnalyticsPageType = z.infer<typeof PageTypeSchema>;

const Country = z.string().regex(/^[A-Z]{2}$/u);
const Currency = z.string().regex(/^[A-Z]{3}$/u);
const Value = z.number().nonnegative().finite();
/** `card`, `apple_pay`, `google_pay`, `link` or another Payment Element type, as Stripe names it. */
const PaymentType = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u);

export const CommonParamsSchema = z.strictObject({
  locale: z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u),
  page_type: PageTypeSchema,
  destination_country: Country.optional(),
  country_status: z.enum(["live", "demo"]).optional(),
  display_currency: Currency.optional(),
});
export type CommonParams = z.infer<typeof CommonParamsSchema>;

const Priced = { currency: Currency, value: Value };
const ListItems = z.array(Ga4ItemSchema).min(1).max(GA4_MAX_LIST_ITEMS);

const CheckoutParams = z.strictObject({
  ...Priced,
  items: z.array(Ga4ItemSchema).min(1),
});

/** The events the server puts on a page, sent once when the payload is read. */
export const PageEventSchema = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("view_item_list"),
    params: z.strictObject({
      item_list_id: z.string().min(1).max(100),
      item_list_name: z.string().min(1).max(100),
      items: ListItems,
    }),
  }),
  z.strictObject({
    name: z.literal("view_item"),
    params: z.strictObject({ ...Priced, items: z.tuple([Ga4ItemSchema]) }),
  }),
  z.strictObject({
    name: z.literal("begin_checkout"),
    params: CheckoutParams.extend({
      checkout_channel: z.enum(CHECKOUT_CHANNELS),
    }),
  }),
  z.strictObject({
    name: z.literal("add_shipping_info"),
    params: CheckoutParams.extend({
      shipping_tier: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u),
      days_ahead: z.number().int().nonnegative(),
    }),
  }),
]);
export type PageEvent = z.infer<typeof PageEventSchema>;

export const PageAnalyticsSchema = z.strictObject({
  common: CommonParamsSchema,
  events: z.array(PageEventSchema).max(2).optional(),
  /** The product page's item per tier, for `select_item_variant` and `add_to_cart`. */
  tiers: z.record(z.string(), Ga4ItemSchema).optional(),
  /** The destination's local date at render, `YYYY-MM-DD`; `days_ahead` counts from it. */
  today: z.iso.date().optional(),
  /** The checkout's quote, the base `add_payment_info` extends at Pay. */
  checkout: CheckoutParams.optional(),
});
export type PageAnalytics = z.infer<typeof PageAnalyticsSchema>;

/**
 * Every event the browser may send (§5.2's table and §14 A-orchestrator-2026-10-25), with the
 * common set merged in. The unit and render tests parse captured events with it.
 */
export const ClientEventSchema = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("page_view"),
    params: CommonParamsSchema.extend({
      page_location: z.url(),
      page_referrer: z.string(),
      page_title: z.string(),
    }),
  }),
  ...PageEventSchema.options.map((option) =>
    option.extend({
      params: option.shape.params.extend(CommonParamsSchema.shape),
    }),
  ),
  z.strictObject({
    name: z.literal("select_item"),
    params: CommonParamsSchema.extend({
      item_list_id: z.string().min(1),
      item_list_name: z.string().min(1),
      items: z.tuple([Ga4ItemSchema]),
    }),
  }),
  z.strictObject({
    name: z.literal("select_item_variant"),
    params: CommonParamsSchema.extend({
      ...Priced,
      items: z.tuple([Ga4ItemSchema]),
    }),
  }),
  z.strictObject({
    name: z.literal("select_delivery_date"),
    params: CommonParamsSchema.extend({
      days_ahead: z.number().int().nonnegative(),
      is_same_day: z.boolean(),
      has_surcharge: z.boolean(),
    }),
  }),
  z.strictObject({
    name: z.literal("add_to_cart"),
    params: CommonParamsSchema.extend({
      ...Priced,
      items: z.tuple([Ga4ItemSchema]),
    }),
  }),
  z.strictObject({
    name: z.literal("add_payment_info"),
    params: CheckoutParams.extend({
      ...CommonParamsSchema.shape,
      payment_type: PaymentType,
    }),
  }),
  z.strictObject({
    name: z.literal("select_payment_method"),
    params: CommonParamsSchema.extend({
      payment_type: z.enum(["apple_pay", "google_pay", "link"]),
      checkout_channel: z.enum(CHECKOUT_CHANNELS),
    }),
  }),
  z.strictObject({
    name: z.literal("login"),
    params: CommonParamsSchema.extend({
      method: z.enum(["email", "google", "apple"]),
    }),
  }),
  z.strictObject({
    name: z.literal("web_vital"),
    params: CommonParamsSchema.extend({
      metric_name: z.enum(["LCP", "CLS", "INP"]),
      metric_value: z.number().int().nonnegative(),
      metric_rating: z.enum(["good", "needs-improvement", "poor"]),
    }),
  }),
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

export interface PageDestination {
  /** ISO 3166-1 alpha-2, any case. */
  readonly iso2: string;
  /** Whether ordering is open there (`live`) or the shop is a demo (`demo`). */
  readonly live: boolean;
  /** The currency the page displays its prices in. */
  readonly currency: string;
}

/** The common parameters of a page: `locale`, `page_type` and, with a destination, its three. */
export function pageCommon(input: {
  readonly locale: string;
  readonly pageType: AnalyticsPageType;
  readonly destination?: PageDestination | undefined;
}): CommonParams {
  const destination = input.destination;
  return CommonParamsSchema.parse({
    locale: input.locale.toLowerCase(),
    page_type: input.pageType,
    ...(destination === undefined
      ? {}
      : {
          destination_country: destination.iso2.toUpperCase(),
          country_status: destination.live ? "live" : "demo",
          display_currency: destination.currency.toUpperCase(),
        }),
  });
}

/** A page payload with no event: every page that only needs its `page_view`. */
export function pageAnalytics(common: CommonParams): PageAnalytics {
  return PageAnalyticsSchema.parse({ common });
}

/** `view_item_list` for a listing: at most 48 items in rendered order, `index` from 0. */
export function listingAnalytics(input: {
  readonly common: CommonParams;
  /** `{country}:{kind}:{key}`, English, the same string for id and name. */
  readonly listKey: string;
  readonly items: readonly Ga4Item[];
}): PageAnalytics {
  const items = input.items
    .slice(0, GA4_MAX_LIST_ITEMS)
    .map((item, index) => ({ ...item, index }));
  return PageAnalyticsSchema.parse({
    common: input.common,
    ...(items.length === 0
      ? {}
      : {
          events: [
            {
              name: "view_item_list",
              params: {
                item_list_id: input.listKey,
                item_list_name: input.listKey,
                items,
              },
            },
          ],
        }),
  });
}

/** The product page: `view_item` for the selected tier and every tier's item for the listeners. */
export function productAnalytics(input: {
  readonly common: CommonParams;
  readonly tiers: Readonly<Record<string, Ga4Item>>;
  readonly selectedTierKey: string;
  readonly price: Money;
  readonly today?: string | undefined;
}): PageAnalytics {
  const selected = input.tiers[input.selectedTierKey];
  return PageAnalyticsSchema.parse({
    common: input.common,
    ...(selected === undefined
      ? {}
      : {
          events: [
            {
              name: "view_item",
              params: {
                currency: input.price.currency,
                value: toGa4Value(input.price),
                items: [selected],
              },
            },
          ],
        }),
    tiers: input.tiers,
    ...(input.today === undefined ? {} : { today: input.today }),
  });
}

/** Which checkout step rendered, and what it adds (spec 023 §14 A-orchestrator-2026-10-25). */
export type CheckoutStepAnalytics =
  | { readonly step: "recipient" }
  | {
      readonly step: "card";
      readonly shippingTier: string;
      readonly daysAhead: number;
    }
  | { readonly step: "details" }
  | { readonly step: "review" };

/**
 * A checkout step in `test` or `live` mode: step 1 `begin_checkout` (`checkout_channel:
 * checkout`), step 2 `add_shipping_info`, step 3 nothing, step 4 the quote `add_payment_info`
 * extends at Pay. `demo` sends no checkout event at all: the caller passes `quote: null`.
 */
export function checkoutAnalytics(input: {
  readonly common: CommonParams;
  readonly quote: {
    readonly total: Money;
    readonly items: readonly Ga4Item[];
  } | null;
  readonly step: CheckoutStepAnalytics;
}): PageAnalytics {
  if (input.quote === null || input.quote.items.length === 0) {
    return pageAnalytics(input.common);
  }
  const base = {
    currency: input.quote.total.currency,
    value: toGa4Value(input.quote.total),
    items: input.quote.items,
  };
  const step = input.step;
  switch (step.step) {
    case "recipient":
      return PageAnalyticsSchema.parse({
        common: input.common,
        events: [
          {
            name: "begin_checkout",
            params: { ...base, checkout_channel: "checkout" },
          },
        ],
      });
    case "card":
      return PageAnalyticsSchema.parse({
        common: input.common,
        events: [
          {
            name: "add_shipping_info",
            params: {
              ...base,
              shipping_tier: step.shippingTier,
              days_ahead: step.daysAhead,
            },
          },
        ],
      });
    case "details":
      return pageAnalytics(input.common);
    case "review":
      return PageAnalyticsSchema.parse({
        common: input.common,
        checkout: base,
      });
  }
}
