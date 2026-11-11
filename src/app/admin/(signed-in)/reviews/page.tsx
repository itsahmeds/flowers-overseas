/**
 * @purpose GET /admin/reviews: the reviews queue, oldest first, and the exit-metric average (022a AC-16, AC-20)
 * @spec 022a
 *
 * `reviews.moderate` (admin, ops); every other role gets spec 012's "Not for your role" page (403,
 * nothing written). Status tabs (pending by default), filters by rating and country, the queue
 * oldest first with the waiting time and the 72-hour mark, and the Phase 1 exit reading: the
 * average of every first-party rating that is not removed, to two decimals, with its count. No
 * review text and no name are read here: the row says whether there is a comment and whether a
 * first name is shown. Artboard `admin-reviews-{desktop,mobile}.dc.html`.
 */
import type { ReactElement } from "react";

import { REVIEW_PENDING_ALERT_HOURS } from "@/config/reviews";
import {
  adminRequestId,
  adminT,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { orderReference } from "@/modules/orders";
import {
  exitMetric,
  QUEUE_STATUSES,
  QueueFilterSchema,
  queueCounts,
  reviewQueue,
} from "@/modules/reviews";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminChip,
  AdminEmpty,
  AdminFilterBar,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import { AdminCard, AdminRefLink } from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../frame";
import { adminRead, at, average, waitedHours } from "./view";

interface Props {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReviewsPage({
  searchParams,
}: Props): Promise<ReactElement> {
  const session = await requireAdminPage("reviews.moderate");
  const now = new Date();
  const filter = QueueFilterSchema.parse(await searchParams);
  const { items, counts, metric } = await adminRead(
    session.userId,
    await adminRequestId(),
    async (executor) => ({
      items: await reviewQueue(executor, filter),
      counts: await queueCounts(executor),
      metric: await exitMetric(executor),
    }),
  );
  const zone = zoneCity(session.timeZone);
  const href = (status: string) => `/admin/reviews?status=${status}`;
  const comment = (item: (typeof items)[number]) =>
    [
      adminT(
        item.has_text ? "admin.reviews.hasComment" : "admin.reviews.noComment",
      ),
      adminT(
        item.named ? "admin.reviews.firstName" : "admin.reviews.verifiedBuyer",
      ),
      item.iso2 ?? "",
    ]
      .filter((part) => part !== "")
      .join(" · ");
  const waiting = (item: (typeof items)[number]) => {
    const hours = waitedHours(item, now);
    return (
      <>
        {adminT("admin.reviews.waiting", { hours })}
        {item.moderation_status === "pending" &&
        hours > REVIEW_PENDING_ALERT_HOURS ? (
          <>
            {" "}
            <AdminChip tone="warn">{adminT("admin.reviews.overdue")}</AdminChip>
          </>
        ) : null}
      </>
    );
  };
  const columns = [
    {
      key: "received",
      label: adminT("admin.reviews.column.received", { zone }),
    },
    { key: "rating", label: adminT("admin.reviews.column.rating") },
    { key: "comment", label: adminT("admin.reviews.column.comment") },
    { key: "order", label: adminT("admin.reviews.column.order") },
  ];
  return (
    <AdminFrame session={session} current="reviews">
      <div className="grid gap-[16px] md:grid-cols-[2fr_1fr] md:gap-[20px]">
        <div className="grid content-start gap-[16px]">
          <header>
            <AdminPageTitle>{adminT("admin.reviews.title")}</AdminPageTitle>
            <p className="text-ink-3 mt-[6px] text-[14px]">
              {adminT("admin.reviews.intro")}
            </p>
          </header>
          <nav aria-label={adminT("admin.reviews.title")}>
            <ul className="m-0 flex list-none flex-wrap gap-[8px] p-0">
              {QUEUE_STATUSES.map((status) => (
                <li key={status}>
                  <AdminTableLink href={href(status)}>
                    <span
                      aria-current={
                        filter.status === status ? "page" : undefined
                      }
                      className={filter.status === status ? "font-bold" : ""}
                    >
                      {adminT(`admin.reviews.tab.${status}`, {
                        count: counts[status],
                      })}
                    </span>
                  </AdminTableLink>
                </li>
              ))}
            </ul>
          </nav>
          <AdminFilterBar action="/admin/reviews">
            <input name="status" type="hidden" value={filter.status} />
            <AdminFilterSelect
              anyLabel={adminT("admin.reviews.filter.any")}
              id="rating"
              label={adminT("admin.reviews.filter.rating")}
              name="rating"
              options={[5, 4, 3, 2, 1].map((n) => ({
                value: String(n),
                label: String(n),
              }))}
              value={
                filter.rating === undefined ? undefined : String(filter.rating)
              }
            />
            <AdminFilterSelect
              anyLabel={adminT("admin.reviews.filter.any")}
              id="country"
              label={adminT("admin.reviews.filter.country")}
              name="country"
              options={[
                ...new Set(
                  items.flatMap((item) =>
                    item.iso2 === null ? [] : [item.iso2],
                  ),
                ),
              ]
                .sort()
                .map((iso2) => ({ value: iso2, label: iso2 }))}
              value={filter.country}
            />
            <AdminFilterSubmit>
              {adminT("admin.reviews.filter.apply")}
            </AdminFilterSubmit>
          </AdminFilterBar>
          {items.length === 0 ? (
            <AdminEmpty title={adminT("admin.reviews.empty.title")}>
              <p>{adminT("admin.reviews.empty.body")}</p>
            </AdminEmpty>
          ) : (
            <>
              <div className="hidden md:block">
                <AdminTable columns={columns}>
                  {items.map((item) => (
                    <AdminRow key={item.id}>
                      <AdminCell nowrap>
                        <AdminRefLink href={`/admin/reviews/${item.id}`}>
                          {at(item.created_at, session.timeZone)}
                        </AdminRefLink>
                        <AdminSecondLine>{waiting(item)}</AdminSecondLine>
                      </AdminCell>
                      <AdminCell>{item.rating}</AdminCell>
                      <AdminCell>{comment(item)}</AdminCell>
                      <AdminCell nowrap>
                        {item.order_id === null
                          ? ""
                          : orderReference(item.order_id)}
                      </AdminCell>
                    </AdminRow>
                  ))}
                </AdminTable>
              </div>
              <div className="md:hidden">
                <AdminCardRows>
                  {items.map((item) => (
                    <AdminCardRow
                      href={`/admin/reviews/${item.id}`}
                      key={item.id}
                      line1={
                        <>
                          {item.rating} ·{" "}
                          {at(item.created_at, session.timeZone)}
                        </>
                      }
                      line2={comment(item)}
                      line3={waiting(item)}
                    />
                  ))}
                </AdminCardRows>
              </div>
            </>
          )}
          <p className="text-ink-3 m-0 text-[13px]">
            {adminT("admin.reviews.queueNote")}
          </p>
        </div>
        <aside className="order-first md:order-none">
          <AdminCard title={adminT("admin.reviews.metric.title")}>
            {metric.average === null ? (
              <p className="m-0">{adminT("admin.reviews.metric.none")}</p>
            ) : (
              <div data-fo-exit-metric={average(metric.average)}>
                <p className="display m-0 text-[40px] leading-none">
                  {average(metric.average)}
                </p>
                <p className="text-ink-3 mt-[8px] mb-0 text-[14px]">
                  {adminT("admin.reviews.metric.body", { count: metric.count })}
                </p>
              </div>
            )}
          </AdminCard>
        </aside>
      </div>
    </AdminFrame>
  );
}
