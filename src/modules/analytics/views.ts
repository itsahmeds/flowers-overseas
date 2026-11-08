/**
 * Page payloads from the page view models (spec 023 §5.2 "Client events", AC-8 to AC-14;
 * TASK-492). Pure: the caller passes the view model the page renders and the catalogue's GA4
 * facts (`ga4ProductFacts`), so every `price` and `value` is an amount the page shows, through
 * TASK-491's item builder and `toGa4Value`.
 */
import type { Ga4ProductFacts, ListingView, ProductView } from "@/modules/catalog";
import type { StepScreen } from "@/modules/checkout";

import { type Ga4Item, ga4ItemFromProjection, ga4ItemsFromOrderLines } from "./items";
import {
  type AnalyticsPageType,
  checkoutAnalytics,
  listingAnalytics,
  type PageAnalytics,
  pageAnalytics,
  pageCommon,
  productAnalytics,
} from "./page";

const LISTING_PAGE_TYPES: Readonly<Record<ListingView["pageType"], AnalyticsPageType>> = {
  countryShopRoot: "shop_root",
  countryCategory: "country_category",
  countryOccasion: "country_occasion",
  categoryHub: "category_hub",
  occasionHub: "occasion_hub",
  occasionsIndex: "occasions_index",
};

/** A listing: the common set and, on a priced country listing, `view_item_list`. */
export function listingPagePayload(
  view: ListingView,
  facts: ReadonlyMap<string, Ga4ProductFacts>,
): PageAnalytics {
  const country = view.country;
  const currency = view.items[0]?.price.currency;
  const common = pageCommon({
    locale: view.locale,
    pageType: LISTING_PAGE_TYPES[view.pageType],
    destination:
      country === undefined || currency === undefined
        ? undefined
        : { iso2: country.iso2, live: country.orderingOpen, currency },
  });
  if (country === undefined) return pageAnalytics(common);
  const items: Ga4Item[] = [];
  for (const card of view.items) {
    const fact = facts.get(card.productId);
    if (fact === undefined) break;
    items.push(
      ga4ItemFromProjection({
        sku: fact.sku,
        enName: fact.enName,
        categoryKey: fact.categoryKey,
        tierKey: null,
        price: card.price,
        destinationCountry: country.iso2,
      }),
    );
  }
  const kind = view.entity?.kind ?? "shop";
  const key = view.entity?.key ?? "all";
  return listingAnalytics({
    common,
    listKey: `${country.iso2.toUpperCase()}:${kind}:${key}`,
    items,
  });
}

/** The product page: `view_item` for the selected tier, and every tier's item. */
export function productPagePayload(
  view: ProductView,
  fact: Ga4ProductFacts | undefined,
): PageAnalytics {
  const selected = view.tiers.find((tier) => tier.tierKey === view.selectedTierKey);
  if (selected === undefined) {
    return pageAnalytics(pageCommon({ locale: view.locale, pageType: "product" }));
  }
  const common = pageCommon({
    locale: view.locale,
    pageType: "product",
    destination: {
      iso2: view.country.iso2,
      live: view.delivery.state === "live",
      currency: selected.price.currency,
    },
  });
  if (fact === undefined) return pageAnalytics(common);
  const tiers: Record<string, Ga4Item> = {};
  for (const tier of view.tiers) {
    tiers[tier.tierKey] = ga4ItemFromProjection({
      sku: fact.sku,
      enName: fact.enName,
      categoryKey: fact.categoryKey,
      tierKey: tier.tierKey,
      price: tier.price,
      destinationCountry: view.country.iso2,
    });
  }
  return productAnalytics({
    common,
    tiers,
    selectedTierKey: selected.tierKey,
    price: selected.price,
    timeZone: view.delivery.timeZone,
  });
}

/** What the checkout route knows beside the screen. */
export interface CheckoutPayloadContext {
  readonly facts: ReadonlyMap<string, Ga4ProductFacts>;
  /** Each add-on's `en` name, by key. */
  readonly addonNames: ReadonlyMap<string, string>;
  /** Whether the destination is live (`countryConfig(iso2).status === "live"`). */
  readonly live: boolean;
  /** The destination's local today, `YYYY-MM-DD`, for `days_ahead`. */
  readonly today: string;
}

/**
 * A checkout step: `begin_checkout` on step 1, `add_shipping_info` on step 2, nothing on step 3,
 * the quote for Pay on step 4; never an event in `demo` mode (spec 010 §3).
 */
export function checkoutPagePayload(
  screen: StepScreen,
  context: CheckoutPayloadContext,
): PageAnalytics {
  const first = screen.lines[0];
  const total = screen.total;
  const common = pageCommon({
    locale: screen.locale,
    pageType: "checkout",
    destination:
      first === undefined || total === null
        ? undefined
        : { iso2: first.countryIso, live: context.live, currency: total.currency },
  });
  if (screen.mode === "demo" || first === undefined || total === null) {
    return pageAnalytics(common);
  }
  const items: Ga4Item[] = [];
  for (const line of screen.lines) {
    const lines = line.totals?.lines ?? [];
    items.push(
      ...ga4ItemsFromOrderLines(
        lines.map((entry) => {
          if (entry.kind === "addon") {
            return {
              kind: "addon" as const,
              addonKey: entry.addonKey,
              enName: context.addonNames.get(entry.addonKey) ?? entry.addonKey,
              unitPrice: entry.amount,
              quantity: 1,
            };
          }
          const fact = context.facts.get(entry.sku);
          return {
            kind: "product" as const,
            sku: entry.sku,
            enName: fact?.enName ?? entry.sku,
            categoryKey: fact?.categoryKey ?? "product",
            tierKey: entry.tierKey,
            unitPrice: entry.amount,
            quantity: 1,
          };
        }),
        line.countryIso,
      ),
    );
  }
  const quote = { total, items };
  switch (screen.step) {
    case "recipient":
      return checkoutAnalytics({ common, quote, step: { step: "recipient" } });
    case "card": {
      const date = first.deliveryDate;
      const day = screen.calendar.find((entry) => entry.date === date);
      const days =
        date === null
          ? 0
          : Math.max(
              0,
              Math.round((Date.parse(date) - Date.parse(context.today)) / 86_400_000),
            );
      return checkoutAnalytics({
        common,
        quote,
        step: {
          step: "card",
          shippingTier: (day?.surcharge ?? null) === null ? "standard" : "surcharge",
          daysAhead: days,
        },
      });
    }
    case "details":
      return checkoutAnalytics({ common, quote, step: { step: "details" } });
    case "review":
      return checkoutAnalytics({ common, quote, step: { step: "review" } });
  }
}
