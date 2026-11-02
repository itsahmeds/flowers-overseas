/**
 * @purpose GET /admin/partners: the florists, by status and country
 * @spec 012
 *
 * `partner.edit` or `partner.payout` (admin, ops, finance; finance opens it to reach payouts).
 * Every florist with its city, status, terms, zone count and fulfillable product count; status
 * tabs with their counts; a country filter. "Add a florist" is absent for a role without
 * `partner.edit` (spec 004 §14 A20). Names and contacts render here and on no public page
 * (AC-16). Artboards `admin-partners-desktop.dc.html` (table) and `admin-partners-mobile.dc.html`
 * (cards). The spec 030b columns (last accepted, rating, follow-ups, owed now) are that spec's.
 */
import Link from "next/link";
import { forbidden } from "next/navigation";
import type { ReactElement } from "react";

import { adminRequestId, adminT, can, requireAdminPage } from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import {
  type PartnerListItem,
  type PartnerStatus,
  PartnerListFilterSchema,
  listPartners,
} from "@/modules/partners";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import {
  AdminCardRow,
  AdminCardRows,
  AdminCell,
  AdminCode,
  AdminEmpty,
  AdminFilterBar,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
  AdminTabs,
} from "@/modules/ui/admin/AdminData";

import { AdminFrame } from "../frame";
import { PartnerMessage, PartnerResultSchema, PartnerStatusChip } from "./view";

const STATUSES: readonly PartnerStatus[] = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
];

function listHref(country: string | undefined, status?: PartnerStatus): string {
  const params = new URLSearchParams({
    ...(country === undefined ? {} : { country }),
    ...(status === undefined ? {} : { status }),
  });
  const query = params.toString();
  return query === "" ? "/admin/partners" : `/admin/partners?${query}`;
}

function terms(item: PartnerListItem): string {
  return item.termsSignedAt === null || item.termsVersion === null
    ? adminT("admin.partners.termsNone")
    : adminT("admin.partners.termsLine", {
        version: item.termsVersion,
        date: formatDate(
          new Date(`${item.termsSignedAt}T12:00:00Z`),
          "en",
          "dayMonth",
          "UTC",
        ),
      });
}

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  if (
    !can(session.roles, "partner.edit") &&
    !can(session.roles, "partner.payout")
  ) {
    forbidden();
  }
  const query = await searchParams;
  const filter = PartnerListFilterSchema.parse(query);
  const result = PartnerResultSchema.parse(query);
  const list = await listPartners(
    { userId: session.userId, requestId: await adminRequestId() },
    filter,
  );
  const all = STATUSES.reduce((sum, status) => sum + list.counts[status], 0);
  const tabs = [
    {
      key: "all",
      label: adminT("admin.partners.tabs.all"),
      count: formatNumber(all, "en"),
      href: listHref(filter.country),
      current: filter.status === undefined,
    },
    ...STATUSES.map((status) => ({
      key: status,
      label: adminT(`admin.partners.status.${status}`),
      count: formatNumber(list.counts[status], "en"),
      href: listHref(filter.country, status),
      current: filter.status === status,
    })),
  ];
  const columns = [
    { key: "florist", label: adminT("admin.partners.column.florist") },
    { key: "city", label: adminT("admin.partners.column.city") },
    { key: "status", label: adminT("admin.partners.column.status") },
    {
      key: "zones",
      label: adminT("admin.partners.column.zones"),
      align: "end" as const,
    },
    {
      key: "products",
      label: adminT("admin.partners.column.products"),
      align: "end" as const,
    },
  ];
  const href = (item: PartnerListItem): string =>
    `/admin/partners/${encodeURIComponent(item.code)}`;
  return (
    <AdminFrame session={session} current="partners">
      <div className="grid gap-[16px] md:gap-[20px]">
        <header className="flex flex-wrap items-end justify-between gap-x-[24px] gap-y-[12px]">
          <div>
            <AdminPageTitle>{adminT("admin.partners.title")}</AdminPageTitle>
            <p className="text-ink-3 mt-[6px] text-[14px]">
              {adminT("admin.partners.lead")}
            </p>
          </div>
          {can(session.roles, "partner.edit") ? (
            <Link
              href="/admin/partners/new"
              className={adminButtonClass("primary")}
            >
              {adminT("admin.partners.add")}
            </Link>
          ) : null}
        </header>
        <PartnerMessage result={result} form="page" />
        <AdminFilterBar
          label={adminT("admin.partners.filter.label")}
          action="/admin/partners"
        >
          {filter.status === undefined ? null : (
            <input type="hidden" name="status" value={filter.status} />
          )}
          <AdminFilterSelect
            id="partners-country"
            name="country"
            label={adminT("admin.partners.filter.country")}
            anyLabel={adminT("admin.partners.filter.countryAny")}
            options={list.countries.map((country) => ({
              value: country.iso2,
              label: country.name,
            }))}
            value={filter.country}
          />
          <AdminFilterSubmit>
            {adminT("admin.partners.filter.apply")}
          </AdminFilterSubmit>
        </AdminFilterBar>
        <AdminTabs label={adminT("admin.partners.tabs.label")} tabs={tabs} />
        {list.items.length === 0 ? (
          <AdminEmpty
            title={adminT("admin.partners.empty.title", {
              status: filter.status ?? "other",
            })}
          >
            <p className="max-w-[60ch]">
              {adminT("admin.partners.empty.body")}
            </p>
          </AdminEmpty>
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable columns={columns}>
                {list.items.map((item) => (
                  <AdminRow key={item.id} muted={item.status === "offboarded"}>
                    <AdminCell>
                      <AdminTableLink href={href(item)}>
                        {item.legalName}
                      </AdminTableLink>
                      <AdminSecondLine>
                        <AdminCode>{item.code}</AdminCode>
                      </AdminSecondLine>
                    </AdminCell>
                    <AdminCell>
                      {item.cityLabel}
                      <AdminSecondLine>{item.countryName}</AdminSecondLine>
                    </AdminCell>
                    <AdminCell>
                      <PartnerStatusChip status={item.status} />
                      <AdminSecondLine>{terms(item)}</AdminSecondLine>
                    </AdminCell>
                    <AdminCell align="end">
                      {formatNumber(item.zones, "en")}
                    </AdminCell>
                    <AdminCell align="end">
                      {formatNumber(item.products, "en")}
                    </AdminCell>
                  </AdminRow>
                ))}
              </AdminTable>
            </div>
            <div className="md:hidden">
              <AdminCardRows>
                {list.items.map((item) => (
                  <AdminCardRow
                    key={item.id}
                    href={href(item)}
                    line1={<span className="font-bold">{item.legalName}</span>}
                    subline={<AdminCode>{item.code}</AdminCode>}
                    line2={
                      <span className="inline-flex flex-wrap items-center gap-[6px]">
                        <PartnerStatusChip status={item.status} />
                        <span>
                          {adminT("admin.partners.where", {
                            city: item.cityLabel,
                            country: item.countryName,
                          })}
                        </span>
                      </span>
                    }
                    line3={adminT("admin.partners.counts", {
                      zones: item.zones,
                      products: item.products,
                    })}
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
