/**
 * @purpose GET /admin/payouts/[id]: one payout, its lines, send, the PDF, mark paid (030a AC-29)
 * @spec 030a
 *
 * `payouts.manage` (admin, finance); ops and content get 403. Artboards
 * `admin-payout-detail-{desktop,mobile}.dc.html`: the lines on two thirds (order reference,
 * delivery date, product and tier, line kind with its note and review flag, amount), the status
 * card on the last third. While the payout is a draft: add a line, remove a manual line (never one
 * a settled adjustment points to), mark a flagged line reviewed, and **Send statement** only when
 * `sendStatement` would pass; otherwise every reason that applies is shown as text with its code
 * and the button is absent (AC-29). Once sent: the number, who sent it, the email's state, the PDF
 * through a 5-minute private link, and Mark paid while it is in an active export.
 */
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import {
  adminRequestId,
  adminT,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  type PayoutDetail,
  type PayoutLineView,
  type SendRefusal,
  payoutDetail,
  readPayouts,
} from "@/modules/partners/payouts";
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
  AdminBackLink,
  AdminCard,
  AdminKeyValues,
  AdminLabel,
  AdminQuiet,
  AdminRecordColumns,
  AdminRecordHead,
  AdminRefLink,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import {
  addLineAction,
  markPaidAction,
  removeLineAction,
  resolveReviewAction,
  sendStatementAction,
} from "../actions";
import { PAYOUTS_PATH, parsePayoutOutcome } from "../outcome";
import {
  AddLineDialog,
  ButtonForm,
  PayoutOutcomeLine,
  PayoutStatusChip,
  calendarDay,
  money,
  periodText,
  weekdayDay,
  whenIn,
} from "../view";

export const dynamic = "force-dynamic";

/** "Amber Hour · 18 stems × 2", one product line of an order line. */
function itemText(item: PayoutLineView["items"][number]): string {
  const name = item.productName ?? "";
  const base =
    item.tierStems === null
      ? adminT("admin.payouts.detail.itemNoStems", { name })
      : adminT("admin.payouts.detail.item", { name, stems: item.tierStems });
  return item.quantity === 1
    ? base
    : adminT("admin.payouts.detail.quantity", {
        item: base,
        quantity: item.quantity,
      });
}

function Bouquet({
  line,
}: {
  readonly line: PayoutLineView;
}): ReactElement | null {
  const [first, ...rest] = line.items;
  if (first === undefined) return null;
  return (
    <>
      {itemText(first)}
      {rest.map((item, index) => (
        <AdminSecondLine key={index}>{itemText(item)}</AdminSecondLine>
      ))}
    </>
  );
}

/** The line kind, its note and flag, and the draft's controls for it. */
function LineKind({
  line,
  payout,
}: {
  readonly line: PayoutLineView;
  readonly payout: PayoutDetail;
}): ReactElement {
  const draft = payout.status === "draft";
  const removable = draft && line.kind !== "order" && !line.settled;
  return (
    <>
      {adminT(`admin.payouts.detail.lineKind.${line.kind}`)}
      {line.kind !== "order" && line.note !== null ? (
        <AdminSecondLine>{line.note}</AdminSecondLine>
      ) : null}
      {line.reviewOpen === null ? null : (
        <AdminSecondLine>
          <AdminChip tone="warn">
            {adminT("admin.payouts.detail.reviewChip")}
          </AdminChip>
        </AdminSecondLine>
      )}
      {draft && line.reviewOpen !== null ? (
        <span className="mt-[6px] block">
          <ButtonForm
            action={resolveReviewAction}
            fields={{ payoutId: payout.id, lineId: line.id }}
            label={adminT("admin.payouts.detail.markReviewed")}
            tone="ghost"
            accessibleName={adminT("admin.payouts.detail.markReviewedLabel", {
              reference: line.reference ?? "",
            })}
          />
        </span>
      ) : null}
      {removable ? (
        <span className="mt-[6px] block">
          <ButtonForm
            action={removeLineAction}
            fields={{ payoutId: payout.id, lineId: line.id }}
            label={adminT("admin.payouts.detail.remove")}
            tone="ghost"
            accessibleName={adminT("admin.payouts.detail.removeLabel", {
              kind: adminT(`admin.payouts.detail.lineKind.${line.kind}`),
              amount: money(line.amountMinor, payout.currency),
            })}
          />
        </span>
      ) : null}
    </>
  );
}

function Lines({ payout }: { readonly payout: PayoutDetail }): ReactElement {
  const total = (
    <span className="flex flex-wrap items-baseline justify-between gap-[12px] text-[14px]">
      <span>
        <b>{adminT("admin.payouts.detail.total")}</b>{" "}
        <AdminQuiet>
          {adminT("admin.payouts.detail.totalNote", {
            count: payout.lines.length,
          })}
        </AdminQuiet>
      </span>
      <b className="[font-variant-numeric:lining-nums_tabular-nums]">
        {money(payout.totalMinor, payout.currency)}
      </b>
    </span>
  );
  const reference = (line: PayoutLineView): ReactNode =>
    line.orderId === null || line.reference === null ? null : (
      <AdminRefLink href={`/admin/orders/${line.orderId}`}>
        {line.reference}
      </AdminRefLink>
    );
  if (payout.lines.length === 0) {
    return (
      <p className="bg-card text-ink-2 rounded-[12px] px-[16px] py-[16px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
        {adminT("admin.payouts.detail.noLines")}
      </p>
    );
  }
  return (
    <>
      <div className="hidden md:block">
        <AdminTable
          columns={[
            {
              key: "order",
              label: adminT("admin.payouts.detail.column.order"),
            },
            { key: "date", label: adminT("admin.payouts.detail.column.date") },
            {
              key: "bouquet",
              label: adminT("admin.payouts.detail.column.bouquet"),
            },
            { key: "line", label: adminT("admin.payouts.detail.column.line") },
            {
              key: "amount",
              label: adminT("admin.payouts.detail.column.amount"),
              align: "end",
            },
          ]}
          foot={total}
        >
          {payout.lines.map((line) => (
            <AdminRow key={line.id}>
              <AdminCell nowrap>{reference(line)}</AdminCell>
              <AdminCell nowrap>
                {line.deliveryDate === null
                  ? null
                  : calendarDay(line.deliveryDate)}
              </AdminCell>
              <AdminCell>
                <Bouquet line={line} />
              </AdminCell>
              <AdminCell>
                <LineKind line={line} payout={payout} />
              </AdminCell>
              <AdminCell align="end">
                {money(line.amountMinor, payout.currency)}
              </AdminCell>
            </AdminRow>
          ))}
        </AdminTable>
      </div>
      <div className="grid gap-[10px] md:hidden">
        <AdminCardRows>
          {payout.lines.map((line) => (
            <AdminCardRow
              key={line.id}
              line1={
                <>
                  {reference(line) ?? (
                    <b>
                      {adminT(`admin.payouts.detail.lineKind.${line.kind}`)}
                    </b>
                  )}
                  <span className="ms-auto font-bold [font-variant-numeric:lining-nums_tabular-nums]">
                    {money(line.amountMinor, payout.currency)}
                  </span>
                </>
              }
              line2={<Bouquet line={line} />}
              line3={
                line.deliveryDate === null
                  ? null
                  : calendarDay(line.deliveryDate)
              }
            >
              <span className="text-[14px]">
                <LineKind line={line} payout={payout} />
              </span>
            </AdminCardRow>
          ))}
        </AdminCardRows>
        <div className="bg-paper-2 rounded-[12px] px-[14px] py-[10px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
          {total}
        </div>
      </div>
    </>
  );
}

/** One refusal of `sendStatement` as text with its code (`.ad-refuse`). */
function refusalText(code: SendRefusal, payout: PayoutDetail): string {
  switch (code) {
    case "PAYOUT_NOT_CLOSED":
      return adminT("admin.payouts.detail.refusal.PAYOUT_NOT_CLOSED", {
        date: weekdayDay(payout.periodEnd),
        zone: payout.zone,
      });
    case "PAYOUT_TOTAL_NOT_POSITIVE":
      return adminT("admin.payouts.detail.refusal.PAYOUT_TOTAL_NOT_POSITIVE", {
        amount: money(payout.totalMinor, payout.currency),
      });
    case "PAYOUT_REVIEW_OPEN":
      return adminT("admin.payouts.detail.refusal.PAYOUT_REVIEW_OPEN", {
        count: payout.reviewCount,
      });
    case "PAYOUT_ADJUSTMENT_OPEN":
      return adminT("admin.payouts.detail.refusal.PAYOUT_ADJUSTMENT_OPEN", {
        reference: payout.blockingAdjustment?.reference ?? "",
        date:
          payout.blockingAdjustment === null
            ? ""
            : formatDate(
                payout.blockingAdjustment.createdAt,
                "en",
                "dayMonth",
                payout.zone,
              ),
      });
    case "PAYOUT_STATUS_ILLEGAL":
      return adminT("admin.payouts.detail.refusal.PAYOUT_STATUS_ILLEGAL");
  }
}

function Refusals({ payout }: { readonly payout: PayoutDetail }): ReactElement {
  return (
    <div
      data-testid="send-refusals"
      className="bg-paper-2 grid gap-[8px] rounded-[10px] px-[14px] py-[12px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
    >
      <b>{adminT("admin.payouts.detail.sendUnavailable")}</b>
      {payout.refusals.map((code) => (
        <p key={code} className="text-ink-2 grid gap-[2px]">
          <span>{refusalText(code, payout)}</span>
          <AdminCode>{code}</AdminCode>
        </p>
      ))}
    </div>
  );
}

function StatusCard({
  payout,
  viewerZone,
}: {
  readonly payout: PayoutDetail;
  readonly viewerZone: string;
}): ReactElement {
  const total = (
    <div className="border-rule grid gap-[2px] border-t pt-[10px]">
      <AdminLabel>
        {adminT(
          payout.status === "draft" && payout.closedAt === null
            ? "admin.payouts.detail.totalSoFar"
            : "admin.payouts.detail.totalLabel",
        )}
      </AdminLabel>
      <strong className="font-display text-[28px] leading-[1.1] [font-variant-numeric:lining-nums_tabular-nums]">
        {money(payout.totalMinor, payout.currency)}
      </strong>
    </div>
  );
  let body: ReactNode;
  if (payout.status === "draft") {
    body = (
      <>
        {payout.closedAt === null ? null : (
          <AdminQuiet>
            {adminT(
              "admin.payouts.detail.closedAt",
              whenIn(payout.closedAt, payout.zone),
            )}
          </AdminQuiet>
        )}
        {total}
        {payout.refusals.length > 0 ? (
          <Refusals payout={payout} />
        ) : (
          <>
            <ButtonForm
              action={sendStatementAction}
              fields={{
                payoutId: payout.id,
                from: "detail",
                florist: payout.partnerCode,
              }}
              label={adminT("admin.payouts.send")}
              pendingLabel={adminT("admin.payouts.sending")}
              tone="primary"
            />
            <AdminQuiet>{adminT("admin.payouts.detail.sendNote")}</AdminQuiet>
          </>
        )}
        <AdminQuiet>{adminT("admin.payouts.detail.numberNote")}</AdminQuiet>
      </>
    );
  } else {
    const sent =
      payout.sentAt === null
        ? ""
        : adminT(
            payout.sentByName === null
              ? "admin.payouts.detail.sentWhenAnon"
              : "admin.payouts.detail.sentWhen",
            {
              when: formatDate(payout.sentAt, "en", "dayMonthTime", viewerZone),
              zone: zoneCity(viewerZone),
              name: payout.sentByName ?? "",
            },
          );
    body = (
      <>
        {total}
        <AdminKeyValues
          variant="tight"
          items={[
            {
              key: "number",
              label: adminT("admin.payouts.detail.number"),
              value: <b>{payout.statementNumber ?? ""}</b>,
            },
            {
              key: "sent",
              label: adminT("admin.payouts.detail.sent"),
              value: sent,
            },
            {
              key: "email",
              label: adminT("admin.payouts.detail.email"),
              value: adminT("admin.payouts.detail.emailStatus", {
                status: payout.emailStatus ?? "queued",
              }),
            },
          ]}
        />
        {payout.hasPdf ? (
          <>
            <AdminTableLink href={`/admin/api/payouts/${payout.id}/statement`}>
              {adminT("admin.payouts.detail.openPdf")}
            </AdminTableLink>
            <AdminQuiet>{adminT("admin.payouts.detail.pdfNote")}</AdminQuiet>
          </>
        ) : (
          <AdminQuiet>{adminT("admin.payouts.detail.pdfPending")}</AdminQuiet>
        )}
        {payout.status === "paid" ? (
          <AdminQuiet>
            {payout.paidByName === null
              ? adminT("admin.payouts.detail.paidNoteAnon")
              : adminT("admin.payouts.detail.paidNote", {
                  name: payout.paidByName,
                })}
          </AdminQuiet>
        ) : payout.exportId === null ? (
          <AdminQuiet>
            {adminT("admin.payouts.detail.awaitingExport")}
          </AdminQuiet>
        ) : (
          <>
            <AdminQuiet>
              {adminT.rich("admin.payouts.detail.inExport", {
                date:
                  payout.exportCreatedAt === null
                    ? ""
                    : formatDate(
                        payout.exportCreatedAt,
                        "en",
                        "dayMonth",
                        viewerZone,
                      ),
                link: (chunks) => (
                  <AdminTableLink
                    href={`${PAYOUTS_PATH}/exports/${payout.exportId ?? ""}`}
                  >
                    {chunks}
                  </AdminTableLink>
                ),
              })}
            </AdminQuiet>
            <ButtonForm
              action={markPaidAction}
              fields={{ payoutId: payout.id, from: "detail" }}
              label={adminT("admin.payouts.detail.markPaid")}
            />
          </>
        )}
      </>
    );
  }
  return (
    <AdminCard>
      <AdminLabel>{adminT("admin.payouts.detail.status")}</AdminLabel>
      <div>
        <PayoutStatusChip payout={payout} viewerZone={viewerZone} />
      </div>
      {body}
    </AdminCard>
  );
}

export default async function AdminPayoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("payouts.manage");
  const { id } = await params;
  const outcome = parsePayoutOutcome(await searchParams);
  const payout = await readPayouts(
    { userId: session.userId, requestId: await adminRequestId() },
    (executor) => payoutDetail(executor, id),
  );
  if (payout === undefined) notFound();
  const period = periodText(payout.periodStart, payout.periodEnd);
  const sub =
    payout.kind === "prepaid" ? (
      <>
        <AdminCode>{payout.partnerCode}</AdminCode>
        <span>
          {adminT("admin.payouts.detail.prepaidLine", {
            rank: formatNumber(payout.prepaidRank ?? 0, "en"),
            limit: formatNumber(payout.prepaidLimit, "en"),
          })}
        </span>
      </>
    ) : payout.kind === "per_order" ? (
      <>
        <AdminCode>{payout.partnerCode}</AdminCode>
        <span>{adminT("admin.payouts.detail.perOrderLine")}</span>
      </>
    ) : (
      <>
        <AdminCode>{payout.partnerCode}</AdminCode>
        <span>{payout.partnerName}</span>
        <span>{payout.zone}</span>
        <span>{payout.currency}</span>
      </>
    );
  const orders = payout.lines.flatMap((line) =>
    line.kind === "order" && line.orderId !== null && line.reference !== null
      ? [{ id: line.orderId, reference: line.reference }]
      : [],
  );
  return (
    <AdminFrame session={session} current="payouts">
      <div className="grid gap-[20px]">
        <AdminBackLink href={PAYOUTS_PATH}>
          {adminT("admin.payouts.detail.back")}
        </AdminBackLink>
        <div className="flex flex-wrap items-end justify-between gap-[12px]">
          <AdminRecordHead
            title={adminT("admin.payouts.detail.title", {
              kind: payout.kind,
              period,
            })}
            sub={sub}
          />
          {payout.status === "draft" ? (
            <AddLineDialog
              payoutId={payout.id}
              currency={payout.currency}
              orders={orders}
              outcome={outcome}
              action={addLineAction}
            />
          ) : null}
        </div>
        <PayoutOutcomeLine outcome={outcome} />
        <AdminRecordColumns
          main={
            <AdminSection title={adminT("admin.payouts.detail.lines")}>
              <Lines payout={payout} />
              <AdminQuiet>
                {adminT("admin.payouts.detail.linesNote")}
              </AdminQuiet>
            </AdminSection>
          }
          aside={<StatusCard payout={payout} viewerZone={session.timeZone} />}
        />
      </div>
    </AdminFrame>
  );
}
