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
 *  - **demo** — no purchase affordance at all (§13 Q6, Q7): "Ordering is not open yet" stands where
 *    a button would, with the reason beside it while the destination has no florist. No disabled
 *    button: a greyed-out button is a promise with an excuse attached.
 *
 * The total sits in an `aria-live="polite"` region, which announces only on change — the one
 * island (TASK-129) swaps it from numbers already in the HTML.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ProductView } from "@/modules/catalog";
import { occasionByKey } from "@/config/catalogue/occasions.data";
import { formatDate, formatMoney } from "@/modules/i18n";

import { instantOf, localeOf, messageFor } from "./labels.ts";
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
    | "delivery"
    | "product"
  >;
  /** The destination's name in this locale. */
  readonly country: string;
  /** The id of the live region, so a page can point the island at it. */
  readonly totalId?: string;
}

export function PriceSummary({
  view,
  country,
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
  const live = view.delivery.state === "live";

  const row = "contents";
  const muted = "text-ink-subtle";

  return (
    <section
      aria-labelledby={`${totalId}-label`}
      className="border-border-emphasis p-md flex flex-col gap-[6px] border-2"
      data-fo-price-summary
      data-fo-fx-state={view.fx.state}
    >
      <dl className="gap-x-md m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-y-[6px] text-sm">
        {tier === undefined ? null : (
          <div className={row} data-fo-summary-row="tier">
            <dt>{tierLabel(t, tier)}</dt>
            <dd className="m-0 text-end tabular-nums">
              <bdi>{formatMoney(tier.price, code)}</bdi>
            </dd>
          </div>
        )}
        {date === undefined || fee === undefined ? null : (
          <div className={row} data-fo-summary-row="surcharge">
            <dt>
              {[
                ...date.occasionKeys.map((key) =>
                  messageFor(t, occasionByKey(key).labelKey),
                ),
                formatDate(instantOf(date.date), code, "deliveryDate", "UTC"),
              ].join(" · ")}
            </dt>
            <dd className="m-0 text-end tabular-nums">
              <bdi>{formatMoney(fee, code, { signDisplay: "always" })}</bdi>
            </dd>
          </div>
        )}
        <div className={row} data-fo-summary-row="delivery">
          <dt className={muted}>{product("summary.delivery")}</dt>
          <dd className={`${muted} m-0 text-end`}>{product("included")}</dd>
        </div>
        <div className={row} data-fo-summary-row="vat">
          <dt className={muted}>
            {product("vat", { rate: view.price.vatRateText })}
          </dt>
          <dd className={`${muted} m-0 text-end`}>{product("included")}</dd>
        </div>
      </dl>
      <div className="border-border-emphasis gap-x-md pt-sm grid grid-cols-[minmax(0,1fr)_auto] border-t text-lg">
        <span className="font-semibold" id={`${totalId}-label`}>
          {product("summary.total")}
        </span>
        <span aria-live="polite" className="text-end" id={totalId}>
          <bdi className="font-semibold tabular-nums" data-fo-price-total>
            {formatMoney(view.price.displayPrice, code)}
          </bdi>
        </span>
      </div>
      {view.fx.noticeKey === undefined ? null : (
        <p className="text-ink-muted m-0 text-sm" data-fo-fx-notice>
          {catalog("availability.fxUnavailable")}
        </p>
      )}
      <p className="text-ink-muted m-0 text-sm">{catalog("price.inclusive")}</p>
      <div
        className="border-warning mt-sm p-md flex flex-col gap-[2px] border"
        data-fo-demo-summary
      >
        <p className="m-0 text-sm font-semibold">{product("demo.heading")}</p>
        {live ? null : (
          <p className="text-ink-muted m-0 text-xs">
            {product("demo.body", { country })}
          </p>
        )}
      </div>
      {/* "What the price does not include" names the vase, so it renders only where the vase is
          not in the price — the 76 of 84 products `vaseIncluded: false` marks. A product that
          ships in a vase has nothing this sentence could truthfully exclude. */}
      {view.product.vaseIncluded ? null : (
        <p className="text-ink-subtle m-0 text-xs" data-fo-price-excludes>
          {product("excludes")}
        </p>
      )}
    </section>
  );
}
