/**
 * `/{locale}/account` with a buyer session (`account-orders-*`; spec 018 §5.3 `account`, §14
 * C.7.1; AC-10 account list, AC-25; spec 010 item 13; TASK-344): every order of the customer the
 * account lists, newest first, grouped by the purchase they were paid in. Per order: product and
 * stems, the order's own total, "Order {reference} · {city} · {delivery date}", the status chip
 * (the tracking page's headline), one "Refunded {amount} on {date}" line per succeeded refund, and
 * Details, Track (a signed link minted for this page) and Invoice (once it is rendered). Empty:
 * "No orders yet with this email." and "Choose flowers" to the locale home.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import { formatDate, localePath } from "@/modules/i18n";
import {
  type AccountPurchaseGroup,
  groupByPurchase,
  type AccountOrderRow,
} from "@/modules/orders/account-orders";
import { refundLineValues } from "@/modules/orders";
import { buttonClass } from "@/modules/ui/checkout/styles";

import { invoicePath, orderDetailPath } from "./account-request";
import {
  HEADLINE_KEY,
  REFUND_CHIP,
  chipClass,
  deliveryDay,
  money,
} from "./order-display";

const LINK =
  "text-link font-bold underline decoration-[1.5px] underline-offset-[4px]";

async function OrderRow({
  locale,
  order,
}: {
  readonly locale: LocaleCode;
  readonly order: AccountOrderRow;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const tr = await getTranslations({ locale, namespace: "tracking" });
  const date = deliveryDay(order.deliveryDate, locale);
  return (
    <li
      className="border-rule grid gap-[8px] border-b border-solid py-[18px] md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-[24px]"
      data-fo-account-order={order.reference}
    >
      <div className="grid min-w-0 gap-[6px]">
        <p className="m-0">
          {order.productName === null ? null : (
            <b className="font-display text-h3 font-(--font-weight-display)">
              {order.productName}
            </b>
          )}
          {order.stems === null ? null : (
            <span className="text-ink-2">
              {" · "}
              {t("orders.stems", { count: order.stems })}
            </span>
          )}
        </p>
        <p className="text-ink-2 m-0 text-sm">
          {order.city === null
            ? t("orders.lineNoCity", { reference: order.reference, date })
            : t("orders.line", {
                reference: order.reference,
                city: order.city,
                date,
              })}
        </p>
        <p className="m-0">
          <span
            className={chipClass(order.projection)}
            data-fo-account-step={order.projection}
          >
            {tr(HEADLINE_KEY[order.projection])}
          </span>
        </p>
        {order.refundLines.length === 0 ? null : (
          <ul
            aria-label={tr("refundsLabel")}
            className="m-0 flex list-none flex-wrap gap-[8px] p-0"
          >
            {order.refundLines.map((line, index) => (
              <li className={REFUND_CHIP} data-fo-account-refund="" key={index}>
                {tr(
                  "refundLine",
                  refundLineValues(line, locale, order.timeZone),
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 flex flex-wrap gap-x-[18px] gap-y-[6px] text-sm">
          <a className={LINK} href={orderDetailPath(locale, order.reference)}>
            {t("orders.details")}
          </a>
          <a className={LINK} href={order.trackingPath}>
            {t("orders.track")}
          </a>
          {order.invoiceId === null ? null : (
            <a className={LINK} href={invoicePath(locale, order.invoiceId)}>
              {t("orders.invoice")}
            </a>
          )}
        </p>
      </div>
      <p className="text-body m-0 font-bold tabular-nums md:text-end">
        {money(order.amount, locale)}
      </p>
    </li>
  );
}

async function PurchaseGroup({
  locale,
  group,
}: {
  readonly locale: LocaleCode;
  readonly group: AccountPurchaseGroup;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const zone = group.orders[0]?.timeZone ?? "UTC";
  return (
    <section className="grid gap-[2px]" data-fo-account-purchase="">
      <h2 className="text-ui m-0 font-bold">
        {t("orders.groupHeading", {
          date: formatDate(group.placedAt, locale, "weekdayDayMonth", zone),
        })}
      </h2>
      {group.orders.length > 1 ? (
        <p className="text-ink-2 m-0 text-sm">
          {t("orders.groupCount", { count: group.orders.length })}
        </p>
      ) : null}
      <ul className="border-rule m-0 mt-[8px] list-none border-t border-solid p-0">
        {await Promise.all(
          group.orders.map(async (order) => (
            <OrderRow key={order.orderId} locale={locale} order={order} />
          )),
        )}
      </ul>
    </section>
  );
}

export async function OrdersView({
  locale,
  rows,
}: {
  readonly locale: LocaleCode;
  readonly rows: readonly AccountOrderRow[];
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const groups = groupByPurchase(rows);
  return (
    <div className="grid gap-[28px]" data-fo-account="orders">
      <h1 className="display text-3xl-fluid m-0 leading-[1.08]">
        {t("orders.title")}
      </h1>
      {groups.length === 0 ? (
        <div
          className="grid justify-items-start gap-[16px]"
          data-fo-account-empty=""
        >
          <p className="text-ink-2 m-0">{t("orders.empty")}</p>
          <a
            className={buttonClass("ghost", "sm", "no-underline")}
            href={localePath(locale, "home")}
          >
            {t("orders.choose")}
          </a>
        </div>
      ) : (
        groups.map((group) => (
          <PurchaseGroup group={group} key={group.purchaseId} locale={locale} />
        ))
      )}
    </div>
  );
}
