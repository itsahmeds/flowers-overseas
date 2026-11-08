/**
 * @purpose GET /admin/partners/[code]/money: one florist's sales, margin, owed and paid for a range
 * @spec 030b
 *
 * Spec 030b §2.6 "Money", §5.3 (artboards `admin-partner-money-{desktop,mobile}.dc.html`; AC-1,
 * AC-2, AC-26, AC-34; TASK-441). `finance.view` (admin only): every other role gets 403 and no
 * tab. The range form is the finance overview's plain `GET` form. Sales and the paid list on two
 * thirds; what we owe, and orders and offers, on the last third (first at 390). Owed now, earned
 * awaiting photo, open adjustments and paid all time do not depend on the range. A `demo` florist
 * takes no money and says so. Amounts carry their currency and are never added across currencies.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { openTaxQuestions } from "@/config/finance";
import { adminRequestId, adminT, requireAdminPage } from "@/modules/admin";
import {
  type CurrencyAmount,
  type PartnerMoney,
  parseFinanceRange,
  partnerMoney,
  rangeQuery,
  readFinance,
} from "@/modules/admin/finance";
import { formatDate, formatNumber } from "@/modules/i18n";
import { partnerHead } from "@/modules/partners";
import {
  AdminCell,
  AdminEmpty,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import {
  AdminCard,
  AdminKeyValues,
  AdminQuiet,
  AdminRecordColumns,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../../frame";
import {
  AccountantChip,
  day,
  eur,
  FINANCE_ORDERS_PATH,
  native,
  percent,
  RangeForm,
  rangeSub,
  REPORTING,
  TaxBanner,
} from "../../../finance/view";
import { PartnerTabHead } from "../tabs";

function Line({
  sign,
  label,
  value,
  strong = false,
}: {
  readonly sign?: string;
  readonly label: ReactNode;
  readonly value: string;
  readonly strong?: boolean;
}): ReactElement {
  return (
    <div
      className={`grid grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-x-[8px] py-[4px] text-[14px] ${
        strong ? "border-rule border-t pt-[8px] font-bold" : ""
      }`}
    >
      <span aria-hidden="true" className="text-ink-3">
        {sign ?? ""}
      </span>
      <span>{label}</span>
      <span className="text-end [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
      </span>
    </div>
  );
}

/** Per-currency amounts, each on its own line of text. */
function amounts(list: readonly CurrencyAmount[], zero: string): string {
  return list.length === 0
    ? zero
    : list.map((item) => native(item.minor, item.currency)).join(" · ");
}

function shortDay(instant: Date, zone: string): string {
  return formatDate(instant, "en", "dayMonth", zone);
}

type Money = Extract<PartnerMoney, { kind: "money" }>;

function Sales({ money }: { readonly money: Money }): ReactElement {
  const t = money.totals;
  const s = t.sums;
  const vatLabel = (
    <>
      {adminT("admin.finance.totals.vat")}{" "}
      {openTaxQuestions().length > 0 ? <AccountantChip /> : null}
    </>
  );
  return (
    <AdminCard>
      <div className="grid gap-[2px]">
        <h2 className="text-[20px] leading-[1.2]">
          {adminT("admin.partners.money.sales.title")}
        </h2>
        <AdminQuiet>{rangeSub(money.range)}</AdminQuiet>
      </div>
      {t.orders === 0 ? (
        <p className="m-0 text-[14px]">
          {adminT("admin.partners.money.sales.none", {
            from: day(money.range.from),
            to: day(money.range.to),
          })}
        </p>
      ) : (
        <div>
          <Line
            label={adminT("admin.partners.money.sales.settled")}
            value={`${eur(s.settled)} ${REPORTING}`}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.refunds")}
            value={eur(s.refunds)}
          />
          <Line sign="−" label={vatLabel} value={eur(s.vat)} />
          <Line
            sign="="
            label={adminT("admin.finance.totals.net")}
            value={`${eur(s.net)} ${REPORTING}`}
            strong
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.floristCost")}
            value={eur(s.floristCost)}
          />
          <Line
            sign="−"
            label={adminT("admin.finance.totals.fees")}
            value={eur(s.fees)}
          />
          {s.disputes === 0n ? null : (
            <Line
              sign="−"
              label={adminT("admin.finance.totals.disputes")}
              value={eur(s.disputes)}
            />
          )}
          <Line
            sign="="
            label={adminT("admin.finance.totals.margin")}
            value={`${eur(s.margin)} ${REPORTING}`}
            strong
          />
          <Line
            label={adminT("admin.finance.totals.marginPercent")}
            value={percent(t.marginBp)}
          />
        </div>
      )}
      {t.orders > 0 ? (
        <AdminQuiet>
          {t.provisional > 0 || t.rateMissing > 0
            ? adminT("admin.partners.money.sales.provisional", {
                count: t.provisional + t.rateMissing,
              })
            : adminT("admin.partners.money.sales.rates")}
        </AdminQuiet>
      ) : null}
    </AdminCard>
  );
}

function Paid({
  money,
  zone,
}: {
  readonly money: Money;
  readonly zone: string;
}): ReactElement {
  return (
    <AdminCard>
      <h2 className="text-[20px] leading-[1.2]">
        {adminT("admin.partners.money.paid.title")}
      </h2>
      {money.paidInRange.length === 0 ? (
        <p className="m-0 text-[14px]">
          {adminT("admin.partners.money.paid.noneInRange")}
        </p>
      ) : (
        <AdminTable
          caption={adminT("admin.partners.money.paid.caption")}
          columns={[
            {
              key: "statement",
              label: adminT("admin.partners.money.paid.statement"),
            },
            {
              key: "paidOn",
              label: adminT("admin.partners.money.paid.paidOn"),
            },
            {
              key: "amount",
              label: adminT("admin.partners.money.paid.amount"),
              align: "end" as const,
            },
          ]}
        >
          {money.paidInRange.map((statement) => (
            <AdminRow key={statement.payoutId}>
              <AdminCell>
                <AdminTableLink
                  href={`/admin/payouts/${encodeURIComponent(statement.payoutId)}`}
                >
                  {statement.statementNumber}
                </AdminTableLink>
              </AdminCell>
              <AdminCell>
                {formatDate(statement.paidAt, "en", "dayMonthYear", zone)}
              </AdminCell>
              <AdminCell align="end">
                {native(statement.totalMinor, statement.currency)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      )}
      <AdminKeyValues
        items={[
          {
            key: "inRange",
            label: adminT("admin.partners.money.paid.inRange"),
            value: amounts(
              sumByCurrency(
                money.paidInRange.map((s) => ({
                  currency: s.currency,
                  minor: s.totalMinor,
                })),
              ),
              adminT("admin.partners.money.nothing"),
            ),
            numeric: true,
          },
          {
            key: "allTime",
            label: adminT("admin.partners.money.paid.allTime"),
            value:
              money.paidAllTime.length === 0
                ? adminT("admin.partners.money.nothing")
                : money.paidAllTime
                    .map((item) =>
                      adminT("admin.partners.money.paid.since", {
                        amount: native(item.minor, item.currency),
                        date: formatDate(
                          item.since,
                          "en",
                          "dayMonthYear",
                          zone,
                        ),
                      }),
                    )
                    .join(" · "),
            numeric: true,
          },
        ]}
      />
    </AdminCard>
  );
}

function sumByCurrency(list: readonly CurrencyAmount[]): CurrencyAmount[] {
  const sums = new Map<string, bigint>();
  for (const item of list) {
    sums.set(item.currency, (sums.get(item.currency) ?? 0n) + item.minor);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => ({ currency, minor }));
}

function Owe({
  money,
  zone,
}: {
  readonly money: Money;
  readonly zone: string;
}): ReactElement {
  const owed =
    money.owedNow.length === 0 ? (
      adminT("admin.partners.money.owe.nothingOwed")
    ) : (
      <>
        {money.owedNow.map((item) => (
          <span key={item.currency} className="block">
            {native(item.minor, item.currency)}
            {item.oldestUnpaid === null ? null : (
              <AdminSecondLine>
                {adminT("admin.partners.money.owe.statement", {
                  number: item.oldestUnpaid.statementNumber,
                  date: shortDay(item.oldestUnpaid.sentAt, zone),
                })}
              </AdminSecondLine>
            )}
          </span>
        ))}
      </>
    );
  return (
    <AdminCard>
      <h2 className="text-[20px] leading-[1.2]">
        {adminT("admin.partners.money.owe.title")}
      </h2>
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "owed",
            label: adminT("admin.finance.owed.owedNow"),
            value: owed,
            numeric: true,
          },
          {
            key: "awaiting",
            label: adminT("admin.finance.owed.awaitingPhoto"),
            value: amounts(
              money.awaitingPhoto,
              adminT("admin.partners.money.nothing"),
            ),
            numeric: true,
          },
          {
            key: "adjustments",
            label: adminT("admin.finance.owed.openAdjustments"),
            value: (
              <>
                {formatNumber(money.openAdjustments, "en")}
                {money.openAdjustments > 0 ? (
                  <AdminSecondLine>
                    {adminT("admin.partners.money.owe.undecided")}{" "}
                    <Link
                      href="/admin/payouts"
                      className="text-link underline underline-offset-[3px]"
                    >
                      {adminT("admin.partners.money.owe.settle")}
                    </Link>
                  </AdminSecondLine>
                ) : null}
              </>
            ),
            numeric: true,
          },
        ]}
      />
    </AdminCard>
  );
}

function Outcomes({ money }: { readonly money: Money }): ReactElement {
  const o = money.outcomes;
  const row = (key: string, label: string, value: number) => ({
    key,
    label,
    value: formatNumber(value, "en"),
    numeric: true,
  });
  return (
    <AdminCard>
      <h2 className="text-[20px] leading-[1.2]">
        {adminT("admin.partners.money.outcomes.title")}
      </h2>
      <AdminKeyValues
        variant="totals"
        items={[
          row(
            "accepted",
            adminT("admin.partners.money.outcomes.accepted"),
            o.accepted,
          ),
          row(
            "delivered",
            adminT("admin.partners.money.outcomes.delivered"),
            o.delivered,
          ),
          row(
            "cancelled",
            adminT("admin.partners.money.outcomes.cancelled"),
            o.cancelledAfterAcceptance,
          ),
          row(
            "declined",
            adminT("admin.partners.money.outcomes.declined"),
            o.declined,
          ),
          row(
            "timedOut",
            adminT("admin.partners.money.outcomes.timedOut"),
            o.timedOut,
          ),
        ]}
      />
      <a
        href={`${FINANCE_ORDERS_PATH}?${rangeQuery(money.range)}`}
        className="text-link text-[14px] font-bold underline underline-offset-[3px]"
      >
        {adminT("admin.partners.money.outcomes.see")}
      </a>
    </AdminCard>
  );
}

export default async function AdminPartnerMoneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("finance.view");
  const { code } = await params;
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const head = await partnerHead(actor, code);
  if (head === undefined) notFound();
  const now = new Date();
  const parsed = parseFinanceRange(await searchParams, session.timeZone, now);
  const money = parsed.ok
    ? await readFinance(actor, (executor) =>
        partnerMoney(executor, head.id, parsed.range, session.timeZone, now),
      )
    : null;
  const state = parsed.ok
    ? { ...parsed.range, errors: {} }
    : {
        ...parsed.entered,
        basis: "paid" as const,
        mode: "live" as const,
        errors: parsed.errors,
      };

  let body: ReactNode = null;
  if (money?.kind === "demo") {
    body = (
      <AdminEmpty title={adminT("admin.partners.money.demo.title")}>
        <p className="m-0 text-[14px]">
          {adminT("admin.partners.money.demo.body")}
        </p>
      </AdminEmpty>
    );
  } else if (money !== null) {
    body = (
      <AdminRecordColumns
        main={
          <>
            <Sales money={money} />
            <Paid money={money} zone={session.timeZone} />
          </>
        }
        aside={
          <div className="grid gap-[16px]">
            <Owe money={money} zone={session.timeZone} />
            <Outcomes money={money} />
          </div>
        }
      />
    );
  }

  return (
    <AdminFrame session={session} current="partners">
      <div className="grid gap-[16px] md:gap-[20px]">
        <PartnerTabHead head={head} roles={session.roles} current="money">
          {money?.kind === "demo" ? null : (
            <>
              <RangeForm
                action={`/admin/partners/${encodeURIComponent(head.code)}/money`}
                state={state}
                zone={session.timeZone}
              />
              <TaxBanner withNote={false} />
            </>
          )}
        </PartnerTabHead>
        {body}
      </div>
    </AdminFrame>
  );
}
