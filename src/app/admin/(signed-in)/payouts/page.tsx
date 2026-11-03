/**
 * @purpose GET /admin/payouts: five payout groups, open adjustments, the waiver list, the export selection (030a AC-29)
 * @spec 030a
 *
 * `payouts.manage` (admin, finance); ops and content get 403, no session goes to sign-in (the
 * signed-in layout, spec 012 AC-1). SSR `no-store` and `noindex` from the admin document and
 * headers. Artboards `admin-payouts-{desktop,mobile}.dc.html`: the five groups in lifecycle order
 * on two thirds, the two decision lists on the last third (first at 390), a jump bar of counts.
 * A payout whose `sendStatement` would refuse shows no send control and its reason as text; a
 * sent statement whose florist has no Wise recipient id gets no checkbox, with the reason. Amounts
 * through `formatMoney`; periods are the florist's calendar dates with the zone named.
 */
import type { ReactElement, ReactNode } from "react";

import { isCurrencyCode } from "@/config/currencies";
import { adminRequestId, adminT, requireAdminPage } from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  type OpenAdjustment,
  type PayoutListRow,
  type PayoutsOverview,
  type WaiverCandidate,
  payoutsOverview,
  readPayouts,
} from "@/modules/partners/payouts";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminChip,
  AdminCode,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import {
  AdminRecordColumns,
  AdminRefLink,
} from "@/modules/ui/admin/AdminRecord";
import {
  type AdminSelectableRow,
  AdminSelectionSummary,
} from "@/modules/ui/admin/AdminSelectionSummary";

import { AdminFrame } from "../frame";
import {
  createExportAction,
  sendStatementAction,
  settleAdjustmentAction,
  waiveAdjustmentAction,
  waivePhotoAction,
} from "./actions";
import {
  type PayoutOutcome,
  parsePayoutOutcome,
  PAYOUTS_PATH,
} from "./outcome";
import {
  ButtonForm,
  PayoutOutcomeLine,
  ReasonDialog,
  SettleDialog,
  kindLabel,
  money,
  periodText,
  weekdayDay,
  whenIn,
} from "./view";

export const dynamic = "force-dynamic";

const EXPORT_FORM = "wise-export";

type GroupKey = "open" | "ready" | "sent" | "exported" | "paid";
type SideKey = "adjustments" | "waivers";

function payoutHref(id: string): string {
  return `${PAYOUTS_PATH}/${id}`;
}

/** A group (`.ad-sec` with its count, `.ad-n`), anchored for the jump bar. */
function Group({
  id,
  title,
  count,
  note,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  readonly note?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section id={id} className="grid min-w-0 scroll-mt-[20px] gap-[10px]">
      <h2 className="flex items-center gap-[8px] text-[20px] leading-[1.2]">
        {title}
        <span className="bg-paper-3 text-ink-2 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full px-[7px] text-[12px] font-bold tabular-nums">
          {formatNumber(count, "en")}
        </span>
      </h2>
      {children}
      {note === undefined ? null : (
        <p className="text-ink-3 text-[13px] leading-[1.45]">{note}</p>
      )}
    </section>
  );
}

/** A group's one empty line (`.ad-empty` at 16 px padding). */
function EmptyLine({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p className="bg-card text-ink-2 rounded-[12px] px-[16px] py-[16px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
      {children}
    </p>
  );
}

/** The florist cell: the code as the payout's link, the legal name under it. */
function Florist({ payout }: { readonly payout: PayoutListRow }): ReactElement {
  return (
    <>
      <AdminRefLink href={payoutHref(payout.id)}>
        {payout.partnerCode}
      </AdminRefLink>
      <AdminSecondLine>{payout.partnerName}</AdminSecondLine>
    </>
  );
}

function Period({ payout }: { readonly payout: PayoutListRow }): ReactElement {
  return (
    <>
      {periodText(payout.periodStart, payout.periodEnd)}
      <AdminSecondLine>{payout.zone}</AdminSecondLine>
    </>
  );
}

/** Why a ready payout cannot be sent, as text (AC-29), or the send button. */
function ReadyAction({
  payout,
}: {
  readonly payout: PayoutListRow;
}): ReactElement {
  const why = (chip: ReactNode, hint: string): ReactElement => (
    <p className="text-ink-2 flex flex-wrap items-center gap-[6px] text-[13px] leading-[1.45]">
      {chip} {hint}
    </p>
  );
  if (payout.refusals.includes("PAYOUT_REVIEW_OPEN")) {
    return why(
      <AdminChip tone="warn">
        {adminT("admin.payouts.review.chip", { count: payout.reviewCount })}
      </AdminChip>,
      adminT("admin.payouts.review.hint"),
    );
  }
  if (
    payout.refusals.includes("PAYOUT_ADJUSTMENT_OPEN") &&
    payout.blockingAdjustment !== null
  ) {
    return why(
      <AdminChip tone="bad">{adminT("admin.payouts.held.chip")}</AdminChip>,
      adminT("admin.payouts.held.hint", {
        reference: payout.blockingAdjustment.reference,
        date: formatDate(
          payout.blockingAdjustment.createdAt,
          "en",
          "dayMonth",
          payout.zone,
        ),
      }),
    );
  }
  if (payout.refusals.length > 0) {
    return why(
      <AdminChip>{adminT("admin.payouts.nothing.chip")}</AdminChip>,
      adminT("admin.payouts.nothing.hint"),
    );
  }
  return (
    <ButtonForm
      action={sendStatementAction}
      fields={{
        payoutId: payout.id,
        from: "list",
        florist: payout.partnerCode,
      }}
      label={adminT("admin.payouts.send")}
      pendingLabel={adminT("admin.payouts.sending")}
    />
  );
}

function WiseMissing({
  payout,
}: {
  readonly payout: PayoutListRow;
}): ReactElement {
  return (
    <span className="text-ink-2 text-[13px] leading-[1.45]">
      {adminT.rich("admin.payouts.wiseMissing", {
        link: (chunks) => (
          <AdminTableLink
            href={`/admin/partners/${encodeURIComponent(payout.partnerCode)}`}
          >
            {chunks}
          </AdminTableLink>
        ),
      })}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The five groups                                                            */
/* -------------------------------------------------------------------------- */

function OpenGroup({
  rows,
}: {
  readonly rows: readonly PayoutListRow[];
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.open")}</EmptyLine>;
  }
  return (
    <>
      <div className="hidden md:block">
        <AdminTable
          columns={[
            { key: "florist", label: adminT("admin.payouts.column.florist") },
            { key: "kind", label: adminT("admin.payouts.column.kind") },
            { key: "period", label: adminT("admin.payouts.column.period") },
            {
              key: "lines",
              label: adminT("admin.payouts.column.lines"),
              align: "end",
            },
            {
              key: "total",
              label: adminT("admin.payouts.column.total"),
              align: "end",
            },
            { key: "closes", label: adminT("admin.payouts.column.closes") },
          ]}
        >
          {rows.map((payout) => (
            <AdminRow key={payout.id}>
              <AdminCell nowrap>
                <Florist payout={payout} />
              </AdminCell>
              <AdminCell>{kindLabel(payout.kind)}</AdminCell>
              <AdminCell nowrap>
                <Period payout={payout} />
              </AdminCell>
              <AdminCell align="end">
                {formatNumber(payout.lineCount, "en")}
              </AdminCell>
              <AdminCell align="end">
                {money(payout.totalMinor, payout.currency)}
              </AdminCell>
              <AdminCell nowrap>
                {adminT("admin.payouts.closes", {
                  date: weekdayDay(payout.periodEnd),
                })}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <div className="md:hidden">
        <AdminCardRows>
          {rows.map((payout) => (
            <AdminCardRow
              key={payout.id}
              line1={<RowHead payout={payout} label={payout.partnerCode} />}
              line2={payout.partnerName}
              line3={adminT("admin.payouts.rowLineCloses", rowFacts(payout))}
            />
          ))}
        </AdminCardRows>
      </div>
    </>
  );
}

/** A 390 card's first line: the link and the total at the end (`.l1` + `.tot`). */
function RowHead({
  payout,
  label,
  before,
}: {
  readonly payout: PayoutListRow;
  readonly label: string;
  readonly before?: ReactNode;
}): ReactElement {
  return (
    <>
      {before}
      <AdminRefLink href={payoutHref(payout.id)}>{label}</AdminRefLink>
      <span className="ms-auto font-bold [font-variant-numeric:lining-nums_tabular-nums]">
        {money(payout.totalMinor, payout.currency)}
      </span>
    </>
  );
}

/** The facts of a 390 card's third line. */
function rowFacts(payout: PayoutListRow): Record<string, string | number> {
  return {
    kind: kindLabel(payout.kind),
    period: periodText(payout.periodStart, payout.periodEnd),
    zone: payout.zone,
    count: payout.lineCount,
    date: weekdayDay(payout.periodEnd),
  };
}

function ReadyGroup({
  rows,
}: {
  readonly rows: readonly PayoutListRow[];
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.ready")}</EmptyLine>;
  }
  return (
    <>
      <div className="hidden md:block">
        <AdminTable
          columns={[
            { key: "florist", label: adminT("admin.payouts.column.florist") },
            { key: "kind", label: adminT("admin.payouts.column.kind") },
            { key: "period", label: adminT("admin.payouts.column.period") },
            {
              key: "lines",
              label: adminT("admin.payouts.column.lines"),
              align: "end",
            },
            {
              key: "total",
              label: adminT("admin.payouts.column.total"),
              align: "end",
            },
            {
              key: "action",
              label: adminT("admin.payouts.column.action"),
              hidden: true,
            },
          ]}
        >
          {rows.map((payout) => (
            <AdminRow key={payout.id}>
              <AdminCell nowrap>
                <Florist payout={payout} />
              </AdminCell>
              <AdminCell>{kindLabel(payout.kind)}</AdminCell>
              <AdminCell nowrap>
                <Period payout={payout} />
              </AdminCell>
              <AdminCell align="end">
                {formatNumber(payout.lineCount, "en")}
              </AdminCell>
              <AdminCell align="end">
                {money(payout.totalMinor, payout.currency)}
              </AdminCell>
              <AdminCell>
                <ReadyAction payout={payout} />
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <div className="md:hidden">
        <AdminCardRows>
          {rows.map((payout) => (
            <AdminCardRow
              key={payout.id}
              line1={<RowHead payout={payout} label={payout.partnerCode} />}
              line2={payout.partnerName}
              line3={adminT("admin.payouts.rowLine", rowFacts(payout))}
            >
              <span className="mt-[6px] flex flex-wrap gap-[8px]">
                <ReadyAction payout={payout} />
              </span>
            </AdminCardRow>
          ))}
        </AdminCardRows>
      </div>
    </>
  );
}

/** The sent group and its export selection: one form per layout, so only visible boxes post. */
function SentGroup({
  rows,
  viewerZone,
}: {
  readonly rows: readonly PayoutListRow[];
  readonly viewerZone: string;
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.sent")}</EmptyLine>;
  }
  const exportable = rows.filter((row) => row.hasWiseRecipient);
  const selectable: AdminSelectableRow[] = exportable.flatMap((row) =>
    isCurrencyCode(row.currency)
      ? [
          {
            id: row.id,
            currency: row.currency,
            totalMinor: row.totalMinor.toString(),
          },
        ]
      : [],
  );
  const summaries = Array.from({ length: exportable.length + 1 }, (_, count) =>
    adminT("admin.payouts.selection.summary", { count }),
  );
  const sentOn = (row: PayoutListRow): string =>
    row.sentAt === null
      ? ""
      : formatDate(row.sentAt, "en", "dayMonth", viewerZone);
  const checkbox = (row: PayoutListRow, formId: string): ReactElement => (
    <input
      type="checkbox"
      name="payoutIds"
      value={row.id}
      form={formId}
      defaultChecked
      aria-label={adminT("admin.payouts.selectOne", {
        number: row.statementNumber ?? row.partnerCode,
      })}
      className="accent-ink size-[20px] cursor-pointer"
    />
  );
  const selbar = (formId: string, block: boolean): ReactElement =>
    exportable.length === 0 ? (
      <p className="text-ink-3 text-[13px]">
        {adminT("admin.payouts.selection.none")}
      </p>
    ) : (
      <form
        id={formId}
        action={createExportAction}
        className="bg-paper-2 flex flex-wrap items-center gap-[12px] rounded-[12px] px-[16px] py-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
      >
        <AdminSelectionSummary
          formId={formId}
          fieldName="payoutIds"
          rows={selectable}
          initial={exportable.map((row) => row.id)}
          summaries={summaries}
          separator={adminT("admin.payouts.selection.separator")}
        />
        <span className="grow" />
        <button
          type="submit"
          className={adminButtonClass("primary", { block })}
        >
          {adminT("admin.payouts.selection.create")}
        </button>
      </form>
    );
  return (
    <>
      <div className="hidden gap-[10px] md:grid">
        <AdminTable
          columns={[
            {
              key: "select",
              label: adminT("admin.payouts.column.select"),
              hidden: true,
            },
            {
              key: "statement",
              label: adminT("admin.payouts.column.statement"),
            },
            { key: "florist", label: adminT("admin.payouts.column.florist") },
            { key: "sent", label: adminT("admin.payouts.column.sent") },
            { key: "wise", label: adminT("admin.payouts.column.wise") },
            {
              key: "total",
              label: adminT("admin.payouts.column.total"),
              align: "end",
            },
          ]}
        >
          {rows.map((row) => (
            <AdminRow key={row.id}>
              <AdminCell>
                {row.hasWiseRecipient
                  ? checkbox(row, `${EXPORT_FORM}-d`)
                  : null}
              </AdminCell>
              <AdminCell nowrap>
                <AdminRefLink href={payoutHref(row.id)}>
                  {row.statementNumber ?? ""}
                </AdminRefLink>
              </AdminCell>
              <AdminCell nowrap>
                <Florist payout={row} />
              </AdminCell>
              <AdminCell nowrap>{sentOn(row)}</AdminCell>
              <AdminCell>
                {row.hasWiseRecipient ? (
                  adminT("admin.payouts.wiseSet")
                ) : (
                  <WiseMissing payout={row} />
                )}
              </AdminCell>
              <AdminCell align="end">
                {money(row.totalMinor, row.currency)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
        {selbar(`${EXPORT_FORM}-d`, false)}
      </div>
      <div className="grid gap-[10px] md:hidden">
        <AdminCardRows>
          {rows.map((row) => (
            <AdminCardRow
              key={row.id}
              line1={
                <RowHead
                  payout={row}
                  label={row.statementNumber ?? ""}
                  before={
                    row.hasWiseRecipient
                      ? checkbox(row, `${EXPORT_FORM}-m`)
                      : undefined
                  }
                />
              }
              line2={
                <>
                  <AdminCode>{row.partnerCode}</AdminCode> {row.partnerName}
                </>
              }
              line3={
                row.hasWiseRecipient
                  ? adminT("admin.payouts.sentOn", { date: sentOn(row) })
                  : adminT.rich("admin.payouts.sentOnMissing", {
                      date: sentOn(row),
                      link: (chunks) => (
                        <AdminTableLink
                          href={`/admin/partners/${encodeURIComponent(row.partnerCode)}`}
                        >
                          {chunks}
                        </AdminTableLink>
                      ),
                    })
              }
            />
          ))}
        </AdminCardRows>
        {selbar(`${EXPORT_FORM}-m`, true)}
      </div>
    </>
  );
}

function ExportedGroup({
  rows,
  viewerZone,
}: {
  readonly rows: readonly PayoutListRow[];
  readonly viewerZone: string;
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.exported")}</EmptyLine>;
  }
  const exportLink = (row: PayoutListRow): ReactElement => (
    <AdminTableLink href={`${PAYOUTS_PATH}/exports/${row.exportId ?? ""}`}>
      {adminT("admin.payouts.exportOf", {
        date:
          row.exportCreatedAt === null
            ? ""
            : formatDate(row.exportCreatedAt, "en", "dayMonth", viewerZone),
      })}
    </AdminTableLink>
  );
  return (
    <>
      <div className="hidden md:block">
        <AdminTable
          columns={[
            {
              key: "statement",
              label: adminT("admin.payouts.column.statement"),
            },
            { key: "florist", label: adminT("admin.payouts.column.florist") },
            { key: "export", label: adminT("admin.payouts.column.export") },
            {
              key: "total",
              label: adminT("admin.payouts.column.total"),
              align: "end",
            },
          ]}
        >
          {rows.map((row) => (
            <AdminRow key={row.id}>
              <AdminCell nowrap>
                <AdminRefLink href={payoutHref(row.id)}>
                  {row.statementNumber ?? ""}
                </AdminRefLink>
              </AdminCell>
              <AdminCell nowrap>
                <Florist payout={row} />
              </AdminCell>
              <AdminCell>{exportLink(row)}</AdminCell>
              <AdminCell align="end">
                {money(row.totalMinor, row.currency)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <div className="md:hidden">
        <AdminCardRows>
          {rows.map((row) => (
            <AdminCardRow
              key={row.id}
              line1={<RowHead payout={row} label={row.statementNumber ?? ""} />}
              line2={
                <>
                  <AdminCode>{row.partnerCode}</AdminCode> {row.partnerName}
                </>
              }
              line3={exportLink(row)}
            />
          ))}
        </AdminCardRows>
      </div>
    </>
  );
}

function PaidGroup({
  rows,
  viewerZone,
}: {
  readonly rows: readonly PayoutListRow[];
  readonly viewerZone: string;
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.paid")}</EmptyLine>;
  }
  const paidOn = (row: PayoutListRow): string =>
    row.paidAt === null
      ? ""
      : formatDate(row.paidAt, "en", "dayMonth", viewerZone);
  return (
    <>
      <div className="hidden md:block">
        <AdminTable
          columns={[
            {
              key: "statement",
              label: adminT("admin.payouts.column.statement"),
            },
            { key: "florist", label: adminT("admin.payouts.column.florist") },
            { key: "paid", label: adminT("admin.payouts.column.paid") },
            {
              key: "total",
              label: adminT("admin.payouts.column.total"),
              align: "end",
            },
          ]}
        >
          {rows.map((row) => (
            <AdminRow key={row.id} muted>
              <AdminCell nowrap>
                <AdminRefLink href={payoutHref(row.id)}>
                  {row.statementNumber ?? ""}
                </AdminRefLink>
              </AdminCell>
              <AdminCell nowrap>
                <Florist payout={row} />
              </AdminCell>
              <AdminCell nowrap>{paidOn(row)}</AdminCell>
              <AdminCell align="end">
                {money(row.totalMinor, row.currency)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <div className="md:hidden">
        <AdminCardRows>
          {rows.map((row) => (
            <AdminCardRow
              key={row.id}
              line1={<RowHead payout={row} label={row.statementNumber ?? ""} />}
              line2={
                <>
                  <AdminCode>{row.partnerCode}</AdminCode> {row.partnerName}
                </>
              }
              line3={adminT("admin.payouts.paidOn", { date: paidOn(row) })}
            />
          ))}
        </AdminCardRows>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The two decision lists                                                     */
/* -------------------------------------------------------------------------- */

function Adjustments({
  rows,
  outcome,
}: {
  readonly rows: readonly OpenAdjustment[];
  readonly outcome: PayoutOutcome;
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.adjustments")}</EmptyLine>;
  }
  return (
    <AdminCardRows>
      {rows.map((row) => (
        <AdminCardRow
          key={row.id}
          line1={
            <>
              <AdminRefLink href={`/admin/orders/${row.orderId}`}>
                {row.reference}
              </AdminRefLink>
              {row.holdsStatement ? (
                <AdminChip tone="bad">
                  {adminT("admin.payouts.adjustment.holds")}
                </AdminChip>
              ) : null}
            </>
          }
          line2={
            <>
              <AdminCode>{row.partnerCode}</AdminCode> {row.partnerName}
            </>
          }
          line3={adminT(
            "admin.payouts.adjustment.line",
            whenIn(row.createdAt, row.zone),
          )}
        >
          <span className="mt-[6px] flex flex-wrap gap-[8px]">
            <SettleDialog
              adjustment={row}
              outcome={outcome}
              action={settleAdjustmentAction}
            />
            <ReasonDialog
              dialog={`waive-${row.id}`}
              openLabel={adminT("admin.payouts.adjustment.waive")}
              title={adminT("admin.payouts.waive.title", {
                reference: row.reference,
              })}
              intro={adminT("admin.payouts.waive.intro")}
              hidden={{ adjustmentId: row.id }}
              submit={adminT("admin.payouts.waive.submit")}
              pending={adminT("admin.payouts.waive.pending")}
              outcome={outcome}
              action={waiveAdjustmentAction}
            />
          </span>
        </AdminCardRow>
      ))}
    </AdminCardRows>
  );
}

function Waivers({
  rows,
  outcome,
  now,
}: {
  readonly rows: readonly WaiverCandidate[];
  readonly outcome: PayoutOutcome;
  readonly now: Date;
}): ReactElement {
  if (rows.length === 0) {
    return <EmptyLine>{adminT("admin.payouts.empty.waivers")}</EmptyLine>;
  }
  return (
    <AdminCardRows>
      {rows.map((row) => (
        <AdminCardRow
          key={row.orderId}
          line1={
            <AdminRefLink href={`/admin/orders/${row.orderId}`}>
              {row.reference}
            </AdminRefLink>
          }
          line2={
            <>
              <AdminCode>{row.partnerCode}</AdminCode> {row.partnerName}
            </>
          }
          line3={adminT("admin.payouts.waiver.line", {
            ...whenIn(row.deliveredAt, row.zone),
            hours: Math.floor(
              (now.getTime() - row.deliveredAt.getTime()) / 3_600_000,
            ),
          })}
        >
          <span className="mt-[6px] flex flex-wrap gap-[8px]">
            <ReasonDialog
              dialog={`waiver-${row.orderId}`}
              openLabel={adminT("admin.payouts.waiver.open")}
              title={adminT("admin.payouts.waiver.title", {
                reference: row.reference,
              })}
              intro={adminT("admin.payouts.waiver.intro")}
              hidden={{ orderId: row.orderId }}
              submit={adminT("admin.payouts.waiver.submit")}
              pending={adminT("admin.payouts.waiver.pending")}
              outcome={outcome}
              action={waivePhotoAction}
            />
          </span>
        </AdminCardRow>
      ))}
    </AdminCardRows>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

function JumpBar({
  overview,
  order,
}: {
  readonly overview: PayoutsOverview;
  readonly order: readonly (GroupKey | SideKey)[];
}): ReactElement {
  return (
    <nav
      aria-label={adminT("admin.payouts.jumpLabel")}
      className="flex flex-wrap gap-[8px]"
    >
      {order.map((key) => {
        const count = overview[key].length;
        const warn = (key === "adjustments" || key === "waivers") && count > 0;
        return (
          <a
            key={key}
            href={`#${key}`}
            className={`inline-flex min-h-[32px] items-center gap-[8px] rounded-full px-[12px] text-[14px] font-bold no-underline ${
              warn
                ? "bg-butter text-ink shadow-[inset_0_0_0_1px_var(--color-warning)]"
                : "bg-card text-ink-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"
            }`}
          >
            {adminT(`admin.payouts.jump.${key}`)}
            <span className="tabular-nums">{formatNumber(count, "en")}</span>
          </a>
        );
      })}
    </nav>
  );
}

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("payouts.manage");
  const outcome = parsePayoutOutcome(await searchParams);
  const overview = await readPayouts(
    { userId: session.userId, requestId: await adminRequestId() },
    payoutsOverview,
  );
  const now = new Date();
  const nothing =
    overview.open.length +
      overview.ready.length +
      overview.sent.length +
      overview.exported.length +
      overview.paid.length ===
    0;
  const zone = session.timeZone;

  const groups = nothing ? (
    <div className="bg-card text-ink-2 grid justify-items-center gap-[8px] rounded-[12px] px-[24px] py-[40px] text-center shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <p className="font-display text-h3 text-ink">
        {adminT("admin.payouts.empty.allTitle")}
      </p>
      <p className="text-[14px]">{adminT("admin.payouts.empty.allBody")}</p>
    </div>
  ) : (
    <>
      <Group
        id="open"
        title={adminT("admin.payouts.group.open")}
        count={overview.open.length}
      >
        <OpenGroup rows={overview.open} />
      </Group>
      <Group
        id="ready"
        title={adminT("admin.payouts.group.ready")}
        count={overview.ready.length}
      >
        <ReadyGroup rows={overview.ready} />
      </Group>
      <Group
        id="sent"
        title={adminT("admin.payouts.group.sent")}
        count={overview.sent.length}
      >
        <SentGroup rows={overview.sent} viewerZone={zone} />
      </Group>
      <Group
        id="exported"
        title={adminT("admin.payouts.group.exported")}
        count={overview.exported.length}
      >
        <ExportedGroup rows={overview.exported} viewerZone={zone} />
      </Group>
      <Group
        id="paid"
        title={adminT("admin.payouts.group.paid")}
        count={overview.paid.length}
      >
        <PaidGroup rows={overview.paid} viewerZone={zone} />
      </Group>
    </>
  );

  const side = (
    <div className="grid gap-[24px]">
      <Group
        id="adjustments"
        title={adminT("admin.payouts.group.adjustments")}
        count={overview.adjustments.length}
        note={adminT("admin.payouts.adjustment.note")}
      >
        <Adjustments rows={overview.adjustments} outcome={outcome} />
      </Group>
      <Group
        id="waivers"
        title={adminT("admin.payouts.group.waivers")}
        count={overview.waivers.length}
        note={adminT("admin.payouts.waiver.note")}
      >
        <Waivers rows={overview.waivers} outcome={outcome} now={now} />
      </Group>
    </div>
  );

  return (
    <AdminFrame session={session} current="payouts">
      <div className="grid gap-[20px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.payouts.title")}</AdminPageTitle>
          <p className="text-ink-3 max-w-[72ch] text-[14px]">
            {adminT("admin.payouts.lead")}
          </p>
        </header>
        <PayoutOutcomeLine outcome={outcome} />
        <div className="hidden md:block">
          <JumpBar
            overview={overview}
            order={[
              "open",
              "ready",
              "sent",
              "exported",
              "paid",
              "adjustments",
              "waivers",
            ]}
          />
        </div>
        <div className="md:hidden">
          <JumpBar
            overview={overview}
            order={[
              "adjustments",
              "waivers",
              "open",
              "ready",
              "sent",
              "exported",
              "paid",
            ]}
          />
        </div>
        <AdminRecordColumns main={groups} aside={side} />
      </div>
    </AdminFrame>
  );
}
