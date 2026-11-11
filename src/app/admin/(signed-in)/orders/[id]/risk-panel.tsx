/**
 * @purpose The order page's Risk card: the last check, the open or last review and its link (021 §5.3)
 * @spec 021
 *
 * Spec 021 §5.3 row 3 (TASK-494; artboard `admin-risk-desktop.dc.html` "order page Risk panel"):
 * in the rail under Summary. Anyone who can open the order sees the card; the review link needs
 * `risk.review`. Reads the order's latest `risk_assessment` and its open or last `risk_review`
 * through the risk module, on an admin-context read. States: held with a review open, passed,
 * decided by a person or at the deadline, recorded only (shadow mode), not checked yet, demo.
 * The evidence pack button (TASK-495, AC-28) is a plain link to `GET /admin/risk/evidence/{orderId}`
 * for a paid order; without `risk.evidence` a sentence replaces it.
 */
import type { ReactElement } from "react";

import type { AdminSession } from "@/lib/auth/admin";
import { adminT, can } from "@/modules/admin";
import { adminRiskTransaction, riskPanelFor } from "@/modules/risk";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import { AdminKeyValues, AdminCard } from "@/modules/ui/admin/AdminRecord";
import { RiskScore } from "@/modules/ui/admin/RiskReview";

import { at, decidedBy, outcomeLabel } from "../../risk/view";

export async function OrderRiskPanel({
  orderId,
  mode,
  status,
  session,
  requestId,
}: {
  readonly orderId: string;
  readonly mode: "demo" | "test" | "live";
  readonly status: string;
  readonly session: AdminSession;
  readonly requestId: string;
}): Promise<ReactElement> {
  const title = adminT("admin.risk.panel.title");
  const unpaid =
    status === "placed" ||
    status === "authorised" ||
    status === "payment_failed" ||
    status === "abandoned";
  // Spec 021 §5.2 "Evidence pack" (TASK-495): the download, or the sentence without the permission.
  const evidence = unpaid ? null : can(session.roles, "risk.evidence") ? (
    <a
      className={adminButtonClass("ink")}
      href={`/admin/risk/evidence/${orderId}`}
    >
      {adminT("admin.risk.panel.evidence")}
    </a>
  ) : (
    <p className="text-ink-3 text-[13px]">
      {adminT("admin.risk.panel.evidenceAdminsOnly")}
    </p>
  );
  const lastCheck = adminT("admin.risk.panel.lastCheck");
  if (mode === "demo") {
    return (
      <AdminCard title={title}>
        <AdminKeyValues
          variant="tight"
          items={[
            {
              key: "check",
              label: lastCheck,
              value: adminT("admin.risk.panel.demo"),
            },
          ]}
        />
      </AdminCard>
    );
  }
  const panel = await adminRiskTransaction({
    userId: session.userId,
    requestId,
    action: "risk.read",
  })((executor) => riskPanelFor(executor, orderId));
  const { assessment, review } = panel;
  if (assessment === null) {
    return (
      <AdminCard title={title}>
        <AdminKeyValues
          variant="tight"
          items={[
            {
              key: "check",
              label: lastCheck,
              value: unpaid
                ? adminT("admin.risk.panel.notChecked")
                : adminT("admin.risk.panel.reviewNone"),
            },
          ]}
        />
        {evidence}
      </AdminCard>
    );
  }
  const zone = session.timeZone;
  const check = (
    <span className="grid gap-[2px]">
      <span className="inline-flex items-center gap-[6px] font-bold">
        {assessment.enforced
          ? adminT(`admin.risk.panel.${assessment.decision}`)
          : adminT(`admin.risk.panel.shadow.${assessment.decision}`)}
        <span aria-hidden="true">·</span>
        <RiskScore score={assessment.score} high={assessment.score >= 70} />
      </span>
      <span className="text-ink-3 text-[13px]">
        {assessment.enforced
          ? adminT("admin.risk.panel.meta", {
              date: at(assessment.at, zone),
              version: String(assessment.rulesVersion),
            })
          : adminT("admin.risk.panel.shadowNote")}
      </span>
    </span>
  );
  const reviewText =
    review === null
      ? adminT("admin.risk.panel.reviewNone")
      : review.status === "open"
        ? review.deadlineAt === null
          ? adminT("admin.risk.panel.reviewOpenNoDeadline")
          : adminT("admin.risk.panel.reviewOpen", {
              date: at(review.deadlineAt, zone),
            })
        : adminT("admin.risk.panel.reviewDecided", {
            outcome: `${outcomeLabel(review.status)} (${decidedBy(review)})`,
            date: review.decidedAt === null ? "" : at(review.decidedAt, zone),
          });
  const reviewValue =
    review !== null && can(session.roles, "risk.review") ? (
      <a
        className="text-link font-bold"
        href={`/admin/risk/${review.reviewId}`}
      >
        {reviewText}
      </a>
    ) : (
      reviewText
    );
  return (
    <AdminCard title={title}>
      <AdminKeyValues
        variant="tight"
        items={[
          { key: "check", label: lastCheck, value: check },
          ...(assessment.enforced
            ? [
                {
                  key: "review",
                  label: adminT("admin.risk.panel.review"),
                  value: reviewValue,
                },
              ]
            : []),
        ]}
      />
      {evidence}
    </AdminCard>
  );
}
