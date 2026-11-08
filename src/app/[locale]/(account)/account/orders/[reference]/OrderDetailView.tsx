/**
 * One order for its owner (`account-order-detail-*`; spec 018 §5.3 `account/orders/[reference]`,
 * §14 C.7.1; AC-10 account detail, AC-23 owner half, AC-26, AC-28 account half; TASK-344).
 *
 * Two columns from `lg` (7 and 5): the headline, refund lines and the five-step timeline as on the
 * tracking page, then the recipient recap; on the right the order, its documents and help. The
 * cancel row is the last element of `<main>`: while the order is in set P, the confirmation's
 * quiet line whose "You can cancel for free" is a text-styled button (step `review`); after it the
 * confirm `<dialog open>` with the order's own amount, "Yes, cancel it" (step `confirm`) and "Keep
 * my order" (a `GET` of the page). From "Being made" on, a post shows `postPurchase.cancelRefused`.
 *
 * The recipient recap (name, address, phone, card) shows until the 90-day sweep; after it only the
 * city and "We removed the recipient's details on {date}." (AC-26). The florist line appears from
 * "Being made", never before. No "Change" or "Edit" control. Every word from the catalogues.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import { accountPath } from "@/lib/auth/buyer";
import { formatDate } from "@/modules/i18n";
import { refundLineValues } from "@/modules/orders";
import type { AccountOrderDetail } from "@/modules/orders/account-orders";
import { buttonClass } from "@/modules/ui/checkout/styles";

import {
  invoicePath,
  orderDetailPath,
} from "../../_parts/account-request";
import { AccountShell } from "../../_parts/AccountShell";
import {
  HEADLINE_KEY,
  REFUND_CHIP,
  deliveryDay,
  money,
} from "../../_parts/order-display";
import { cancelFromAccountAction } from "./actions";

export type DetailCancelState = "review" | "refused" | null;

const CARD =
  "bg-card rounded-field grid gap-[10px] px-[18px] py-[18px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[22px]";
const LABEL = "text-ink-3 m-0 text-sm";
const LINK =
  "text-link font-bold underline decoration-[1.5px] underline-offset-[4px]";
const LINE_BUTTON =
  "text-link min-h-(--target-min) cursor-pointer border-0 bg-transparent p-0 [font:inherit] underline decoration-[1.5px] underline-offset-[4px] focus-visible:outline-focus focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid";
const MARKER = {
  done: "bg-stem text-card",
  current: "bg-sky text-card shadow-[0_0_0_5px_var(--color-sage-wash)]",
  future:
    "bg-card text-mark shadow-[inset_0_0_0_1.5px_var(--color-mark),inset_0_0_0_5px_var(--color-card),inset_0_0_0_6px_var(--color-mark)]",
} as const;

export async function OrderDetailView({
  locale,
  detail,
  cancelState,
}: {
  readonly locale: LocaleCode;
  readonly detail: AccountOrderDetail;
  readonly cancelState: DetailCancelState;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const tr = await getTranslations({ locale, namespace: "tracking" });
  const c = await getTranslations({ locale, namespace: "confirmation" });
  const { row, view, recipient, documents } = detail;
  const zone = view.timeline.timeZone;
  const stepTime = (at: Date): string =>
    formatDate(at, locale, "stepTime", zone);
  const reference = row.reference;
  const path = orderDetailPath(locale, reference);
  const dialogOpen = detail.cancellable && cancelState === "review";
  const refunds =
    row.refundLines.length === 0 ? null : (
      <ul
        aria-label={tr("refundsLabel")}
        className="m-0 flex list-none flex-wrap gap-[8px] p-0"
      >
        {row.refundLines.map((line, index) => (
          <li className={REFUND_CHIP} data-fo-account-refund="" key={index}>
            {tr("refundLine", refundLineValues(line, locale, zone))}
          </li>
        ))}
      </ul>
    );
  const florist =
    view.floristCity === null
      ? null
      : view.floristFirstName === null
        ? tr("floristLineNoName", { city: view.floristCity })
        : tr("floristLine", {
            name: view.floristFirstName,
            city: view.floristCity,
          });

  return (
    <AccountShell current="orders" locale={locale}>
      <div
        className="grid gap-[24px]"
        data-fo-account="order"
        data-fo-account-step={row.projection}
        inert={dialogOpen}
      >
        <p className="m-0 text-sm">
          <a className={LINK} href={accountPath(locale)}>
            {"‹ "}
            {t("detail.back")}
          </a>
        </p>
        <div className="grid items-start gap-[24px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[40px]">
          <div className="grid min-w-0 gap-[20px]">
            <div className="grid gap-[8px]">
              <p className="eyebrow m-0">{t("detail.eyebrow", { reference })}</p>
              <h1
                className="display text-3xl-fluid m-0 leading-[1.05]"
                data-fo-account-headline={row.projection}
              >
                {tr(HEADLINE_KEY[row.projection])}
              </h1>
              {refunds}
            </div>
            <ol
              aria-label={tr("timelineLabel")}
              className="m-0 grid list-none p-0"
            >
              {view.timeline.steps.map((step, index) => (
                <li
                  aria-current={step.state === "current" ? "step" : undefined}
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-[16px] gap-y-[2px] pb-[16px] md:grid-cols-[44px_minmax(0,1fr)_auto]"
                  data-fo-account-timeline-step={step.step}
                  key={step.step}
                >
                  <span
                    aria-hidden="true"
                    className={`font-display text-ui row-span-2 grid h-[38px] w-[38px] place-items-center rounded-full ${MARKER[step.state]}`}
                  >
                    {step.state === "done" ? "✓" : String(index + 1)}
                  </span>
                  <h3
                    className={`text-h3-s m-0 pt-[7px] leading-[1.2] ${step.state === "future" ? "text-ink-3" : "text-ink"}`}
                  >
                    {tr(HEADLINE_KEY[step.step])}
                  </h3>
                  {step.at === null ? null : (
                    <time
                      className="text-ink-3 col-start-2 text-sm tabular-nums md:col-start-auto md:pt-[10px]"
                      dateTime={step.at.toISOString()}
                    >
                      {stepTime(step.at)}
                    </time>
                  )}
                  {step.step === "being_made" &&
                  step.state !== "future" &&
                  florist !== null ? (
                    <p className="text-ink-2 col-start-2 m-0 text-sm">
                      {florist}
                    </p>
                  ) : null}
                </li>
              ))}
              {row.projection === "cancelled" ? (
                <li
                  aria-current="step"
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-[16px] pb-[16px]"
                  data-fo-account-timeline-step="cancelled"
                >
                  <span
                    aria-hidden="true"
                    className="bg-ink text-paper grid h-[38px] w-[38px] place-items-center rounded-full"
                  >
                    ×
                  </span>
                  <h3 className="text-h3-s text-ink m-0 pt-[7px] leading-[1.2]">
                    {tr(HEADLINE_KEY.cancelled)}
                  </h3>
                </li>
              ) : null}
            </ol>
            <section className={CARD} data-fo-account-recipient={recipient.kind}>
              <h2 className="display text-h3 m-0">{t("detail.recipientTitle")}</h2>
              {recipient.kind === "shown" ? (
                <dl className="m-0 grid gap-[10px]">
                  <div>
                    <dt className={LABEL}>{t("detail.recipient")}</dt>
                    <dd className="m-0">
                      <b>{recipient.fullName}</b>
                      <br />
                      {[
                        ...recipient.addressLines,
                        [recipient.postcode, recipient.city]
                          .filter((part) => part !== null)
                          .join(" "),
                      ].join(", ")}
                      <br />
                      <bdi>{recipient.phoneE164}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt className={LABEL}>{t("detail.date")}</dt>
                    <dd className="m-0">{deliveryDay(row.deliveryDate, locale)}</dd>
                  </div>
                  {recipient.cardMessage === null ? null : (
                    <div>
                      <dt className={LABEL}>{t("detail.card")}</dt>
                      <dd className="font-hand text-hand m-0 leading-[1.2] whitespace-pre-line">
                        {recipient.cardMessage}
                        {recipient.signAs === null ? null : (
                          <>
                            <br />
                            {recipient.signAs}
                          </>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-ink-2 m-0" data-fo-account-recipient-removed="">
                  {recipient.city === null ? null : (
                    <>
                      <b className="text-ink">{recipient.city}</b>
                      {". "}
                    </>
                  )}
                  {t("detail.removed", {
                    date: formatDate(
                      recipient.removedOn,
                      locale,
                      "dayMonthYear",
                      zone,
                    ),
                  })}
                </p>
              )}
            </section>
          </div>
          <div className="grid min-w-0 gap-[16px]">
            <section className={CARD}>
              <h2 className="display text-h3 m-0">{t("detail.orderTitle")}</h2>
              {row.productName === null ? null : (
                <p className="m-0">
                  <b>{row.productName}</b>
                  {row.stems === null ? null : (
                    <span className="text-ink-2">
                      {" · "}
                      {t("orders.stems", { count: row.stems })}
                    </span>
                  )}
                </p>
              )}
              <p className="text-ink-2 m-0 text-sm">
                {t("detail.placed", {
                  reference,
                  date: formatDate(row.placedAt, locale, "weekdayDayMonth", zone),
                })}
              </p>
              <p className="m-0 flex items-baseline justify-between gap-[12px]">
                <span>{t("detail.paid")}</span>
                <b className="tabular-nums">{money(row.amount, locale)}</b>
              </p>
            </section>
            {documents.length === 0 ? null : (
              <section className={CARD} data-fo-account-documents="">
                <h2 className="display text-h3 m-0">
                  {t("detail.documentsTitle")}
                </h2>
                <ul className="m-0 grid list-none gap-[8px] p-0">
                  {documents.map((document) => (
                    <li key={document.invoiceId}>
                      <a
                        className={LINK}
                        data-fo-account-document={document.kind}
                        href={invoicePath(locale, document.invoiceId)}
                      >
                        {t(
                          document.kind === "invoice"
                            ? "detail.invoice"
                            : "detail.creditNote",
                        )}
                      </a>
                      <span className="text-ink-2">
                        {" · "}
                        {document.number}
                        {" · "}
                        {t("detail.pdf")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className={CARD}>
              <p className="m-0">{tr("help.quote", { reference })}</p>
              <p className="m-0">
                <a className={LINK} href={whatsappHref(COMPANY.contact)}>
                  {tr("help.whatsapp", { phone: COMPANY.contact.phoneDisplay })}
                </a>
              </p>
              <p className="text-ink-2 m-0 text-sm">{tr("help.hours")}</p>
            </section>
          </div>
        </div>
        {detail.cancellable ? (
          <form
            action={cancelFromAccountAction.bind(null, locale, reference)}
            className="border-rule border-t border-solid pt-[16px]"
            data-fo-account-cancel-line=""
          >
            <p className="text-ink-2 m-0">
              {c.rich("postPurchase.cancelLine", {
                cancel: (chunks) => (
                  <button
                    className={LINE_BUTTON}
                    name="step"
                    type="submit"
                    value="review"
                  >
                    {chunks}
                  </button>
                ),
              })}
            </p>
          </form>
        ) : cancelState === "refused" ? (
          <div
            className="border-rule grid gap-[6px] border-t border-solid pt-[16px]"
            data-fo-account-cancel-refused=""
          >
            <p className="text-ink m-0" role="status">
              {c("postPurchase.cancelRefused")}
            </p>
          </div>
        ) : null}
      </div>
      {dialogOpen ? (
        <dialog
          aria-describedby={`cancel-body-${reference}`}
          aria-labelledby={`cancel-title-${reference}`}
          aria-modal="true"
          className="text-ink fixed inset-0 z-[60] m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-(--color-scrim) p-0"
          data-fo-account-cancel-dialog=""
          open
        >
          <div className="bg-card rounded-field grid w-[480px] max-w-[calc(100%-40px)] gap-[14px] px-[28px] py-[26px] shadow-(--shadow-md) max-md:px-[20px] max-md:py-[22px]">
            <h2
              className="display m-0 text-lg leading-[1.15]"
              id={`cancel-title-${reference}`}
            >
              {c("postPurchase.cancelConfirmTitle")}
            </h2>
            <p className="m-0" id={`cancel-body-${reference}`}>
              {c("postPurchase.cancelConfirmBody", {
                amount: money(row.amount, locale),
              })}
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <form
                action={cancelFromAccountAction.bind(null, locale, reference)}
                className="contents"
              >
                <button
                  className={buttonClass("primary", "sm")}
                  name="step"
                  type="submit"
                  value="confirm"
                >
                  {c("postPurchase.cancelConfirmYes")}
                </button>
              </form>
              <form action={path} className="contents" method="get">
                <button
                  autoFocus
                  className={buttonClass("ghost", "sm")}
                  type="submit"
                >
                  {c("postPurchase.cancelConfirmNo")}
                </button>
              </form>
            </div>
          </div>
        </dialog>
      ) : null}
    </AccountShell>
  );
}
