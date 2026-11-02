/**
 * @purpose GET /admin/applications: florist applications, by status
 * @spec 012
 *
 * `application.manage` (admin, ops). Read **only through spec 011's `listFloristApplications`**
 * (AC-17): shop, contact, town and country, orders a day, weekends, when it arrived (in the
 * viewer's zone, named) and the status, with tabs per status. The list shows contact names to
 * the two roles that manage applications; opening one is logged (`application.viewed`).
 * Artboards `admin-applications-desktop.dc.html` (table) and `admin-applications-mobile.dc.html`
 * (cards).
 */
import type { ReactElement } from "react";

import {
  adminRequestId,
  adminT,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatNumber, formatRegionName } from "@/modules/i18n";
import {
  type FloristApplicationRow,
  type FloristApplicationStatus,
  FloristApplicationStatusSchema,
  listApplications,
} from "@/modules/partners";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminEmpty,
  AdminRow,
  AdminTable,
  AdminTableLink,
  AdminTabs,
} from "@/modules/ui/admin/AdminData";

import { AdminFrame } from "../frame";
import { ApplicationStatusChip } from "./view";

/** The tab order of the artboard: all, new, contacted, converted, rejected. */
const TABS: readonly FloristApplicationStatus[] = [
  "new",
  "contacted",
  "converted",
  "rejected",
];

function where(row: FloristApplicationRow): string {
  return adminT("admin.applications.where", {
    city: row.city,
    country: formatRegionName(row.countryIso2, "en"),
  });
}

function weekends(row: FloristApplicationRow): string {
  return row.weekendDelivery === null
    ? adminT("admin.applications.notGiven")
    : adminT(`admin.applications.weekend.${row.weekendDelivery}`);
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("application.manage");
  const query = await searchParams;
  const status = FloristApplicationStatusSchema.optional()
    .catch(undefined)
    .parse(query["status"]);
  const rows = await listApplications({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  const shown =
    status === undefined ? rows : rows.filter((row) => row.status === status);
  const count = (value?: FloristApplicationStatus): string =>
    formatNumber(
      value === undefined
        ? rows.length
        : rows.filter((row) => row.status === value).length,
      "en",
    );
  const tabs = [
    {
      key: "all",
      label: adminT("admin.applications.tabs.all"),
      count: count(),
      href: "/admin/applications",
      current: status === undefined,
    },
    ...TABS.map((value) => ({
      key: value,
      label: adminT(`admin.applications.status.${value}`),
      count: count(value),
      href: `/admin/applications?status=${value}`,
      current: status === value,
    })),
  ];
  const zone = zoneCity(session.timeZone);
  const received = (row: FloristApplicationRow): string =>
    formatDate(row.createdAt, "en", "dayMonthTime", session.timeZone);
  const href = (row: FloristApplicationRow): string =>
    `/admin/applications/${row.id}`;
  const columns = [
    { key: "shop", label: adminT("admin.applications.column.shop") },
    { key: "contact", label: adminT("admin.applications.column.contact") },
    { key: "where", label: adminT("admin.applications.column.where") },
    {
      key: "perDay",
      label: adminT("admin.applications.column.perDay"),
      align: "end" as const,
    },
    { key: "weekends", label: adminT("admin.applications.column.weekends") },
    {
      key: "received",
      label: adminT("admin.applications.column.received", { zone }),
    },
    { key: "status", label: adminT("admin.applications.column.status") },
  ];
  return (
    <AdminFrame session={session} current="applications">
      <div className="grid gap-[16px] md:gap-[20px]">
        <header>
          <AdminPageTitle>{adminT("admin.applications.title")}</AdminPageTitle>
          <p className="text-ink-3 mt-[6px] text-[14px]">
            {adminT("admin.applications.lead")}
          </p>
        </header>
        <AdminTabs
          label={adminT("admin.applications.tabs.label")}
          tabs={tabs}
        />
        {shown.length === 0 ? (
          <AdminEmpty
            title={adminT("admin.applications.empty.title", {
              status: status ?? "other",
            })}
          >
            <p>{adminT("admin.applications.empty.body")}</p>
          </AdminEmpty>
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable columns={columns}>
                {shown.map((row) => (
                  <AdminRow key={row.id} highlight={row.status === "new"}>
                    <AdminCell>
                      <AdminTableLink href={href(row)}>
                        {row.businessName}
                      </AdminTableLink>
                    </AdminCell>
                    <AdminCell>{row.contactName}</AdminCell>
                    <AdminCell>{where(row)}</AdminCell>
                    <AdminCell align="end">
                      {row.capacityPerDay === null
                        ? adminT("admin.applications.notGiven")
                        : formatNumber(row.capacityPerDay, "en")}
                    </AdminCell>
                    <AdminCell>{weekends(row)}</AdminCell>
                    <AdminCell nowrap>{received(row)}</AdminCell>
                    <AdminCell>
                      <ApplicationStatusChip status={row.status} />
                    </AdminCell>
                  </AdminRow>
                ))}
              </AdminTable>
            </div>
            <div className="md:hidden">
              <AdminCardRows>
                {shown.map((row) => (
                  <AdminCardRow
                    key={row.id}
                    href={href(row)}
                    highlight={row.status === "new"}
                    line1={
                      <>
                        <span className="font-bold">{row.businessName}</span>
                        <ApplicationStatusChip status={row.status} />
                      </>
                    }
                    line2={where(row)}
                    line3={received(row)}
                  />
                ))}
              </AdminCardRows>
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}
