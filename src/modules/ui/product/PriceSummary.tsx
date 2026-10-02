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
 *  - **sticky** — at ≤390 px the total row docks at the bottom of the viewport. It is the same
 *    element restyled, not a second bar repeating the total (AC-9), so the page still has one
 *    `data-fo-price-total` and one live region.
 *
 * The total sits in an `aria-live="polite"` region, which announces only on change — the one
 * island (TASK-129) swaps it from numbers already in the HTML.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ProductView } from "@/modules/catalog";
import { occasionByKey } from "@/config/catalogue/occasions.data";
import { formatDate, formatMoney } from "@/modules/i18n";

import { instantOf, localeOf, messageFor, zoneCity } from "./labels.ts";
import { tierLabel } from "./TierSelector.tsx";

/**
 * The total row's docked style at the mobile artboard's width (`product-mobile.dc.html`, "Sticky ·
 * docked at the bottom of the viewport"): fixed to the bottom edge, full width, one column, under
 * the language and consent banners' layers. The two arbitrary variants keep room for it on the
 * document itself — `body` padding, so the footer's last line is never under the bar, and `html`
 * scroll padding, so a focused element scrolls clear of it — and apply only while the bar exists.
 */
const DOCKED = [
  "max-[390px]:fixed max-[390px]:start-0 max-[390px]:end-0 max-[390px]:bottom-0",
  "max-[390px]:layer-header max-[390px]:grid-cols-1 max-[390px]:gap-y-[2px]",
  "max-[390px]:border-t-2 max-[390px]:bg-surface-raised max-[390px]:p-md max-[390px]:shadow-md",
  "max-[390px]:[body:has(&)]:pb-[8rem] max-[390px]:[html:has(&)]:scroll-pb-[8rem]",
].join(" ");

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
    | "gallery"
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
      {/* The total row **is** the sticky summary (AC-9: no second money element). At ≤390 px it
          leaves the flow and docks at the bottom of the viewport, restyled, with the size and the
          date beside the amount and the demo sentence (or, live, the cutoff) under it — the two
          lines a buyer would otherwise scroll back for. Those two lines repeat words the summary
          and the picker already say, so they are hidden from the accessibility tree; the amount
          is the one `aria-live` region, announced once. The document keeps room for the bar, so
          it never covers the last line of the page or a focused element (WCAG 2.4.11). */}
      <div
        className={`border-border-emphasis gap-x-md pt-sm grid grid-cols-[minmax(0,1fr)_auto] border-t text-lg ${DOCKED}`}
        data-fo-summary-total
      >
        <span
          className="font-semibold max-[390px]:sr-only"
          id={`${totalId}-label`}
        >
          {product("summary.total")}
        </span>
        <span
          aria-live="polite"
          className="text-end max-[390px]:text-start"
          id={totalId}
        >
          <bdi className="font-semibold tabular-nums" data-fo-price-total>
            {formatMoney(view.price.displayPrice, code)}
          </bdi>
        </span>
        <span
          aria-hidden="true"
          className="text-ink-muted hidden text-xs max-[390px]:block"
          data-fo-summary-docked="selection"
        >
          {[
            ...(tier === undefined ? [] : [tierLabel(t, tier)]),
            ...(date === undefined
              ? []
              : [
                  formatDate(instantOf(date.date), code, "deliveryDate", "UTC"),
                ]),
            catalog("price.inclusive"),
          ].join(" · ")}
        </span>
        <span
          aria-hidden="true"
          className="text-ink-muted hidden text-xs max-[390px]:block"
          data-fo-summary-docked="status"
          {...(live ? { "data-fo-cutoff": "docked" } : {})}
        >
          {live
            ? messageFor(t, view.delivery.noticeKey, {
                country,
                time: view.delivery.cutoffLocal ?? "",
                city:
                  view.delivery.timeZone === undefined
                    ? ""
                    : zoneCity(view.delivery.timeZone),
              })
            : product("demo.heading")}
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
          ships in a vase has nothing this sentence could truthfully exclude. And its reason is
          the photograph ("styled with one"), so it renders only beside a photograph: on the
          no-photo placeholder there is no picture to imply a vase, and the vase stays a priced
          add-on row (TASK-126 E-5, ruled 2026-10-03). */}
      {view.product.vaseIncluded || view.gallery.kind !== "photos" ? null : (
        <p className="text-ink-subtle m-0 text-xs" data-fo-price-excludes>
          {product("excludes")}
        </p>
      )}
    </section>
  );
}
