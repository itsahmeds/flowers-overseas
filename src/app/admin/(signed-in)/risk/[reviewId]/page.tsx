/**
 * @purpose GET /admin/risk/[reviewId]: one review, its signals, Radar facts and three decisions (021 AC-19 to AC-22)
 * @spec 021
 *
 * `risk.review` (admin, ops). Every signal with its label, points and one-line reason; Radar's
 * facts; the deadline in the viewer's zone and at the destination, the recommendation and what
 * the deadline does; the order's summary with a link to its page and timeline. The buyer's email
 * and name are read **only** for `orders.view_pii`, and that view writes one `audit_log` read row
 * (`logAdminRead`); without it a sentence says why and nothing is read (AC-19). Approve, Cancel
 * and refund, and (with `risk.blocklist`) Cancel, refund and block each open a native dialog with
 * the reason picker and what happens, naming the amount to be refunded (AC-20, AC-21, AC-22).
 * A review opened after routing has no close action here, only the link to refund from the order
 * page (orchestrator ruling on the boards, PR 529). Decided and superseded reviews say who, when
 * and why. Artboards `admin-risk-desktop.dc.html` and `admin-risk-mobile.dc.html`.
 */
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";

import {
  adminRequestId,
  adminT,
  can,
  logAdminRead,
  orderDetailHref,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import {
  REASONS_BY_DECISION,
  type ReviewDecision,
  type ReviewView,
  adminRiskTransaction,
  reviewBuyer,
  reviewDetail,
} from "@/modules/risk";
import { AdminActionDialog } from "@/modules/ui/admin/AdminActionDialog";
import {
  adminButtonClass,
  type AdminButtonTone,
  AdminRefusal,
  AdminToast,
} from "@/modules/ui/admin/AdminControls";
import { AdminChip, AdminCode } from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminCard,
  AdminKeyValues,
  AdminQuiet,
  AdminRecordColumns,
  AdminRecordHead,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";
import { RiskDecisionForm } from "@/modules/ui/admin/RiskDecisionForm";
import {
  RiskDeadline,
  RiskDefault,
  RiskPii,
  RiskSignalList,
} from "@/modules/ui/admin/RiskReview";

import { AdminFrame } from "../../frame";
import { decideReviewAction } from "../actions";
import {
  at,
  decidedBy,
  deliveryDay,
  money,
  outcomeLabel,
  reasonLabel,
  signalRows,
  timeLeft,
} from "../view";

const ResultSchema = z
  .enum([
    "approved",
    "cancelled",
    "cancelled_blocked",
    "already_decided",
    "superseded",
    "refused",
  ])
  .optional()
  .catch(undefined);

const DECISION_TONE: Readonly<Record<ReviewDecision, AdminButtonTone>> = {
  approve: "ink",
  cancel: "danger",
  cancel_block: "dangerFill",
};

function Outcome({
  result,
  amount,
}: {
  readonly result: z.infer<typeof ResultSchema>;
  readonly amount: string;
}): ReactElement | null {
  if (result === undefined) return null;
  if (
    result === "approved" ||
    result === "cancelled" ||
    result === "cancelled_blocked"
  ) {
    return (
      <AdminToast>
        {adminT(`admin.risk.result.${result}`, { amount })}
      </AdminToast>
    );
  }
  return <AdminRefusal>{adminT(`admin.risk.result.${result}`)}</AdminRefusal>;
}

function DecisionDialog({
  review,
  decision,
  amount,
}: {
  readonly review: ReviewView;
  readonly decision: ReviewDecision;
  readonly amount: string;
}): ReactElement {
  const buyerLine = {
    text: adminT("admin.risk.dialog.buyerEmail"),
    quote: adminT("admin.risk.dialog.buyerLine", { amount }),
  };
  const consequences =
    decision === "approve"
      ? [
          { text: adminT("admin.risk.dialog.approveGo") },
          { text: adminT("admin.risk.dialog.approveNoRefund") },
        ]
      : decision === "cancel"
        ? [
            { text: adminT("admin.risk.dialog.refunded", { amount }) },
            buyerLine,
            { text: adminT("admin.risk.dialog.notBlocked") },
          ]
        : [
            { text: adminT("admin.risk.dialog.refundedFraud", { amount }) },
            buyerLine,
            { text: adminT("admin.risk.dialog.blocked") },
          ];
  const label = adminT(`admin.risk.action.${decision}`);
  return (
    <AdminActionDialog
      id={`risk-${decision}`}
      openLabel={label}
      openTone={DECISION_TONE[decision]}
      sheetCloseLabel={adminT("admin.risk.dialog.close")}
      title={`${label} ${review.reference}?`}
    >
      <RiskDecisionForm
        action={decideReviewAction}
        reviewId={review.reviewId}
        decision={decision}
        legend={adminT("admin.risk.dialog.why")}
        reasons={REASONS_BY_DECISION[decision].map((reason) => ({
          value: reason,
          label: adminT(`admin.risk.reason.${reason}`),
        }))}
        whatHappens={adminT("admin.risk.dialog.whatHappens")}
        consequences={consequences}
        keepLabel={adminT("admin.risk.dialog.keep")}
        confirmLabel={label}
        pendingLabel={adminT(`admin.risk.action.pending.${decision}`)}
        tone={DECISION_TONE[decision]}
      />
    </AdminActionDialog>
  );
}

export default async function AdminRiskReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ reviewId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("risk.review");
  const { reviewId } = await params;
  const result = ResultSchema.parse((await searchParams)["result"]);
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const run = adminRiskTransaction({ ...actor, action: "risk.read" });
  const review = await run((executor) => reviewDetail(executor, reviewId));
  if (review === null) notFound();
  const seesPii = can(session.roles, "orders.view_pii");
  const buyer = seesPii
    ? await run((executor) => reviewBuyer(executor, review.orderId))
    : null;
  if (seesPii) await logAdminRead(actor, "order", review.orderId);

  const now = new Date();
  const zone = zoneCity(session.timeZone);
  const amount = money(review.totalMinor, review.currency);
  const pre = review.kind === "pre_routing";
  const open = review.status === "open";
  const left = timeLeft(review.deadlineAt, now);
  const canBlock = can(session.roles, "risk.blocklist");
  const threeDs =
    review.liabilityShift === null
      ? adminT("admin.risk.detail.notReported")
      : review.liabilityShift
        ? adminT("admin.risk.detail.threeDsShift")
        : adminT("admin.risk.detail.threeDsNoShift");
  const notReported = adminT("admin.risk.detail.notReported");

  const decide = (
    <AdminCard title={adminT("admin.risk.detail.decide")}>
      {review.deadlineAt === null ? (
        <RiskDeadline
          big
          tone="none"
          at={adminT("admin.risk.detail.noDeadline")}
          left={adminT("admin.risk.detail.noDeadlineNote")}
        />
      ) : (
        <RiskDeadline
          big
          tone={left.tone}
          at={adminT("admin.risk.detail.decideBy", {
            date: at(review.deadlineAt, session.timeZone),
            zone,
          })}
          left={
            review.destinationZone === null
              ? left.text
              : adminT("admin.risk.detail.decideLocal", {
                  left: left.text,
                  local: at(review.deadlineAt, review.destinationZone),
                  destZone: review.destinationZone,
                })
          }
        />
      )}
      <RiskDefault
        title={adminT(`admin.risk.detail.recommended.${review.recommendation}`)}
      >
        {pre
          ? adminT(
              review.liabilityShift === true && review.score < 70
                ? "admin.risk.detail.defaultRelease"
                : "admin.risk.detail.defaultCancel",
            )
          : adminT("admin.risk.detail.postNote")}
      </RiskDefault>
      {pre ? (
        <div className="grid gap-[8px]">
          <DecisionDialog review={review} decision="approve" amount={amount} />
          <DecisionDialog review={review} decision="cancel" amount={amount} />
          {canBlock ? (
            <DecisionDialog
              review={review}
              decision="cancel_block"
              amount={amount}
            />
          ) : (
            <p className="text-ink-3 text-[13px]">
              {adminT("admin.risk.detail.blockUnavailable")}:{" "}
              {adminT("admin.risk.action.cancel_block")} ·{" "}
              {adminT("admin.risk.detail.blockAdminsOnly")}
            </p>
          )}
        </div>
      ) : (
        <a
          className={adminButtonClass("ink")}
          href={orderDetailHref(review.orderId)}
        >
          {adminT("admin.risk.detail.postOpen")}
        </a>
      )}
    </AdminCard>
  );

  const decided = (
    <AdminCard
      title={adminT(
        review.status === "superseded"
          ? "admin.risk.detail.closed"
          : "admin.risk.detail.decided",
      )}
    >
      <p className="text-[14px] leading-[1.45]">
        {review.decidedAt === null
          ? null
          : review.status === "superseded"
            ? adminT("admin.risk.detail.closedLine", {
                date: at(review.decidedAt, session.timeZone),
                zone,
              })
            : review.decidedBy?.startsWith("admin:") === true
              ? adminT("admin.risk.detail.decidedPerson", {
                  outcome: outcomeLabel(review.status),
                  name: decidedBy(review),
                  date: at(review.decidedAt, session.timeZone),
                  zone,
                  reason: reasonLabel(review.decisionReason),
                })
              : adminT("admin.risk.detail.decidedAuto", {
                  outcome: outcomeLabel(review.status),
                  date: at(review.decidedAt, session.timeZone),
                  zone,
                })}
      </p>
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "outcome",
            label: adminT("admin.risk.detail.outcome"),
            value: outcomeLabel(review.status),
          },
          {
            key: "order",
            label: adminT("admin.risk.detail.orderNow"),
            value: <AdminCode>{review.orderStatus}</AdminCode>,
          },
        ]}
      />
    </AdminCard>
  );

  const summary = (
    <AdminCard title={adminT("admin.risk.detail.summary")}>
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "mode",
            label: adminT("admin.risk.detail.mode"),
            value: adminT(`admin.orders.mode.${review.mode}`),
          },
          {
            key: "status",
            label: adminT("admin.risk.detail.status"),
            value: <AdminCode>{review.orderStatus}</AdminCode>,
          },
          {
            key: "destination",
            label: adminT("admin.risk.detail.destination"),
            value:
              review.destinationZone === null
                ? review.countryIso2
                : `${review.countryIso2} · ${review.destinationZone}`,
          },
          {
            key: "delivery",
            label: adminT("admin.risk.detail.delivery"),
            value: adminT("admin.risk.detail.deliveryValue", {
              date: deliveryDay(review.deliveryDate),
            }),
          },
          ...(review.cityName === null
            ? []
            : [
                {
                  key: "city",
                  label: adminT("admin.risk.detail.city"),
                  value: review.cityName,
                },
              ]),
          {
            key: "total",
            label: adminT("admin.risk.detail.total"),
            value: amount,
            numeric: true,
          },
        ]}
      />
      <a
        className="text-link text-[14px] font-bold"
        href={orderDetailHref(review.orderId)}
      >
        {adminT("admin.risk.detail.openOrder")}
      </a>
    </AdminCard>
  );

  return (
    <AdminFrame session={session} current="risk">
      <div className="grid gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/risk">
          {adminT("admin.risk.detail.back")}
        </AdminBackLink>
        <AdminRecordHead
          display
          title={review.reference}
          sub={
            <>
              <AdminChip tone="warn">
                {adminT(
                  pre
                    ? "admin.risk.detail.chipPre"
                    : "admin.risk.detail.chipPost",
                )}
              </AdminChip>
              <AdminCode>{review.orderStatus}</AdminCode>
              <span>
                {pre
                  ? adminT("admin.risk.detail.placed", {
                      date: at(review.placedAt, session.timeZone),
                      zone,
                    })
                  : adminT("admin.risk.detail.opened", {
                      date: at(review.openedAt, session.timeZone),
                      zone,
                    })}
              </span>
            </>
          }
        />
        <Outcome result={result} amount={amount} />
        <AdminRecordColumns
          main={
            <>
              <AdminSection
                title={adminT(
                  pre
                    ? "admin.risk.detail.whyHeld"
                    : "admin.risk.detail.whyOpen",
                )}
              >
                <RiskSignalList
                  rows={signalRows(review.signals)}
                  total={{
                    label: adminT("admin.risk.detail.score"),
                    value: (
                      <>
                        {adminT("admin.risk.detail.scoreValue", {
                          score: String(review.score),
                        })}
                        {review.score >= 70
                          ? ` · ${adminT("admin.risk.detail.high")}`
                          : null}
                      </>
                    ),
                    note: adminT("admin.risk.detail.scoreNote"),
                  }}
                />
              </AdminSection>
              <AdminSection title={adminT("admin.risk.detail.radar")}>
                <AdminCard>
                  <AdminKeyValues
                    items={[
                      {
                        key: "level",
                        label: adminT("admin.risk.detail.radarLevel"),
                        value:
                          review.radarRiskLevel === null ? (
                            notReported
                          ) : (
                            <AdminCode>{review.radarRiskLevel}</AdminCode>
                          ),
                      },
                      {
                        key: "score",
                        label: adminT("admin.risk.detail.radarScore"),
                        value:
                          review.radarRiskScore === null
                            ? notReported
                            : String(review.radarRiskScore),
                        numeric: true,
                      },
                      {
                        key: "outcome",
                        label: adminT("admin.risk.detail.radarOutcome"),
                        value:
                          review.radarOutcome === null ? (
                            notReported
                          ) : (
                            <AdminCode>{review.radarOutcome}</AdminCode>
                          ),
                      },
                      {
                        key: "threeDs",
                        label: adminT("admin.risk.detail.threeDs"),
                        value: threeDs,
                      },
                      {
                        key: "rules",
                        label: adminT("admin.risk.detail.rules"),
                        value: adminT("admin.risk.detail.rulesValue", {
                          version: String(review.rulesVersion),
                          date: at(review.assessedAt, session.timeZone),
                          zone,
                        }),
                      },
                    ]}
                  />
                </AdminCard>
              </AdminSection>
              <AdminSection title={adminT("admin.risk.detail.buyer")}>
                {buyer === null ? (
                  <AdminQuiet>
                    {adminT("admin.risk.detail.buyerHidden")}
                  </AdminQuiet>
                ) : (
                  <RiskPii>
                    <AdminKeyValues
                      variant="tight"
                      items={[
                        {
                          key: "email",
                          label: adminT("admin.risk.detail.buyerEmail"),
                          value: buyer.email,
                        },
                        {
                          key: "name",
                          label: adminT("admin.risk.detail.buyerName"),
                          value: buyer.name,
                        },
                      ]}
                    />
                    <AdminQuiet>
                      {adminT("admin.risk.detail.buyerLogged")}
                    </AdminQuiet>
                  </RiskPii>
                )}
              </AdminSection>
            </>
          }
          aside={
            <div className="grid gap-[16px]">
              {open ? decide : decided}
              {summary}
            </div>
          }
        />
      </div>
    </AdminFrame>
  );
}
