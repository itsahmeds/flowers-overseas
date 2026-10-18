/**
 * @purpose GET /admin: three counters, each a link where its page exists (spec 012 §5.3)
 */
import type { ReactElement } from "react";

import {
  ADMIN_NAV,
  adminHomeCounts,
  adminRequestId,
  adminT,
  requireAdminPage,
} from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import { AdminCounter, AdminPageTitle } from "@/modules/ui";

import { AdminFrame } from "./frame";

const partnerStatusOrder = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;

/** The link of a counter, only where its page exists (no dead links). */
function hrefOf(
  key: "orders" | "applications" | "partners",
): string | undefined {
  const item = ADMIN_NAV.find((entry) => entry.key === key);
  return item?.built === true ? item.href : undefined;
}

export default async function AdminHomePage(): Promise<ReactElement> {
  const session = await requireAdminPage();
  const counts = await adminHomeCounts(
    { userId: session.userId, requestId: await adminRequestId() },
    session.timeZone,
  );
  const n = (value: number): string => formatNumber(value, "en");
  const ordersHref = hrefOf("orders");
  const applicationsHref = hrefOf("applications");
  const partnersHref = hrefOf("partners");
  return (
    <AdminFrame session={session} current="home">
      <div className="grid gap-[24px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.home.title")}</AdminPageTitle>
          <p className="text-ink-3 text-sm">
            {adminT("admin.home.date", {
              date: formatDate(
                new Date(),
                "en",
                "calendarDate",
                session.timeZone,
              ),
              timeZone: session.timeZone,
            })}
          </p>
        </header>
        <div className="grid gap-[16px] md:grid-cols-3">
          <AdminCounter
            label={adminT("admin.home.ordersToday")}
            value={n(counts.ordersToday)}
            line={
              counts.ordersToday === 0
                ? adminT("admin.home.nothingToday")
                : undefined
            }
            {...(ordersHref === undefined
              ? {}
              : {
                  href: ordersHref,
                  linkLabel: adminT("admin.home.ordersOpen"),
                })}
          />
          <AdminCounter
            label={adminT("admin.home.applicationsNew")}
            value={n(counts.newApplications)}
            line={
              counts.newApplications === 0
                ? adminT("admin.home.noApplications")
                : adminT("admin.home.applicationsWaiting")
            }
            {...(applicationsHref === undefined
              ? {}
              : {
                  href: applicationsHref,
                  linkLabel: adminT("admin.home.applicationsOpen"),
                })}
          />
          <AdminCounter
            label={adminT("admin.home.partnersByStatus")}
            {...(partnersHref === undefined
              ? {}
              : {
                  href: partnersHref,
                  linkLabel: adminT("admin.home.partnersOpen"),
                })}
          >
            <dl className="text-ui grid grid-cols-[minmax(0,1fr)_auto] gap-x-[16px] gap-y-[6px]">
              {partnerStatusOrder.map((status) => (
                <div key={status} className="contents">
                  <dt className="text-ink-2">
                    {adminT(`admin.home.partnerStatus.${status}`)}
                  </dt>
                  <dd className="text-ink text-end font-bold tabular-nums">
                    {n(counts.partnersByStatus[status] ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>
          </AdminCounter>
        </div>
      </div>
    </AdminFrame>
  );
}
