/**
 * @purpose GET /admin/reviews/[id]: one review, its facts and the four moderation actions (022a AC-16 to AC-18, AC-29)
 * @spec 022a
 *
 * `reviews.moderate` (admin, ops), 403 otherwise. The rating, the buyer's words exactly as sent
 * (in their own `lang`, `dir="auto"`, never editable), the display choice, the delivered month
 * and country, the bouquet, the florist's code, the order reference (linked only with
 * `orders.view`), the language, the status, our reply, the redaction line. The actions are plain
 * forms posting `moderateReviewAction`: publish; publish without text with a withholding reason;
 * remove with a removal reason and a required note; reply. No reason names the rating or the tone.
 * Artboard `admin-reviews-{desktop,mobile}.dc.html`, "One review".
 */
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";

import { adminRequestId, adminT, can, requireAdminPage } from "@/modules/admin";
import { formatDate } from "@/modules/i18n";
import { orderReference } from "@/modules/orders";
import {
  REMOVE_REASONS,
  reviewDetail,
  WITHHOLD_REASONS,
} from "@/modules/reviews";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminBanner,
  AdminCard,
  AdminKeyValues,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import { moderateReviewAction } from "../actions";
import { adminRead, at, reasonLabel, statusLabel } from "../view";

interface Props {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const RESULTS = ["done", "refused", "not_found"] as const;
const BUTTON =
  "bg-ink text-paper rounded-full px-[18px] py-[8px] text-[14px] font-bold";
const OUTLINE =
  "border-danger text-danger rounded-full border px-[18px] py-[8px] text-[14px] font-bold";

export default async function AdminReviewPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const session = await requireAdminPage("reviews.moderate");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const review = await adminRead(
    session.userId,
    await adminRequestId(),
    (executor) => reviewDetail(executor, id.data),
  );
  if (review === null) notFound();
  const query = await searchParams;
  const result = RESULTS.find((code) => code === query["result"]);
  const reference =
    review.order_id === null ? "" : orderReference(review.order_id);
  const delivered =
    review.delivered_on === null
      ? ""
      : `${formatDate(review.delivered_on, "en", "monthYear", "UTC")}${review.iso2 === null ? "" : ` · ${review.iso2}`}`;
  const hidden = (name: string, value: string) => (
    <input name={name} type="hidden" value={value} />
  );
  return (
    <AdminFrame session={session} current="reviews">
      <div className="grid gap-[16px] md:grid-cols-[2fr_1fr] md:gap-[20px]">
        <div className="grid content-start gap-[16px]">
          <header>
            <AdminPageTitle>
              {adminT("admin.reviews.detail.title", { reference })}
            </AdminPageTitle>
            <p className="text-ink-3 mt-[6px] text-[14px]">
              {adminT("admin.reviews.detail.received", {
                at: at(review.created_at, session.timeZone),
              })}
            </p>
          </header>
          {result === undefined ? null : (
            <AdminBanner>
              <span role="status">
                {adminT(`admin.reviews.result.${result}`)}
              </span>
            </AdminBanner>
          )}
          <AdminCard>
            <p
              className="display m-0 text-[28px]"
              data-fo-admin-rating={review.rating}
            >
              {adminT("admin.reviews.detail.rating", { rating: review.rating })}
            </p>
            {review.text === null ? (
              <p className="text-ink-3 mt-[10px] mb-0">
                {adminT("admin.reviews.detail.noText")}
              </p>
            ) : (
              <blockquote
                className="ms-0 mt-[10px] mb-0 whitespace-pre-wrap"
                dir="auto"
                lang={review.locale_code ?? undefined}
              >
                {review.text}
              </blockquote>
            )}
            <p className="text-ink-3 mt-[10px] mb-0 text-[13px]">
              {adminT("admin.reviews.detail.words")}
            </p>
            {review.redacted_at === null ? null : (
              <p className="mt-[10px] mb-0 text-[14px]">
                {adminT("admin.reviews.detail.redacted", {
                  at: at(review.redacted_at, session.timeZone),
                })}
              </p>
            )}
          </AdminCard>
          <AdminCard>
            <AdminKeyValues
              items={[
                {
                  key: "name",
                  label: adminT("admin.reviews.detail.nameShown"),
                  value:
                    review.display_name ??
                    adminT("admin.reviews.verifiedBuyer"),
                },
                {
                  key: "delivered",
                  label: adminT("admin.reviews.detail.delivered"),
                  value: delivered,
                },
                {
                  key: "bouquet",
                  label: adminT("admin.reviews.detail.bouquet"),
                  value: review.product_sku ?? "",
                },
                {
                  key: "florist",
                  label: adminT("admin.reviews.detail.florist"),
                  value: review.partner_code ?? "",
                },
                {
                  key: "order",
                  label: adminT("admin.reviews.detail.order"),
                  value:
                    review.order_id !== null &&
                    can(session.roles, "orders.view") ? (
                      <a
                        className="text-link underline"
                        href={`/admin/orders/${review.order_id}`}
                      >
                        {reference}
                      </a>
                    ) : (
                      reference
                    ),
                },
                {
                  key: "language",
                  label: adminT("admin.reviews.detail.language"),
                  value: review.locale_code ?? "",
                },
                {
                  key: "status",
                  label: adminT("admin.reviews.detail.status"),
                  value: statusLabel(review),
                },
              ]}
            />
            {review.moderated_at === null ? null : (
              <p className="text-ink-3 mt-[10px] mb-0 text-[13px]">
                {adminT("admin.reviews.detail.moderated", {
                  at: at(review.moderated_at, session.timeZone),
                  by: review.moderated_by_email ?? "",
                })}
              </p>
            )}
            {review.moderation_note === null ? null : (
              <p className="mt-[6px] mb-0 text-[14px]">
                {adminT("admin.reviews.detail.note", {
                  note: review.moderation_note,
                })}
              </p>
            )}
            {review.response_text === null ? null : (
              <div className="mt-[12px]">
                <p className="m-0 text-[13px] font-bold">
                  {adminT("admin.reviews.detail.reply")}
                </p>
                <p className="mt-[4px] mb-0 whitespace-pre-wrap">
                  {review.response_text}
                </p>
              </div>
            )}
          </AdminCard>
        </div>
        <aside className="order-first grid content-start gap-[12px] md:order-none">
          <AdminCard>
            <form action={moderateReviewAction} className="grid gap-[8px]">
              {hidden("reviewId", review.id)}
              {hidden("action", "publish")}
              <button className={BUTTON} type="submit">
                {adminT("admin.reviews.action.publish")}
              </button>
            </form>
          </AdminCard>
          <AdminCard title={adminT("admin.reviews.action.withhold")}>
            <form action={moderateReviewAction} className="grid gap-[8px]">
              {hidden("reviewId", review.id)}
              {hidden("action", "publish_without_text")}
              <p className="text-ink-3 m-0 text-[13px]">
                {adminT("admin.reviews.action.withholdBody")}
              </p>
              <fieldset className="m-0 grid gap-[4px] border-0 p-0">
                <legend className="text-[13px] font-bold">
                  {adminT("admin.reviews.action.reason")}
                </legend>
                {WITHHOLD_REASONS.map((reason) => (
                  <label
                    className="flex items-center gap-[8px] text-[14px]"
                    key={reason}
                  >
                    <input name="reason" required type="radio" value={reason} />
                    {reasonLabel(reason)}
                  </label>
                ))}
              </fieldset>
              <button className={BUTTON} type="submit">
                {adminT("admin.reviews.action.withhold")}
              </button>
            </form>
          </AdminCard>
          <AdminCard title={adminT("admin.reviews.detail.reply")}>
            <form action={moderateReviewAction} className="grid gap-[8px]">
              {hidden("reviewId", review.id)}
              {hidden("action", "reply")}
              <p className="text-ink-3 m-0 text-[13px]">
                {adminT("admin.reviews.action.replyBody")}
              </p>
              <label className="sr-only" htmlFor="reply-text">
                {adminT("admin.reviews.detail.reply")}
              </label>
              <textarea
                className="border-rule rounded-[8px] border p-[8px] text-[14px]"
                defaultValue={review.response_text ?? ""}
                id="reply-text"
                name="text"
                required
                rows={4}
              />
              <button className={BUTTON} type="submit">
                {adminT("admin.reviews.action.reply")}
              </button>
            </form>
          </AdminCard>
          <AdminCard title={adminT("admin.reviews.action.remove")}>
            <form action={moderateReviewAction} className="grid gap-[8px]">
              {hidden("reviewId", review.id)}
              {hidden("action", "remove")}
              <p className="text-ink-3 m-0 text-[13px]">
                {adminT("admin.reviews.action.removeBody")}
              </p>
              <fieldset className="m-0 grid gap-[4px] border-0 p-0">
                <legend className="text-[13px] font-bold">
                  {adminT("admin.reviews.action.reason")}
                </legend>
                {REMOVE_REASONS.map((reason) => (
                  <label
                    className="flex items-center gap-[8px] text-[14px]"
                    key={reason}
                  >
                    <input name="reason" required type="radio" value={reason} />
                    {reasonLabel(reason)}
                  </label>
                ))}
              </fieldset>
              <label className="text-[13px] font-bold" htmlFor="remove-note">
                {adminT("admin.reviews.action.note")}
              </label>
              <textarea
                aria-describedby="remove-note-hint"
                className="border-rule rounded-[8px] border p-[8px] text-[14px]"
                id="remove-note"
                name="note"
                required
                rows={3}
              />
              <p className="text-ink-3 m-0 text-[13px]" id="remove-note-hint">
                {adminT("admin.reviews.action.noteHint")}
              </p>
              <button className={OUTLINE} type="submit">
                {adminT("admin.reviews.action.remove")}
              </button>
            </form>
          </AdminCard>
          <p className="text-ink-3 m-0 text-[13px]">
            {adminT("admin.reviews.detail.auditNote")}
          </p>
        </aside>
      </div>
    </AdminFrame>
  );
}
