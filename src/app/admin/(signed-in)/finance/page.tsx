/**
 * @purpose GET /admin/finance: totals, by country, by florist, VAT by country, counts, owed and paid (030b AC-18 to AC-24)
 * @spec 030b
 *
 * `finance.view` (admin only); ops, finance and content get 403, no session goes to sign-in (the
 * signed-in layout, spec 012 AC-1). SSR `no-store` and `noindex` from the admin document and
 * headers. The range form is a plain GET form; a refused range shows its field errors and runs
 * no finance query (AC-20). Six SQL statements whatever the number of orders (AC-22), the
 * arithmetic in `orderMargin` and `rollUp`. Native subtotals are listed per currency and never
 * added across currencies; EUR totals add the per-order EUR figures (AC-19). Test orders sit
 * under their own label (AC-24). Artboards `admin-finance-overview-{desktop,mobile}.dc.html`.
 */
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { openTaxQuestions } from "@/config/finance";
import { adminRequestId, adminT, can, requireAdminPage } from "@/modules/admin";
import {
  type FinanceGroup,
  type PartnerPosition,
  type PortfolioOverview,
  parseFinanceRange,
  portfolioOverview,
  rangeQuery,
  readFinance,
} from "@/modules/admin/finance";
import { formatNumber, formatRegionName } from "@/modules/i18n";
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
import {
  AdminCard,
  AdminQuiet,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../frame";
import {
  AccountantChip,
  eur,
  FINANCE_EXPORT_PATH,
  FINANCE_ORDERS_PATH,
  FINANCE_PATH,
  nativeList,
  percent,
  RangeForm,
  rangeSub,
  REPORTING,
  TaxBanner,
} from "./view";

function StatementLine({
  sign,
  label,
  value,
  strong = false,
  note,
}: {
  readonly sign?: string;
  readonly label: ReactNode;
  readonly value: string;
  readonly strong?: boolean;
  readonly note?: ReactNode;
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

function CsvLink({
  kind,
  query,
  children,
}: {
  readonly kind: "orders" | "florists" | "countries";
  readonly query: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      href={`${FINANCE_EXPORT_PATH}?${query}&kind=${kind}`}
      className="text-link text-[14px] font-bold underline underline-offset-[3px]"
    >
      {children}
    </a>
  );
}

function Totals({
  overview,
}: {
  readonly overview: PortfolioOverview;
}): ReactElement {
  const t = overview.totals;
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
          {adminT("admin.finance.totals.title")}
        </h2>
        <AdminQuiet>{rangeSub(overview.range)}</AdminQuiet>
      </div>
      <div>
        <StatementLine
          label={adminT("admin.finance.totals.orders")}
          value={formatNumber(t.orders, "en")}
        />
        <StatementLine
          label={adminT("admin.finance.totals.grossNative")}
          value={nativeList(t.grossByCurrency)}
        />
        <StatementLine
          label={`${adminT("admin.finance.totals.grossEcb")}, ${REPORTING}`}
          value={eur(s.gross)}
          note={
            <>
              {adminT("admin.finance.totals.ratesUsed")}{" "}
              <a
                href={`${FINANCE_ORDERS_PATH}?${rangeQuery(overview.range)}`}
                className="text-link underline"
              >
                {adminT("admin.finance.totals.ratesLink")}
              </a>
            </>
          }
        />
        <StatementLine
          sign="−"
          label={adminT("admin.finance.totals.fxCost")}
          value={eur(s.fxCost)}
        />
        <StatementLine
          sign="="
          strong
          label={`${adminT("admin.finance.totals.settled")}, ${REPORTING}`}
          value={eur(s.settled)}
        />
        <StatementLine
          sign="−"
          label={adminT("admin.finance.totals.refunds")}
          value={eur(s.refunds)}
        />
        <StatementLine sign="−" label={vatLabel} value={eur(s.vat)} />
        <StatementLine
          sign="="
          strong
          label={`${adminT("admin.finance.totals.net")}, ${REPORTING}`}
          value={eur(s.net)}
        />
        <StatementLine
          sign="−"
          label={adminT("admin.finance.totals.floristCost")}
          value={eur(s.floristCost)}
        />
        <StatementLine
          sign="−"
          label={adminT("admin.finance.totals.fees")}
          value={eur(s.fees)}
        />
        <StatementLine
          sign="−"
          label={adminT("admin.finance.totals.disputes")}
          value={eur(s.disputes)}
        />
        <StatementLine
          sign="="
          strong
          label={`${adminT("admin.finance.totals.margin")}, ${REPORTING}`}
          value={eur(s.margin)}
        />
        <StatementLine
          label={adminT("admin.finance.totals.marginPercent")}
          value={percent(t.marginBp)}
        />
      </div>
      {t.provisional === 0 ? null : (
        <AdminQuiet>
          {adminT("admin.finance.totals.includesProvisional", {
            count: t.provisional,
          })}{" "}
          <a
            href={`${FINANCE_ORDERS_PATH}?${rangeQuery(overview.range, { figures: "provisional" })}`}
            className="text-link underline"
          >
            {adminT("admin.finance.totals.seeWhy")}
          </a>
        </AdminQuiet>
      )}
    </AdminCard>
  );
}

function Counts({
  overview,
  canExport,
}: {
  readonly overview: PortfolioOverview;
  readonly canExport: boolean;
}): ReactElement {
  const t = overview.totals;
  const link = (figures: string, label: string, value: number) => (
    <a
      href={`${FINANCE_ORDERS_PATH}?${rangeQuery(overview.range, { figures })}`}
      className="bg-paper-2 grid gap-[2px] rounded-[10px] px-[12px] py-[10px] no-underline"
    >
      <span className="text-ink-3 text-[12px] font-bold uppercase">
        {label}
      </span>
      <span className="font-display text-ink text-[28px] leading-none tabular-nums">
        {formatNumber(value, "en")}
      </span>
    </a>
  );
  return (
    <AdminCard title={adminT("admin.finance.counts.title")}>
      <div className="grid grid-cols-3 gap-[8px]">
        {link("final", adminT("admin.finance.counts.final"), t.final)}
        {link(
          "provisional",
          adminT("admin.finance.counts.provisional"),
          t.provisional,
        )}
        {link(
          "rate_missing",
          adminT("admin.finance.counts.rateMissing"),
          t.rateMissing,
        )}
      </div>
      <AdminQuiet>{adminT("admin.finance.counts.note")}</AdminQuiet>
      {canExport ? (
        <CsvLink kind="orders" query={rangeQuery(overview.range)}>
          {adminT("admin.finance.csv.orders")}
        </CsvLink>
      ) : null}
    </AdminCard>
  );
}

function sumBy(
  positions: readonly PartnerPosition[],
  pick: (position: PartnerPosition) => bigint,
): Map<string, bigint> {
  const sums = new Map<string, bigint>();
  for (const position of positions) {
    const value = pick(position);
    if (value === 0n) continue;
    sums.set(position.currency, (sums.get(position.currency) ?? 0n) + value);
  }
  return sums;
}

const owedOf = (position: PartnerPosition): bigint =>
  position.draftOpenMinor +
  position.draftClosedMinor +
  position.statementSentMinor;

function Owed({
  overview,
}: {
  readonly overview: PortfolioOverview;
}): ReactElement {
  const owed = sumBy(overview.positions, owedOf);
  const paid = sumBy(overview.positions, (position) => position.paidMinor);
  const awaiting = new Map<string, bigint>();
  for (const order of overview.orders) {
    if (
      !order.reasons.includes("florist_cost_pending") ||
      order.floristCurrency === null
    )
      continue;
    awaiting.set(
      order.floristCurrency,
      (awaiting.get(order.floristCurrency) ?? 0n) + order.floristCostMinor,
    );
  }
  const adjustments = overview.positions.reduce(
    (acc, p) => acc + p.openAdjustments,
    0,
  );
  const none = adminT("admin.finance.owed.none");
  const show = (amounts: Map<string, bigint>) =>
    amounts.size === 0 ? none : nativeList(amounts);
  return (
    <AdminCard title={adminT("admin.finance.owed.title")}>
      <div>
        <StatementLine
          label={adminT("admin.finance.owed.owedNow")}
          value={show(owed)}
        />
        <StatementLine
          label={adminT("admin.finance.owed.awaitingPhoto")}
          value={show(awaiting)}
        />
        <StatementLine
          label={adminT("admin.finance.owed.openAdjustments")}
          value={formatNumber(adjustments, "en")}
        />
        <StatementLine
          label={adminT("admin.finance.owed.paid")}
          value={show(paid)}
        />
      </div>
      <AdminQuiet>{adminT("admin.finance.owed.note")}</AdminQuiet>
      <Link
        href="/admin/payouts"
        className="text-link text-[14px] font-bold underline underline-offset-[3px]"
      >
        {adminT("admin.finance.owed.payouts")}
      </Link>
    </AdminCard>
  );
}

function Caption({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="text-ink-3 m-0 text-[13px]">{children}</p>;
}

function countryName(iso2: string): string {
  return formatRegionName(iso2, "en");
}

function GroupCells({ group }: { readonly group: FinanceGroup }): ReactElement {
  return (
    <>
      <AdminCell align="end">{formatNumber(group.orders, "en")}</AdminCell>
      <AdminCell align="end">{eur(group.sums.net)}</AdminCell>
      <AdminCell align="end">{eur(group.sums.floristCost)}</AdminCell>
      <AdminCell align="end">{eur(group.sums.margin)}</AdminCell>
      <AdminCell align="end">{percent(group.marginBp)}</AdminCell>
    </>
  );
}

const currency = { currency: REPORTING };

function ByCountry({
  overview,
  canExport,
}: {
  readonly overview: PortfolioOverview;
  readonly canExport: boolean;
}): ReactElement {
  const range = overview.range;
  return (
    <AdminSection
      title={adminT("admin.finance.country.title")}
      note={
        canExport ? (
          <CsvLink kind="countries" query={rangeQuery(range)}>
            {adminT("admin.finance.csv.countries")}
          </CsvLink>
        ) : undefined
      }
    >
      <Caption>
        {adminT("admin.finance.country.caption", {
          from: range.from,
          to: range.to,
        })}
      </Caption>
      <div className="overflow-x-auto">
        <AdminTable
          columns={[
            { key: "country", label: adminT("admin.finance.country.country") },
            {
              key: "orders",
              label: adminT("admin.finance.column.orders"),
              align: "end",
            },
            {
              key: "gross",
              label: adminT("admin.finance.column.gross"),
              align: "end",
            },
            {
              key: "net",
              label: adminT("admin.finance.column.net", currency),
              align: "end",
            },
            {
              key: "florist",
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
          {[...overview.byCountry, { ...overview.totals, key: "" }].map(
            (group) => (
              <AdminRow key={group.key === "" ? "all" : group.key}>
                <AdminCell>
                  {group.key === "" ? (
                    <strong>{adminT("admin.finance.country.all")}</strong>
                  ) : (
                    <AdminTableLink
                      href={`${FINANCE_ORDERS_PATH}?${rangeQuery(range, { country: group.key })}`}
                    >
                      {countryName(group.key)}
                    </AdminTableLink>
                  )}
                </AdminCell>
                <AdminCell align="end">
                  {formatNumber(group.orders, "en")}
                </AdminCell>
                <AdminCell align="end">
                  {nativeList(group.grossByCurrency)}
                </AdminCell>
                <AdminCell align="end">{eur(group.sums.net)}</AdminCell>
                <AdminCell align="end">{eur(group.sums.floristCost)}</AdminCell>
                <AdminCell align="end">{eur(group.sums.fees)}</AdminCell>
                <AdminCell align="end">{eur(group.sums.margin)}</AdminCell>
                <AdminCell align="end">{percent(group.marginBp)}</AdminCell>
              </AdminRow>
            ),
          )}
        </AdminTable>
      </div>
    </AdminSection>
  );
}

function ByFlorist({
  overview,
  canExport,
}: {
  readonly overview: PortfolioOverview;
  readonly canExport: boolean;
}): ReactElement {
  const range = overview.range;
  const cities = new Map(
    overview.orders.map((order) => [
      order.partnerCode ?? "",
      order.partnerCity,
    ]),
  );
  const owed = new Map<string, Map<string, bigint>>();
  for (const position of overview.positions) {
    const amounts = owed.get(position.partnerCode) ?? new Map<string, bigint>();
    amounts.set(
      position.currency,
      (amounts.get(position.currency) ?? 0n) + owedOf(position),
    );
    owed.set(position.partnerCode, amounts);
  }
  return (
    <AdminSection
      title={adminT("admin.finance.florist.title")}
      note={
        canExport ? (
          <CsvLink kind="florists" query={rangeQuery(range)}>
            {adminT("admin.finance.csv.florists")}
          </CsvLink>
        ) : undefined
      }
    >
      <Caption>{adminT("admin.finance.florist.caption")}</Caption>
      <div className="overflow-x-auto">
        <AdminTable
          columns={[
            { key: "florist", label: adminT("admin.finance.florist.florist") },
            { key: "city", label: adminT("admin.finance.florist.city") },
            {
              key: "orders",
              label: adminT("admin.finance.column.orders"),
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
              key: "margin",
              label: adminT("admin.finance.column.margin", currency),
              align: "end",
            },
            {
              key: "percent",
              label: adminT("admin.finance.column.marginPercent"),
              align: "end",
            },
            {
              key: "owed",
              label: adminT("admin.finance.florist.owedNow"),
              align: "end",
            },
          ]}
        >
          {overview.byPartner.map((group) => (
            <AdminRow key={group.key === "" ? "unassigned" : group.key}>
              <AdminCell>
                {group.key === "" ? (
                  adminT("admin.finance.florist.unassigned")
                ) : (
                  <AdminTableLink
                    href={`${FINANCE_ORDERS_PATH}?${rangeQuery(range, { partner: group.key })}`}
                  >
                    <AdminCode>{group.key}</AdminCode>
                  </AdminTableLink>
                )}
              </AdminCell>
              <AdminCell>{cities.get(group.key) ?? ""}</AdminCell>
              <GroupCells group={group} />
              <AdminCell align="end">
                {group.key === ""
                  ? ""
                  : nativeList(owed.get(group.key) ?? new Map())}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <AdminQuiet>{adminT("admin.finance.florist.note")}</AdminQuiet>
    </AdminSection>
  );
}

function VatByCountry({
  overview,
}: {
  readonly overview: PortfolioOverview;
}): ReactElement {
  const open = openTaxQuestions().length > 0;
  return (
    <AdminSection title={adminT("admin.finance.vat.title")}>
      <Caption>{adminT("admin.finance.vat.caption")}</Caption>
      <div className="overflow-x-auto">
        <AdminTable
          columns={[
            { key: "country", label: adminT("admin.finance.country.country") },
            {
              key: "orders",
              label: adminT("admin.finance.column.orders"),
              align: "end",
            },
            {
              key: "native",
              label: adminT("admin.finance.vat.native"),
              align: "end",
            },
            {
              key: "vat",
              label: adminT("admin.finance.column.vat", currency),
              align: "end",
            },
            { key: "status", label: adminT("admin.finance.vat.status") },
          ]}
        >
          {overview.byCountry.map((group) => (
            <AdminRow key={group.key}>
              <AdminCell>{countryName(group.key)}</AdminCell>
              <AdminCell align="end">
                {formatNumber(group.orders, "en")}
              </AdminCell>
              <AdminCell align="end">
                {nativeList(group.vatByCurrency)}
              </AdminCell>
              <AdminCell align="end">{eur(group.sums.vat)}</AdminCell>
              <AdminCell>{open ? <AccountantChip /> : null}</AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <AdminQuiet>{adminT("admin.finance.vat.note")}</AdminQuiet>
    </AdminSection>
  );
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("finance.view");
  const parsed = parseFinanceRange(
    await searchParams,
    session.timeZone,
    new Date(),
  );
  const canExport = can(session.roles, "finance.export");
  const mode = parsed.ok ? parsed.range.mode : "live";
  const overview = parsed.ok
    ? await readFinance(
        { userId: session.userId, requestId: await adminRequestId() },
        (executor) =>
          portfolioOverview(
            executor,
            parsed.range,
            session.timeZone,
            new Date(),
          ),
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
  if (overview !== null && overview.orders.length === 0) {
    body = (
      <AdminEmpty title={adminT("admin.finance.empty.title")}>
        <p className="m-0 text-[14px]">
          {adminT("admin.finance.empty.body", {
            from: overview.range.from,
            to: overview.range.to,
            basis: adminT(`admin.finance.basisShort.${overview.range.basis}`),
            mode: adminT(`admin.finance.modeShort.${overview.range.mode}`),
          })}
        </p>
      </AdminEmpty>
    );
  } else if (overview !== null) {
    const t = overview.totals;
    body = (
      <>
        {t.rateMissing > 0 ? (
          <p
            role="status"
            className="bg-blush m-0 rounded-[10px] px-[14px] py-[10px] text-[14px]"
          >
            {adminT("admin.finance.rateMissing", {
              count: t.rateMissing,
              currency: REPORTING,
            })}
          </p>
        ) : null}
        {t.final === 0 && t.provisional > 0 ? (
          <p
            role="status"
            className="bg-butter m-0 rounded-[10px] px-[14px] py-[10px] text-[14px]"
          >
            <strong>{adminT("admin.finance.allProvisional.title")}</strong>{" "}
            {adminT("admin.finance.allProvisional.body")}
          </p>
        ) : null}
        <div className="grid items-start gap-[16px] lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:gap-[24px]">
          <Totals overview={overview} />
          <div className="grid gap-[16px]">
            <Counts overview={overview} canExport={canExport} />
            <Owed overview={overview} />
          </div>
        </div>
        <ByCountry overview={overview} canExport={canExport} />
        <ByFlorist overview={overview} canExport={canExport} />
        <VatByCountry overview={overview} />
      </>
    );
  }

  return (
    <AdminFrame session={session} current="finance">
      <div className="grid gap-[16px] md:gap-[20px]">
        <div className="grid gap-[6px]">
          <AdminPageTitle>
            {adminT("admin.finance.title")}
            {mode === "test" ? (
              <span className="bg-card border-ink-3 ms-[10px] inline-flex rounded-full border border-dashed px-[10px] align-middle text-[14px] font-bold">
                {adminT("admin.finance.testLabel")}
              </span>
            ) : null}
          </AdminPageTitle>
          <p className="text-ink-2 m-0 text-[14px]">
            {mode === "test"
              ? adminT("admin.finance.testIntro")
              : adminT("admin.finance.intro", { currency: REPORTING })}
          </p>
        </div>
        <RangeForm
          action={FINANCE_PATH}
          state={state}
          zone={session.timeZone}
        />
        <TaxBanner />
        {body}
      </div>
    </AdminFrame>
  );
}
