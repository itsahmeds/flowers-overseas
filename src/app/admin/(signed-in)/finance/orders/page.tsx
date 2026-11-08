/**
 * @purpose GET /admin/finance/orders: one row per paid order with its figures, rates, status and reasons (030b AC-17, AC-18, AC-21, AC-24)
 * @spec 030b
 *
 * `finance.view` (admin only); Download CSV needs `finance.export`. Filters: the range, live or
 * test, country, florist and figures (final, provisional, rate missing), all in the query string
 * (codes and dates only). Each EUR figure has its rate, date and source beside it, the ones
 * `orderMargin` used (AC-21); an order whose supply model is null or `agent` carries the
 * "Accountant to confirm" label whatever the config says (AC-18). Newest paid first; the CSV
 * lists paid on, then reference. Artboards `admin-finance-orders-{desktop,mobile}.dc.html`.
 */
import type { ReactElement } from "react";

import { FINANCE_CONFIG } from "@/config/finance";
import { adminRequestId, adminT, can, requireAdminPage } from "@/modules/admin";
import {
  addDays,
  financeFigureFilters,
  financeOrders,
  marginBp as marginBpOf,
  type OrderMargin,
  parseFinanceRange,
  rangeQuery,
  readFinance,
} from "@/modules/admin/finance";
import { formatDate, formatRegionName } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCell,
  AdminCode,
  AdminEmpty,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import { AdminQuiet, AdminSection } from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import {
  AccountantChip,
  day,
  eur,
  figureStatus,
  FINANCE_EXPORT_PATH,
  FINANCE_ORDERS_PATH,
  native,
  nativeList,
  needsRate,
  percent,
  RangeForm,
  RangeSelect,
  RateNote,
  REPORTING,
  ReasonList,
  StatusChip,
  TaxBanner,
} from "../view";

type FigureFilter = (typeof financeFigureFilters)[number];

function figureFilterOf(value: string | string[] | undefined): FigureFilter {
  const text = typeof value === "string" ? value : value?.[0];
  return financeFigureFilters.find((filter) => filter === text) ?? "all";
}

function NoRate(): ReactElement {
  return (
    <span className="text-ink-3">{adminT("admin.finance.orders.noRate")}</span>
  );
}

function OrderRow({
  order,
  zone,
}: {
  readonly order: OrderMargin;
  readonly zone: string;
}): ReactElement {
  const r = order.reporting;
  const lookbackFrom =
    order.saleRate === null
      ? addDays(order.paidOn, -FINANCE_CONFIG.rateLookbackDays)
      : null;
  return (
    <AdminRow>
      <AdminCell top>
        <AdminTableLink href={`/admin/orders/${order.orderId}`}>
          <AdminCode>{order.reference}</AdminCode>
        </AdminTableLink>
        <AdminSecondLine>
          {adminT("admin.finance.orders.paid", {
            time: formatDate(
              new Date(order.capturedAt),
              "en",
              "dayMonthTime",
              zone,
            ),
          })}
        </AdminSecondLine>
        <AdminSecondLine>
          {adminT("admin.finance.orders.delivery", {
            date: day(order.deliveryDate, false),
          })}
        </AdminSecondLine>
        <div className="mt-[4px] flex flex-wrap gap-[4px]">
          <StatusChip order={order} />
          {order.needsAccountant ? <AccountantChip /> : null}
        </div>
        <ReasonList reasons={order.reasons} />
      </AdminCell>
      <AdminCell top>
        {order.partnerCode === null ? (
          adminT("admin.finance.florist.unassigned")
        ) : (
          <AdminCode>{order.partnerCode}</AdminCode>
        )}
        <AdminSecondLine>
          {formatRegionName(order.countryIso2, "en")}
        </AdminSecondLine>
      </AdminCell>
      <AdminCell top align="end">
        {native(order.grossMinor, order.buyerCurrency)}
        {needsRate(order.saleRate) ? <RateNote rate={order.saleRate} /> : null}
        {needsRate(order.settledRate) ? (
          <RateNote rate={order.settledRate} />
        ) : null}
        {lookbackFrom === null ? null : (
          <span className="text-ink-3 block text-[12px]">
            {adminT("admin.finance.orders.noRateRange", {
              from: day(lookbackFrom, false),
              to: day(order.paidOn, false),
            })}
          </span>
        )}
      </AdminCell>
      <AdminCell top align="end">
        {r === null ? <NoRate /> : eur(r.net)}
      </AdminCell>
      <AdminCell top align="end">
        {r === null ? <NoRate /> : eur(r.floristCost)}
        {order.floristCurrency !== null &&
        order.floristCurrency !== REPORTING ? (
          <span className="text-ink-3 block text-[12px]">
            {native(order.floristCostMinor, order.floristCurrency)}
          </span>
        ) : null}
        {needsRate(order.floristRate) ? (
          <RateNote rate={order.floristRate} />
        ) : null}
      </AdminCell>
      <AdminCell top align="end">
        {r === null ? <NoRate /> : eur(r.fees)}
      </AdminCell>
      <AdminCell top align="end">
        {r === null ? <NoRate /> : eur(r.margin)}
      </AdminCell>
      <AdminCell top align="end">
        {percent(order.marginBp)}
      </AdminCell>
    </AdminRow>
  );
}

export default async function AdminFinanceOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("finance.view");
  const query = await searchParams;
  const parsed = parseFinanceRange(query, session.timeZone, new Date());
  const figures = figureFilterOf(query["figures"]);
  const canExport = can(session.roles, "finance.export");
  const result = parsed.ok
    ? await readFinance(
        { userId: session.userId, requestId: await adminRequestId() },
        (executor) =>
          financeOrders(executor, parsed.range, session.timeZone, new Date()),
      )
    : null;
  const all = result?.orders ?? [];
  const shown = [...all]
    .filter((order) => figures === "all" || figureStatus(order) === figures)
    .reverse();
  const net = shown.reduce(
    (acc, order) => acc + (order.reporting?.net ?? 0n),
    0n,
  );
  const florist = shown.reduce(
    (acc, order) => acc + (order.reporting?.floristCost ?? 0n),
    0n,
  );
  const fees = shown.reduce(
    (acc, order) => acc + (order.reporting?.fees ?? 0n),
    0n,
  );
  const margin = shown.reduce(
    (acc, order) => acc + (order.reporting?.margin ?? 0n),
    0n,
  );
  const gross = new Map<string, bigint>();
  for (const order of shown) {
    gross.set(
      order.buyerCurrency,
      (gross.get(order.buyerCurrency) ?? 0n) + order.grossMinor,
    );
  }
  const countries = [...new Set(all.map((order) => order.countryIso2))].sort();
  const partners = [
    ...new Set(
      all
        .map((order) => order.partnerCode)
        .filter((code): code is string => code !== null),
    ),
  ].sort();
  if (
    parsed.ok &&
    parsed.range.partner !== undefined &&
    !partners.includes(parsed.range.partner)
  ) {
    partners.push(parsed.range.partner);
  }
  if (
    parsed.ok &&
    parsed.range.country !== undefined &&
    !countries.includes(parsed.range.country)
  ) {
    countries.push(parsed.range.country);
  }
  const state = parsed.ok
    ? { ...parsed.range, errors: {} }
    : {
        ...parsed.entered,
        basis: "paid" as const,
        mode: "live" as const,
        errors: parsed.errors,
      };
  const mode = parsed.ok ? parsed.range.mode : "live";
  const currency = { currency: REPORTING };
  const marginBp = marginBpOf(margin, net);

  return (
    <AdminFrame session={session} current="finance">
      <div className="grid gap-[16px] md:gap-[20px]">
        <div className="flex flex-wrap items-end justify-between gap-[12px]">
          <div className="grid gap-[6px]">
            <AdminPageTitle>
              {adminT("admin.finance.orders.title")}
              {mode === "test" ? (
                <span className="bg-card border-ink-3 ms-[10px] inline-flex rounded-full border border-dashed px-[10px] align-middle text-[14px] font-bold">
                  {adminT("admin.finance.testLabel")}
                </span>
              ) : null}
            </AdminPageTitle>
            <p className="text-ink-2 m-0 text-[14px]">
              {adminT("admin.finance.orders.intro")}
            </p>
          </div>
          {canExport && parsed.ok && shown.length > 0 ? (
            <a
              href={`${FINANCE_EXPORT_PATH}?${rangeQuery(parsed.range, { kind: "orders" })}`}
              className="bg-ink text-paper inline-flex min-h-[36px] items-center rounded-[8px] px-[14px] text-[14px] font-bold no-underline"
            >
              {adminT("admin.finance.csv.download")}
            </a>
          ) : null}
        </div>
        <RangeForm
          action={FINANCE_ORDERS_PATH}
          state={state}
          zone={session.timeZone}
        >
          <RangeSelect
            id="finance-country"
            name="country"
            label={adminT("admin.finance.form.country")}
            value={parsed.ok ? (parsed.range.country ?? "") : ""}
            options={[
              { value: "", label: adminT("admin.finance.form.allCountries") },
              ...countries.map((iso2) => ({
                value: iso2,
                label: formatRegionName(iso2, "en"),
              })),
            ]}
          />
          <RangeSelect
            id="finance-partner"
            name="partner"
            label={adminT("admin.finance.form.partner")}
            value={parsed.ok ? (parsed.range.partner ?? "") : ""}
            options={[
              { value: "", label: adminT("admin.finance.form.allPartners") },
              ...partners.map((code) => ({ value: code, label: code })),
            ]}
          />
          <RangeSelect
            id="finance-figures"
            name="figures"
            label={adminT("admin.finance.form.figures")}
            value={figures}
            options={financeFigureFilters.map((filter) => ({
              value: filter,
              label:
                filter === "all"
                  ? adminT("admin.finance.form.figuresAll")
                  : adminT(`admin.finance.status.${filter}`),
            }))}
          />
        </RangeForm>
        <TaxBanner withNote={false} />
        {!parsed.ok ? null : shown.length === 0 ? (
          <AdminEmpty title={adminT("admin.finance.orders.emptyTitle")}>
            <p className="m-0 text-[14px]">
              {adminT("admin.finance.orders.emptyBody")}
            </p>
            <a
              href={FINANCE_ORDERS_PATH}
              className="text-link text-[14px] font-bold underline"
            >
              {adminT("admin.finance.orders.clear")}
            </a>
          </AdminEmpty>
        ) : (
          <AdminSection title={adminT("admin.finance.orders.caption")}>
            <div className="overflow-x-auto">
              <AdminTable
                columns={[
                  { key: "order", label: adminT("admin.finance.orders.order") },
                  {
                    key: "florist",
                    label: adminT("admin.finance.orders.florist"),
                  },
                  {
                    key: "gross",
                    label: adminT("admin.finance.orders.gross"),
                    align: "end",
                  },
                  {
                    key: "net",
                    label: adminT("admin.finance.column.net", currency),
                    align: "end",
                  },
                  {
                    key: "florist-cost",
                    label: adminT("admin.finance.column.floristCost", currency),
                    align: "end",
                  },
                  {
                    key: "fees",
                    label: adminT("admin.finance.column.fees", currency),
                    align: "end",
                  },
                  {
                    key: "margin",
                    label: adminT("admin.finance.column.margin", currency),
                    align: "end",
                  },
                  {
                    key: "percent",
                    label: adminT("admin.finance.column.marginPercent"),
                    align: "end",
                  },
                ]}
              >
                {shown.map((order) => (
                  <OrderRow
                    key={order.orderId}
                    order={order}
                    zone={session.timeZone}
                  />
                ))}
                <AdminRow>
                  <AdminCell>
                    <strong>
                      {adminT("admin.finance.orders.foot", {
                        count: shown.length,
                      })}
                    </strong>
                  </AdminCell>
                  <AdminCell>{null}</AdminCell>
                  <AdminCell align="end">{nativeList(gross)}</AdminCell>
                  <AdminCell align="end">{eur(net)}</AdminCell>
                  <AdminCell align="end">{eur(florist)}</AdminCell>
                  <AdminCell align="end">{eur(fees)}</AdminCell>
                  <AdminCell align="end">{eur(margin)}</AdminCell>
                  <AdminCell align="end">{percent(marginBp)}</AdminCell>
                </AdminRow>
              </AdminTable>
            </div>
            <AdminQuiet>
              {adminT("admin.finance.orders.footNote", { count: shown.length })}
            </AdminQuiet>
          </AdminSection>
        )}
      </div>
    </AdminFrame>
  );
}
