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
 *  - **sticky** — below `sm` (the 390 px artboard) the total row docks at the bottom of the
 *    viewport. It is the same element restyled, not a second bar repeating the total (AC-9), so the
 *    page still has one `data-fo-price-total` and one live region.
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
 * The total row's docked style below the `sm` breakpoint (640 px), which holds the 390 px mobile
 * artboard (`product-mobile.dc.html`, "Sticky · docked at the bottom of the viewport") and every
 * phone: fixed to the bottom edge, full width, one column, under the language and consent banners'
 * layers. A named breakpoint, not `max-[390px]:` — an arbitrary media variant once compiled this
 * project's stylesheet down to its base layer (`SiteHeader.tsx`, TASK-048). The two arbitrary variants keep room for it on the
 * document itself — `body` padding, so the footer's last line is never under the bar, and `html`
 * scroll padding, so a focused element scrolls clear of it — and apply only while the bar exists.
 */
const DOCKED = [
  "max-sm:fixed max-sm:start-0 max-sm:end-0 max-sm:bottom-0 max-sm:m-0",
  "max-sm:layer-header max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:gap-y-[2px]",
  "max-sm:border-t max-sm:border-rule max-sm:bg-card max-sm:px-(--gutter-s) max-sm:py-[12px] max-sm:shadow-sticky",
  "max-sm:[body:has(&)]:pb-[8rem] max-sm:[html:has(&)]:scroll-pb-[8rem]",
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
  /**
   * The approximate equivalents line under the total (spec 004 §14 A21 clause 6), finished by the
   * caller. Absent — a stale rate, the destination-currency fallback, or no helper yet — renders
   * nothing at all.
   */
  readonly equivalents?: string | undefined;
  /**
   * Whether the total row docks below `sm` (the 390 px artboard). A page has one summary and
   * docks it; a surface that renders several side by side (`/dev/components`) passes `false`, or
   * its bars would stack.
   */
  readonly dock?: boolean;
}

export function PriceSummary({
  view,
  country,
  totalId = "price-total",
  dock = true,
  equivalents,
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
              <dt className="text-ink-muted">{tierLabel(t, tier)}</dt>
              <dd className="m-0 text-end tabular-nums">
                <bdi>{formatMoney(tier.price, code)}</bdi>
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
        {/* The total row **is** the sticky summary (AC-9: no second money element). On a phone it
            leaves the flow and docks at the bottom of the viewport, restyled, with the size and
            the date beside the amount and the demo sentence (or, live, the cutoff) under it — the
            two lines a buyer would otherwise scroll back for. Those two lines repeat words the
            summary and the picker already say, so they are hidden from the accessibility tree;
            the amount is the one `aria-live` region, announced once. The document keeps room for
            the bar, so it never covers the last line of the page or a focused element (WCAG
            2.4.11). */}
        <div
          className={`border-rule mt-[14px] grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[16px] border-t pt-[14px] ${dock ? DOCKED : ""}`}
          data-fo-summary-total
        >
          <span
            className="max-sm:text-ink-subtle font-bold max-sm:col-start-1 max-sm:text-xs max-sm:font-normal"
            id={`${totalId}-label`}
          >
            {product("summary.total")}
          </span>
          <span
            aria-live="polite"
            className="text-end max-sm:col-start-1 max-sm:row-start-2 max-sm:text-start"
            id={totalId}
          >
            <bdi
              className="display num max-sm:text-md text-[32px] leading-[1.1]"
              data-fo-price-total
            >
              {formatMoney(view.price.displayPrice, code)}
            </bdi>
          </span>
          <span
            aria-hidden="true"
            className="text-ink-subtle hidden text-xs max-sm:col-start-2 max-sm:row-start-1 max-sm:block max-sm:text-end"
            data-fo-summary-docked="selection"
          >
            {[
              ...(tier === undefined ? [] : [tierLabel(t, tier)]),
              ...(date === undefined
                ? []
                : [
                    formatDate(
                      instantOf(date.date),
                      code,
                      "deliveryDate",
                      "UTC",
                    ),
                  ]),
              catalog("price.inclusive"),
            ].join(" · ")}
          </span>
          <span
            aria-hidden="true"
            className="text-ink hidden text-xs font-bold max-sm:col-start-2 max-sm:row-start-2 max-sm:block max-sm:text-end"
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
        {equivalents === undefined || equivalents === "" ? null : (
          <p
            className="num text-ink-subtle m-0 mt-[3px] text-xs leading-[1.35]"
            data-fo-price-equivalents
          >
            {equivalents}
          </p>
        )}
        <p className="text-ink-muted m-0 mt-[6px] text-sm">
          {catalog("price.inclusive")}
        </p>
        {view.fx.noticeKey === undefined ? null : (
          <p className="text-ink-muted m-0 mt-[8px] text-sm" data-fo-fx-notice>
            {catalog("availability.fxUnavailable")}
          </p>
        )}
      </div>
      <div
        className="border-sun text-ink-muted mt-[16px] border-s-[3px] ps-[14px] text-sm leading-[1.45]"
        data-fo-demo-summary
      >
        <p className="text-ink text-ui m-0 font-bold">
          {product("demo.heading")}
        </p>
        {live ? null : (
          <p className="m-0">{product("demo.body", { country })}</p>
        )}
      </div>
    </section>
  );
}
