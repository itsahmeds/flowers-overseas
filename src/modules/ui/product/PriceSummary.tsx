/**
 * `PriceSummary` — the one all-in amount (spec 009 §2 "All-in price", §5.3, §8, AC-9, AC-21;
 * `docs/design/system/components.dc.html` "Price summary block"; TASK-126, TASK-127).
 *
 * **It computes no money.** Every figure is read off the view model and formatted by
 * `formatMoney`: the selected tier's own price (`TierOption.price`), the selected date's fee
 * (`DeliveryDate.surcharge`, the difference of two projected totals), and the total, which is
 * `priceProjection().displayPrice` — the amount `ProductViewSchema` proves equals the selected
 * configuration's entry in the totals table. So the total cannot disagree with the chip that was
 * printed before the date was chosen (AC-9), and there is exactly one "You pay".
 *
 * The rows name what the price already contains — delivery, and VAT at the flowers' own rate — as
 * rows, never as additions; a surcharge is a **line**, because it was on the chip first. The
 * states:
 *
 *  - **normal** — tier row, delivery and VAT rows, "You pay", the inclusive formula.
 *  - **with surcharge** — the date's line ("Women's Day, Mon 8 Mar · +£5.00") before the rows.
 *  - **stale FX** — the projection fell back to the destination's currency, and the page says so
 *    in `catalog.availability.fxUnavailable`'s own words.
 *
 * **v3 (spec 009 §14 A12; TASK-197): this is "The price" section below the action.** The primary
 * action (Phase 0: the "Ordering is not open yet" status and the demo sentence) moved up into the
 * buy section (`BuyAction`), and the phone's sticky element is spec 004 AC-48's `StickyActionBar`,
 * so the total row no longer docks: it stays in the flow. The equivalents line lives here, and
 * only here, for the product (A12 move 2).
 *
 * The total sits in an `aria-live="polite"` region, which announces only on change. **The size
 * follows the buyer** (spec 009 §14 A12, AC-31; TASK-228): the tier row's label and price, the
 * equivalents line and the total are `data-fo-tier-slot`s, which the page's one island fills from
 * the strings the server printed on the chosen size's radio, never from arithmetic.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ProductView } from "@/modules/catalog";
import { occasionByKey } from "@/config/catalogue/occasions.data";
import { formatDate, formatMoney } from "@/modules/i18n";

import { instantOf, localeOf, messageFor } from "./labels.ts";
import { equivalentsMessageValues } from "../shop/equivalents.ts";

import { tierLabel } from "./TierSelector.tsx";

export interface PriceSummaryProps {
  readonly view: Pick<
    ProductView,
    | "locale"
    | "tiers"
    | "selectedTierKey"
    | "selectedDate"
    | "price"
    | "fx"
    | "equivalents"
    | "delivery"
    | "product"
    | "gallery"
  >;
  /** The id of the live region, so a page can point the island at it. */
  readonly totalId?: string;
}

export function PriceSummary({
  view,
  totalId = "price-total",
}: PriceSummaryProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const catalog = useTranslations("catalog");
  const code = localeOf(view.locale);

  const tier = view.tiers.find(
    (option) => option.tierKey === view.selectedTierKey,
  );
  const date =
    view.selectedDate === undefined
      ? undefined
      : view.delivery.dates.find((day) => day.date === view.selectedDate);
  const fee = date?.surcharge;

  // v2 (product artboards, "the summary"): a butter panel of rows — the included ones in leaf, a
  // fee in poppy-strong — and the total in Fraunces; the demo sentence sits under the panel on a
  // sunflower rule, where Send will stand in spec 010.
  const row = "flex justify-between gap-[16px]";
  const included = "text-included m-0 text-end font-bold";

  return (
    <section
      aria-labelledby={`${totalId}-label`}
      className="flex flex-col"
      data-fo-price-summary
      data-fo-fx-state={view.fx.state}
    >
      <div className="bg-butter rounded-photo flex flex-col px-[22px] pt-[22px] pb-[18px]">
        <dl className="text-ui m-0 grid gap-[8px]">
          {tier === undefined ? null : (
            <div className={row} data-fo-summary-row="tier">
              <dt className="text-ink-muted" data-fo-tier-slot="label">
                {tierLabel(t, tier)}
              </dt>
              <dd className="m-0 text-end tabular-nums">
                <bdi data-fo-tier-slot="price">
                  {formatMoney(tier.price, code)}
                </bdi>
              </dd>
            </div>
          )}
          <div className={row} data-fo-summary-row="delivery">
            <dt className="text-ink-muted">{product("summary.delivery")}</dt>
            <dd className={included}>{product("included")}</dd>
          </div>
          <div className={row} data-fo-summary-row="vat">
            <dt className="text-ink-muted">
              {product("vat", { rate: view.price.vatRateText })}
            </dt>
            <dd className={included}>{product("included")}</dd>
          </div>
          {date === undefined || fee === undefined ? null : (
            <div className={row} data-fo-summary-row="surcharge">
              <dt className="text-ink-muted">
                {[
                  ...date.occasionKeys.map((key) =>
                    messageFor(t, occasionByKey(key).labelKey),
                  ),
                  formatDate(instantOf(date.date), code, "deliveryDate", "UTC"),
                ].join(" · ")}
              </dt>
              <dd className="text-accent-strong m-0 text-end font-bold tabular-nums">
                <bdi>{formatMoney(fee, code, { signDisplay: "always" })}</bdi>
              </dd>
            </div>
          )}
        </dl>
        {/* The product's one approximate-equivalents line (spec 009 §14 A12 move 2, AC-31): it
            left the price line for this section, beside the tier row, and converts the selected
            tier's price (`priceEquivalents()` at the page's one clock), absent when any leg is
            stale or the price is the destination-currency fallback (004 A21 clause 6 (d)). */}
        {view.equivalents.price === undefined ? null : (
          <p
            className="num text-ink-subtle m-0 mt-[8px] text-xs leading-[1.35]"
            data-fo-price-equivalents
            data-fo-tier-slot="equivalents"
          >
            {catalog(
              "price.equivalents",
              equivalentsMessageValues(view.equivalents.price, code),
            )}
          </p>
        )}
        {/* The one total, in the flow (v3: the phone's sticky element is spec 004 AC-48's bar,
            whose price is the selected tier's, from the same projection). The amount is the one
            `aria-live` region, announced once. */}
        <div
          className="border-rule mt-[14px] grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[16px] border-t pt-[14px]"
          data-fo-summary-total
        >
          <span className="font-bold" id={`${totalId}-label`}>
            {product("summary.total")}
          </span>
          <span aria-live="polite" className="text-end" id={totalId}>
            <bdi
              className="display num text-[32px] leading-[1.1]"
              data-fo-price-total
              data-fo-tier-slot="total"
            >
              {formatMoney(view.price.displayPrice, code)}
            </bdi>
          </span>
        </div>
        <p className="text-ink-muted m-0 mt-[6px] text-sm">
          {catalog("price.inclusive")}
        </p>
        {view.fx.noticeKey === undefined ? null : (
          <p className="text-ink-muted m-0 mt-[8px] text-sm" data-fo-fx-notice>
            {catalog("availability.fxUnavailable")}
          </p>
        )}
      </div>
    </section>
  );
}
