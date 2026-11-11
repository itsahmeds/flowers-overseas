/**
 * @purpose GET /admin/risk: open risk reviews by deadline, decided in the last 7 days (021 AC-19)
 * @spec 021
 *
 * `risk.review` (admin, ops); every other role gets spec 012's "Not for your role" page. The open
 * reviews soonest deadline first (post-routing reviews with no deadline last), each row with the
 * short order id, the placed time in the viewer's zone, the delivery date and city of the
 * destination, the total by `formatMoney`, the score, the top three signals as plain labels, the
 * deadline with the time left, the recommendation and the Test or Demo marker. Then the reviews
 * decided in the last 7 days, under a disclosure. No recipient name, phone or street and no buyer
 * email is read, so none can render (AC-19). The shadow banner shows while `risk.gate` is off.
 * Headers (`noindex, nofollow`, `no-store, private`) are `next.config.ts`'s for every `/admin`
 * response. Artboards `admin-risk-desktop.dc.html` (table) and `admin-risk-mobile.dc.html`
 * (cards).
 */
import type { ReactElement } from "react";

import {
  adminRequestId,
  adminT,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import {
  adminRiskTransaction,
  listDecidedReviews,
  listOpenReviews,
  type ReviewView,
  topSignals,
} from "@/modules/risk";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminEmpty,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBanner,
  AdminRef,
  AdminRefLink,
} from "@/modules/ui/admin/AdminRecord";
import {
  RiskDeadline,
  RiskScore,
  RiskTags,
} from "@/modules/ui/admin/RiskReview";

import { AdminFrame } from "../frame";
import {
  at,
  decidedBy,
  deliveryDay,
  ModeChip,
  money,
  outcomeLabel,
  reasonLabel,
  signalTags,
  timeLeft,
} from "./view";

async function gateOn(): Promise<boolean> {
  const { isEnabled } = await import("@/lib/flags");
  try {
    return await isEnabled("risk.gate");
  } catch {
    return true;
  }
}

const reviewHref = (review: ReviewView): string =>
  `/admin/risk/${review.reviewId}`;

export default async function AdminRiskPage(): Promise<ReactElement> {
  const session = await requireAdminPage("risk.review");
  const now = new Date();
  const run = adminRiskTransaction({
    userId: session.userId,
    requestId: await adminRequestId(),
    action: "risk.read",
  });
  const { open, decided } = await run(async (executor) => ({
    open: await listOpenReviews(executor),
    decided: await listDecidedReviews(executor, now),
  }));
  const shadow = !(await gateOn());
  const zone = zoneCity(session.timeZone);
  const deadline = (review: ReviewView) => timeLeft(review.deadlineAt, now);
  const columns = [
    { key: "order", label: adminT("admin.risk.column.order") },
    { key: "placed", label: adminT("admin.risk.column.placed", { zone }) },
    { key: "delivery", label: adminT("admin.risk.column.delivery") },
    {
      key: "total",
      label: adminT("admin.risk.column.total"),
      align: "end" as const,
    },
    { key: "score", label: adminT("admin.risk.column.score") },
    { key: "signals", label: adminT("admin.risk.column.signals") },
    { key: "deadline", label: adminT("admin.risk.column.deadline", { zone }) },
    { key: "recommended", label: adminT("admin.risk.column.recommended") },
  ];
  const decidedColumns = [
    { key: "order", label: adminT("admin.risk.column.order") },
    { key: "decided", label: adminT("admin.risk.column.decided", { zone }) },
    { key: "outcome", label: adminT("admin.risk.column.outcome") },
    { key: "by", label: adminT("admin.risk.column.by") },
    { key: "reason", label: adminT("admin.risk.column.reason") },
  ];
  const deadlineChip = (review: ReviewView) => {
    const left = deadline(review);
    return (
      <RiskDeadline
        at={
          review.deadlineAt === null
            ? ""
            : at(review.deadlineAt, session.timeZone)
        }
        left={left.text}
        tone={left.tone}
      />
    );
  };
  return (
    <AdminFrame session={session} current="risk">
      <div className="grid gap-[16px] md:gap-[20px]">
        <header>
          <AdminPageTitle>{adminT("admin.risk.title")}</AdminPageTitle>
          {open.length === 0 ? null : (
            <p className="text-ink-3 mt-[6px] text-[14px]">
              {adminT("admin.risk.summary", { count: open.length })}
            </p>
          )}
        </header>
        {shadow ? (
          <AdminBanner>
            <span>{adminT("admin.risk.shadow")}</span>
            <AdminTableLink href="/admin/flags">
              {adminT("admin.risk.shadowLink")}
            </AdminTableLink>
          </AdminBanner>
        ) : null}
        {open.length === 0 ? (
          <AdminEmpty title={adminT("admin.risk.empty.title")}>
            <p>{adminT("admin.risk.empty.body")}</p>
          </AdminEmpty>
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable columns={columns}>
                {open.map((review) => (
                  <AdminRow key={review.reviewId}>
                    <AdminCell nowrap>
                      <span className="inline-flex flex-wrap items-center gap-[6px]">
                        <AdminRefLink href={reviewHref(review)}>
                          {review.reference}
                        </AdminRefLink>
                        <ModeChip mode={review.mode} />
                      </span>
                    </AdminCell>
                    <AdminCell nowrap>
                      {at(review.placedAt, session.timeZone)}
                    </AdminCell>
                    <AdminCell nowrap>
                      {deliveryDay(review.deliveryDate)}
                      {review.cityName === null ? null : (
                        <AdminSecondLine>{review.cityName}</AdminSecondLine>
                      )}
                    </AdminCell>
                    <AdminCell align="end">
                      {money(review.totalMinor, review.currency)}
                    </AdminCell>
                    <AdminCell>
                      <RiskScore
                        score={review.score}
                        high={review.score >= 70}
                      />
                    </AdminCell>
                    <AdminCell>
                      <RiskTags tags={signalTags(topSignals(review.signals))} />
                    </AdminCell>
                    <AdminCell>{deadlineChip(review)}</AdminCell>
                    <AdminCell nowrap>
                      {adminT(
                        `admin.risk.recommendation.${review.recommendation}`,
                      )}
                    </AdminCell>
                  </AdminRow>
                ))}
              </AdminTable>
            </div>
            <div className="md:hidden">
              <AdminCardRows>
                {open.map((review) => (
                  <AdminCardRow
                    key={review.reviewId}
                    href={reviewHref(review)}
                    line1={
                      <>
                        <AdminRef>{review.reference}</AdminRef>
                        <ModeChip mode={review.mode} />
                        <span className="ms-auto font-bold [font-variant-numeric:lining-nums_tabular-nums]">
                          {money(review.totalMinor, review.currency)}
                        </span>
                      </>
                    }
                    subline={
                      <>
                        <RiskScore
                          score={review.score}
                          high={review.score >= 70}
                        />
                        <RiskTags
                          tags={signalTags(topSignals(review.signals))}
                        />
                      </>
                    }
                    line2={`${deliveryDay(review.deliveryDate)}${
                      review.cityName === null ? "" : ` · ${review.cityName}`
                    } · ${adminT(`admin.risk.recommendation.${review.recommendation}`)}`}
                    line3={deadlineChip(review)}
                  />
                ))}
              </AdminCardRows>
            </div>
          </>
        )}
        <details className="grid gap-[10px]">
          <summary className="text-link inline-flex min-h-[40px] cursor-pointer items-center gap-[8px] text-[14px] font-bold">
            {adminT("admin.risk.decidedSummary", {
              count: String(decided.length),
            })}
          </summary>
          {decided.length === 0 ? (
            <p className="text-ink-3 text-[14px]">
              {adminT("admin.risk.decidedEmpty")}
            </p>
          ) : (
            <AdminTable columns={decidedColumns}>
              {decided.map((review) => (
                <AdminRow key={review.reviewId}>
                  <AdminCell nowrap>
                    <AdminRefLink href={reviewHref(review)}>
                      {review.reference}
                    </AdminRefLink>
                  </AdminCell>
                  <AdminCell nowrap>
                    {review.decidedAt === null
                      ? ""
                      : at(review.decidedAt, session.timeZone)}
                  </AdminCell>
                  <AdminCell>{outcomeLabel(review.status)}</AdminCell>
                  <AdminCell>{decidedBy(review)}</AdminCell>
                  <AdminCell>{reasonLabel(review.decisionReason)}</AdminCell>
                </AdminRow>
              ))}
            </AdminTable>
          )}
        </details>
      </div>
    </AdminFrame>
  );
}
