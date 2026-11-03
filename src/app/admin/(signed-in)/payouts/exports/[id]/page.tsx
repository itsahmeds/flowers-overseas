/**
 * @purpose GET /admin/payouts/exports/[id]: one Wise export, its rows and totals, download, mark paid, cancel (030a AC-29)
 * @spec 030a
 *
 * `payouts.manage` (admin, finance); ops and content get 403. Artboards
 * `admin-payout-export-{desktop,mobile}.dc.html`: the three steps (download, upload to Wise, mark
 * paid), the rows in statement-number order with the Wise recipient id, currency, amount and
 * status, one total per currency. Active: Download CSV (the `no-store` route of TASK-366), Mark
 * all paid, Mark one paid, Cancel export. Partly paid: Cancel is absent with the reason as text.
 * Cancelled: no control at all, the banner says what happened.
 */
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { adminRequestId, adminT, requireAdminPage } from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  type ExportDetail,
  type ExportPayout,
  exportDetail,
  readPayouts,
} from "@/modules/partners/payouts";
import {
  AdminActionDialog,
  AdminDialogClose as KeepButton,
} from "@/modules/ui/admin/AdminActionDialog";
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
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminBanner,
  AdminQuiet,
  AdminRecordHead,
  AdminRefLink,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../../frame";
import {
  cancelExportAction,
  markExportPaidAction,
  markPaidAction,
} from "../../actions";
import { PAYOUTS_PATH, parsePayoutOutcome } from "../../outcome";
import { ButtonForm, PayoutOutcomeLine, money, whenIn } from "../../view";

export const dynamic = "force-dynamic";

function StatusChip({
  payout,
  zone,
}: {
  readonly payout: ExportPayout;
  readonly zone: string;
}): ReactElement {
  return payout.status === "paid" ? (
    <AdminChip tone="ok">
      {adminT("admin.payouts.export.chip.paid", {
        date:
          payout.paidAt === null
            ? ""
            : formatDate(payout.paidAt, "en", "dayMonth", zone),
      })}
    </AdminChip>
  ) : (
    <AdminChip tone="sky">
      {adminT("admin.payouts.export.chip.exported")}
    </AdminChip>
  );
}

function MarkOne({
  payout,
  detail,
}: {
  readonly payout: ExportPayout;
  readonly detail: ExportDetail;
}): ReactElement | null {
  if (payout.status !== "statement_sent" || detail.cancelledAt !== null)
    return null;
  return (
    <ButtonForm
      action={markPaidAction}
      fields={{ payoutId: payout.id, from: "export", pageId: detail.id }}
      label={adminT("admin.payouts.export.markOne")}
      tone="ghost"
      accessibleName={adminT("admin.payouts.export.markOneLabel", {
        number: payout.statementNumber ?? "",
      })}
    />
  );
}

/** The confirm dialogs: mark all paid, cancel the export. */
function ConfirmDialog({
  id,
  openLabel,
  openTone,
  title,
  intro,
  keep,
  submit,
  submitTone,
  action,
  exportId,
}: {
  readonly id: string;
  readonly openLabel: string;
  readonly openTone: "ink" | "danger";
  readonly title: string;
  readonly intro: string;
  readonly keep: string;
  readonly submit: string;
  readonly submitTone: "primary" | "dangerFill";
  readonly action: (formData: FormData) => Promise<void>;
  readonly exportId: string;
}): ReactElement {
  return (
    <AdminActionDialog
      id={id}
      inline
      openLabel={openLabel}
      openTone={openTone}
      title={title}
    >
      <p className="text-ink-2 text-[14px]">{intro}</p>
      <form action={action} className="flex flex-wrap justify-end gap-[8px]">
        <input type="hidden" name="exportId" value={exportId} />
        <KeepButton label={keep} />
        <button type="submit" className={adminButtonClass(submitTone)}>
          {submit}
        </button>
      </form>
    </AdminActionDialog>
  );
}

export default async function AdminPayoutExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("payouts.manage");
  const { id } = await params;
  const outcome = parsePayoutOutcome(await searchParams);
  const detail = await readPayouts(
    { userId: session.userId, requestId: await adminRequestId() },
    (executor) => exportDetail(executor, id),
  );
  if (detail === undefined) notFound();
  const zone = session.timeZone;
  const created = whenIn(detail.createdAt, zone);
  const cancelled = detail.cancelledAt !== null;
  const paid = detail.payouts.filter((payout) => payout.status === "paid");
  const unpaid = detail.payouts.filter(
    (payout) => payout.status === "statement_sent",
  );
  const title = adminT("admin.payouts.export.title", {
    date: formatDate(detail.createdAt, "en", "dayMonthYear", zone),
  });

  const controls = cancelled ? null : (
    <div className="flex flex-wrap items-center gap-[8px]">
      {paid.length === 0 && detail.payouts.length > 0 ? (
        <ConfirmDialog
          id="cancel-export"
          openLabel={adminT("admin.payouts.export.cancel")}
          openTone="danger"
          title={adminT("admin.payouts.export.cancelTitle")}
          intro={adminT("admin.payouts.export.cancelIntro")}
          keep={adminT("admin.payouts.export.keep")}
          submit={adminT("admin.payouts.export.cancelSubmit")}
          submitTone="dangerFill"
          action={cancelExportAction}
          exportId={detail.id}
        />
      ) : null}
      {unpaid.length === 0 ? null : (
        <ConfirmDialog
          id="mark-all"
          openLabel={adminT("admin.payouts.export.markAll")}
          openTone="ink"
          title={adminT("admin.payouts.export.markAllTitle", {
            count: unpaid.length,
          })}
          intro={adminT("admin.payouts.export.markAllIntro")}
          keep={adminT("admin.payouts.export.notYet")}
          submit={adminT("admin.payouts.export.markAllSubmit", {
            count: formatNumber(unpaid.length, "en"),
          })}
          submitTone="primary"
          action={markExportPaidAction}
          exportId={detail.id}
        />
      )}
      {detail.payouts.length === 0 ? null : (
        <a
          href={`/admin/api/payouts/exports/${detail.id}`}
          className={adminButtonClass("primary")}
        >
          {adminT("admin.payouts.export.download")}
        </a>
      )}
    </div>
  );

  const sub = (
    <>
      <span>
        {detail.createdByName === null
          ? adminT("admin.payouts.export.createdAnon", created)
          : adminT("admin.payouts.export.created", {
              ...created,
              name: detail.createdByName,
            })}
      </span>
      {cancelled ? null : (
        <span>
          {adminT("admin.payouts.export.count", {
            count: detail.payouts.length,
          })}
        </span>
      )}
      <span>
        {adminT("admin.payouts.export.source", {
          currency: detail.sourceCurrency,
        })}
      </span>
    </>
  );

  const steps = cancelled ? null : (
    <ol
      aria-label={adminT("admin.payouts.export.steps.label")}
      className="grid gap-[10px] md:grid-cols-3"
    >
      {(["download", "upload", "mark"] as const).map((step, index) => (
        <li
          key={step}
          className="bg-card grid grid-cols-[28px_minmax(0,1fr)] gap-x-[10px] gap-y-[2px] rounded-[12px] px-[14px] py-[12px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
        >
          <span
            aria-hidden="true"
            className="bg-ink text-paper row-span-2 inline-flex size-[24px] items-center justify-center rounded-full text-[12px] font-bold"
          >
            {formatNumber(index + 1, "en")}
          </span>
          <b>{adminT(`admin.payouts.export.steps.${step}`)}</b>
          <span className="text-ink-3 text-[13px]">
            {adminT(`admin.payouts.export.steps.${step}Note`)}
          </span>
        </li>
      ))}
    </ol>
  );

  const banner = cancelled ? (
    <AdminBanner>
      {(() => {
        const at = whenIn(detail.cancelledAt ?? detail.createdAt, zone);
        const count = detail.cancelledCount ?? 0;
        return detail.cancelledByName === null
          ? adminT("admin.payouts.export.cancelled", { ...at, count })
          : adminT("admin.payouts.export.cancelledBy", {
              ...at,
              count,
              name: detail.cancelledByName,
            });
      })()}
    </AdminBanner>
  ) : paid.length > 0 && unpaid.length > 0 ? (
    <AdminBanner>
      {adminT("admin.payouts.export.partlyPaid", { count: paid.length })}
    </AdminBanner>
  ) : paid.length > 0 ? (
    <AdminBanner>{adminT("admin.payouts.export.allPaid")}</AdminBanner>
  ) : null;

  const rows =
    detail.payouts.length === 0 ? (
      cancelled ? null : (
        <p className="bg-card text-ink-2 rounded-[12px] px-[16px] py-[16px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
          {adminT("admin.payouts.export.empty")}
        </p>
      )
    ) : (
      <>
        <div className="hidden md:block">
          <AdminTable
            columns={[
              {
                key: "statement",
                label: adminT("admin.payouts.export.column.statement"),
              },
              {
                key: "florist",
                label: adminT("admin.payouts.export.column.florist"),
              },
              {
                key: "wise",
                label: adminT("admin.payouts.export.column.wise"),
              },
              {
                key: "currency",
                label: adminT("admin.payouts.export.column.currency"),
              },
              {
                key: "amount",
                label: adminT("admin.payouts.export.column.amount"),
                align: "end",
              },
              {
                key: "status",
                label: adminT("admin.payouts.export.column.status"),
              },
              {
                key: "action",
                label: adminT("admin.payouts.export.column.action"),
                hidden: true,
              },
            ]}
            foot={
              <span className="grid gap-[4px] text-[14px]">
                {detail.totals.map((total) => (
                  <span
                    key={total.currency}
                    className="flex flex-wrap items-baseline justify-between gap-[12px]"
                  >
                    <span>
                      <b>
                        {adminT("admin.payouts.export.totalIn", {
                          currency: total.currency,
                        })}
                      </b>{" "}
                      <AdminQuiet>
                        {adminT("admin.payouts.export.totalNote")}
                      </AdminQuiet>
                    </span>
                    <b className="[font-variant-numeric:lining-nums_tabular-nums]">
                      {money(total.totalMinor, total.currency)}
                    </b>
                  </span>
                ))}
              </span>
            }
          >
            {detail.payouts.map((payout) => (
              <AdminRow key={payout.id} muted={payout.status === "paid"}>
                <AdminCell nowrap>
                  <AdminRefLink href={`${PAYOUTS_PATH}/${payout.id}`}>
                    {payout.statementNumber ?? ""}
                  </AdminRefLink>
                </AdminCell>
                <AdminCell>
                  {payout.partnerName}
                  <AdminSecondLine>
                    <AdminCode>{payout.partnerCode}</AdminCode>
                  </AdminSecondLine>
                </AdminCell>
                <AdminCell nowrap>{payout.wiseRecipientId ?? ""}</AdminCell>
                <AdminCell>{payout.currency}</AdminCell>
                <AdminCell align="end">
                  {money(payout.totalMinor, payout.currency)}
                </AdminCell>
                <AdminCell>
                  <StatusChip payout={payout} zone={zone} />
                </AdminCell>
                <AdminCell align="end">
                  <MarkOne payout={payout} detail={detail} />
                </AdminCell>
              </AdminRow>
            ))}
          </AdminTable>
        </div>
        <div className="grid gap-[10px] md:hidden">
          <AdminCardRows>
            {detail.payouts.map((payout) => (
              <AdminCardRow
                key={payout.id}
                line1={
                  <>
                    <AdminRefLink href={`${PAYOUTS_PATH}/${payout.id}`}>
                      {payout.statementNumber ?? ""}
                    </AdminRefLink>
                    <StatusChip payout={payout} zone={zone} />
                    <span className="ms-auto font-bold [font-variant-numeric:lining-nums_tabular-nums]">
                      {money(payout.totalMinor, payout.currency)}
                    </span>
                  </>
                }
                line2={
                  <>
                    <AdminCode>{payout.partnerCode}</AdminCode>{" "}
                    {payout.partnerName}
                  </>
                }
                line3={payout.wiseRecipientId ?? ""}
              >
                <span className="mt-[6px] flex">
                  <MarkOne payout={payout} detail={detail} />
                </span>
              </AdminCardRow>
            ))}
          </AdminCardRows>
          {detail.totals.map((total) => (
            <p
              key={total.currency}
              className="bg-paper-2 flex justify-between gap-[12px] rounded-[12px] px-[14px] py-[10px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
            >
              <b>
                {adminT("admin.payouts.export.totalIn", {
                  currency: total.currency,
                })}
              </b>
              <b className="[font-variant-numeric:lining-nums_tabular-nums]">
                {money(total.totalMinor, total.currency)}
              </b>
            </p>
          ))}
        </div>
      </>
    );

  return (
    <AdminFrame session={session} current="payouts">
      <div className="grid gap-[20px]">
        <AdminBackLink href={PAYOUTS_PATH}>
          {adminT("admin.payouts.export.back")}
        </AdminBackLink>
        <div className="flex flex-wrap items-end justify-between gap-[12px]">
          <AdminRecordHead title={title} sub={sub} />
          {controls}
        </div>
        <PayoutOutcomeLine outcome={outcome} />
        {banner}
        {steps}
        {cancelled ? null : (
          <AdminSection title={adminT("admin.payouts.export.rows")}>
            {rows}
            <AdminQuiet>
              {adminT("admin.payouts.export.note", {
                currency: detail.sourceCurrency,
              })}
            </AdminQuiet>
          </AdminSection>
        )}
      </div>
    </AdminFrame>
  );
}
