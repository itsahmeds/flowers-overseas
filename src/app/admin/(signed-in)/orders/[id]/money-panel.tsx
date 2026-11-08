/**
 * @purpose The order's read-only Money panel: the 11-line waterfall from gross to margin, rates and dates (030b AC-31)
 * @spec 030b
 *
 * Rendered by `/admin/orders/[id]` for `finance.view` only (admin); for every other role the page
 * neither reads nor renders it, so no figure reaches their HTML (AC-2). The lines are
 * `orderMargin`'s output exactly, each converted figure with its rate, source and date (AC-21);
 * a provisional order lists each reason as text; the "Accountant to confirm" line names the open
 * tax questions (AC-18). No control writes (AC-31). Artboard `admin-order-detail-desktop.dc.html`,
 * "Money panel".
 */
import type { ReactElement, ReactNode } from "react";

import { adminT } from "@/modules/admin";
import type { OrderMargin, RateUse } from "@/modules/admin/finance";
import { formatRatePpm } from "@/modules/i18n";
import { AdminCode, AdminSecondLine } from "@/modules/ui/admin/AdminData";
import {
  AdminCard,
  AdminQuiet,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import {
  AccountantChip,
  day,
  eur,
  native,
  needsRate,
  percent,
  REPORTING,
  ReasonList,
  StatusChip,
  TaxBanner,
} from "../../finance/view";

function Line({
  sign,
  label,
  value,
  note,
  strong = false,
}: {
  readonly sign?: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly note?: ReactNode;
  readonly strong?: boolean;
}): ReactElement {
  return (
    <div
      data-money-line
      className={`grid grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-x-[8px] py-[5px] text-[14px] ${
        strong ? "border-rule border-t pt-[8px] font-bold" : ""
      }`}
    >
      <span aria-hidden="true" className="text-ink-3">
        {sign ?? ""}
      </span>
      <span>
        {label}
        {note === undefined ? null : <AdminSecondLine>{note}</AdminSecondLine>}
      </span>
      <span className="text-end [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
      </span>
    </div>
  );
}

function Source({ rate }: { readonly rate: RateUse }): ReactElement {
  return (
    <span className="bg-paper-2 text-ink-2 me-[6px] rounded-[4px] px-[4px] text-[11px] font-bold">
      {adminT(`admin.finance.source.${rate.source}`)}
    </span>
  );
}

const rateOf = (rate: RateUse): string =>
  formatRatePpm(rate.ratePpm, rate.base, rate.quote, "en");

export function MoneyPanel({
  margin,
}: {
  readonly margin: OrderMargin | null;
}): ReactElement {
  if (margin === null) {
    return (
      <AdminSection title={adminT("admin.finance.money.title")}>
        <AdminQuiet>{adminT("admin.finance.money.notPaid")}</AdminQuiet>
      </AdminSection>
    );
  }
  const r = margin.reporting;
  const noRate = adminT("admin.finance.money.noFigures");
  const show = (value: bigint | undefined): string =>
    value === undefined ? noRate : eur(value);
  const withCurrency = (value: bigint | undefined): string =>
    value === undefined ? noRate : `${eur(value)} ${REPORTING}`;

  const saleNote = needsRate(margin.saleRate) ? (
    <>
      <Source rate={margin.saleRate} />
      {adminT("admin.finance.money.ecbAt", {
        rate: rateOf(margin.saleRate),
        date: day(margin.saleRate.asOf),
      })}
    </>
  ) : (
    adminT("admin.finance.money.noConversion", {
      currency: margin.buyerCurrency,
    })
  );
  const settledNote: ReactNode = !margin.settledFromProvider ? (
    margin.provider === "mollie" ? (
      adminT("admin.finance.money.feeNotAvailable")
    ) : (
      adminT("admin.finance.money.noFeeRow")
    )
  ) : needsRate(margin.settledRate) ? (
    <>
      <Source rate={margin.settledRate} />
      {adminT("admin.finance.money.stripeAt", {
        rate: rateOf(margin.settledRate),
        date: day(margin.settledRate.asOf),
      })}
    </>
  ) : (
    adminT("admin.finance.money.balanceTxn", { date: day(margin.paidOn) })
  );
  const vatNote = (
    <>
      {needsRate(margin.saleRate) ? <Source rate={margin.saleRate} /> : null}
      {adminT("admin.finance.money.vatNative", {
        amount: native(margin.vatMinor, margin.buyerCurrency),
      })}
      {needsRate(margin.saleRate)
        ? ` ${adminT("admin.finance.money.ecbAt", {
            rate: rateOf(margin.saleRate),
            date: day(margin.saleRate.asOf),
          })}`
        : null}
      {margin.vatIsEstimate
        ? ` · ${adminT("admin.finance.money.vatEstimate")}`
        : null}
    </>
  );
  const floristAmount =
    margin.floristCurrency === null
      ? null
      : native(margin.floristCostMinor, margin.floristCurrency);
  let floristNote: ReactNode = adminT("admin.finance.money.noFlorist");
  if (floristAmount !== null) {
    const rate = margin.floristRate;
    if (rate === null) {
      floristNote = adminT("admin.finance.money.floristNoRate", {
        amount: floristAmount,
      });
    } else if (rate.base === rate.quote) {
      floristNote = floristAmount;
    } else {
      floristNote = (
        <>
          <Source rate={rate} />
          {margin.floristPaidOn === null
            ? adminT("admin.finance.money.floristUnpaid", {
                amount: floristAmount,
                rate: rateOf(rate),
                date: day(rate.asOf),
              })
            : adminT("admin.finance.money.floristPaid", {
                amount: floristAmount,
                rate: rateOf(rate),
                date: day(rate.asOf),
                paid: day(margin.floristPaidOn, false),
              })}
        </>
      );
    }
  }
  const feeNote = margin.settledFromProvider
    ? adminT("admin.finance.money.feeStripe", { currency: REPORTING })
    : margin.provider === "mollie"
      ? adminT("admin.finance.money.feeNotAvailable")
      : adminT("admin.finance.money.feePending");

  return (
    <AdminSection title={adminT("admin.finance.money.title")}>
      <AdminCard>
        <div className="flex flex-wrap items-center gap-[6px]">
          <StatusChip order={margin} />
          {margin.needsAccountant ? <AccountantChip /> : null}
        </div>
        <ReasonList reasons={margin.reasons} />
        <TaxBanner withNote={false} />
        <div>
          <Line
            label={adminT("admin.finance.money.grossEcb")}
            value={
              <>
                <span className="text-ink-3 me-[8px]">
                  {native(margin.grossMinor, margin.buyerCurrency)}
                </span>
                {withCurrency(r?.gross)}
              </>
            }
            note={saleNote}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.fxCost")}
            value={show(r?.fxCost)}
            note={adminT("admin.finance.money.fxNote")}
          />
          <Line
            sign="="
            strong
            label={adminT("admin.finance.totals.settled")}
            value={withCurrency(r?.settled)}
            note={settledNote}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.refunds")}
            value={show(r?.refunds)}
            {...(margin.refundsMinor === 0n
              ? {}
              : {
                  note: adminT("admin.finance.money.refundsNative", {
                    amount: native(margin.refundsMinor, margin.buyerCurrency),
                  }),
                })}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.money.vat")}
            value={show(r?.vat)}
            note={vatNote}
          />
          <Line
            sign="="
            strong
            label={adminT("admin.finance.totals.net")}
            value={withCurrency(r?.net)}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.floristCost")}
            value={show(r?.floristCost)}
            note={floristNote}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.fees")}
            value={show(r?.fees)}
            note={feeNote}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.disputes")}
            value={show(r?.disputes)}
          />
          <Line
            sign="="
            strong
            label={adminT("admin.finance.totals.margin")}
            value={withCurrency(r?.margin)}
          />
          <Line
            label={adminT("admin.finance.totals.marginPercent")}
            value={percent(margin.marginBp)}
          />
        </div>
        {margin.balanceRefs.length === 0 ? null : (
          <p className="text-ink-3 m-0 text-[13px]">
            {adminT("admin.finance.money.balanceTitle")}{" "}
            {margin.balanceRefs.map((ref, index) => (
              <span key={ref.ref}>
                {index === 0 ? null : " · "}
                <AdminCode>{ref.ref}</AdminCode>{" "}
                <AdminCode>{ref.kind}</AdminCode>
              </span>
            ))}
          </p>
        )}
        <AdminQuiet>
          {adminT("admin.finance.money.readOnly", { currency: REPORTING })}
        </AdminQuiet>
      </AdminCard>
    </AdminSection>
  );
}
