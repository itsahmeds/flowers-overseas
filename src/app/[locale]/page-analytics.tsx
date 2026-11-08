/**
 * The localised pages' GA4 payload elements (spec 023 §5.2 "How payloads reach the browser";
 * TASK-492): thin glue between a page's view model, the catalogue's GA4 facts and
 * `modules/analytics`'s builders. Each renders one hidden `data-fo-analytics` element, the same
 * bytes for every visitor (no cookie, no header read).
 */
import { getTranslations } from "next-intl/server";

import { countryConfig } from "@/config/countries";
import {
  type AnalyticsPageType,
  checkoutPagePayload,
  listingPagePayload,
  PageAnalytics,
  pageAnalytics,
  pageCommon,
  productPagePayload,
} from "@/modules/analytics";
import {
  ga4ProductFacts,
  listAddons,
  type ListingView,
  type ProductView,
} from "@/modules/catalog";
import type { StepScreen } from "@/modules/checkout";
import { instantToWallClock } from "@/modules/i18n";

export async function ListingAnalytics({
  view,
}: {
  readonly view: ListingView;
}) {
  const facts = await ga4ProductFacts(view.items.map((card) => card.productId));
  return <PageAnalytics payload={listingPagePayload(view, facts)} />;
}

export async function ProductAnalytics({
  view,
  now = new Date(),
}: {
  readonly view: ProductView;
  readonly now?: Date;
}) {
  const facts = await ga4ProductFacts([view.product.sku]);
  const zone = view.delivery.timeZone;
  return (
    <PageAnalytics
      payload={productPagePayload(
        view,
        facts.get(view.product.sku),
        zone === undefined ? undefined : localDate(now, zone),
      )}
    />
  );
}

/** `YYYY-MM-DD` of `now` in `zone`, through the formatter module. */
function localDate(now: Date, zone: string): string {
  return instantToWallClock(now, zone).slice(0, 10);
}

/** A page whose only event is its `page_view`. */
export function SimplePageAnalytics({
  locale,
  pageType,
}: {
  readonly locale: string;
  readonly pageType: AnalyticsPageType;
}) {
  return (
    <PageAnalytics payload={pageAnalytics(pageCommon({ locale, pageType }))} />
  );
}

/**
 * A checkout step (`no-store`): `begin_checkout`, `add_shipping_info`, or the quote Pay extends
 * on step 4; nothing in `demo` (spec 023 §14 A-orchestrator-2026-10-25).
 */
export async function CheckoutAnalytics({
  screen,
  now = new Date(),
}: {
  readonly screen: StepScreen;
  readonly now?: Date;
}) {
  const first = screen.lines[0];
  const country =
    first === undefined ? undefined : countryConfig(first.countryIso);
  const [facts, addons, en] = await Promise.all([
    ga4ProductFacts(screen.lines.map((line) => line.sku)),
    first === undefined ? [] : listAddons(first.countryIso),
    getTranslations({ locale: "en" }),
  ]);
  // The add-ons' `en` names, as the server's `purchase` items carry them (spec 023 §5.2 "Items").
  const name = en as unknown as (key: string) => string;
  const today = localDate(now, country?.operations?.ianaZone ?? "UTC");
  return (
    <PageAnalytics
      payload={checkoutPagePayload(screen, {
        facts,
        addonNames: new Map(
          addons.map((addon) => [addon.key, name(addon.nameKey)]),
        ),
        live: country?.status === "live",
        today,
      })}
    />
  );
}
