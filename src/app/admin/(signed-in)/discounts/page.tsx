/**
 * @purpose GET /admin/discounts: the codes, their computed status chips, live uses and discount given
 * @spec 047
 *
 * `discounts.read` (admin, finance); New code for `discounts.write` only (absent, not disabled).
 * Columns of artboards `admin-discounts-*`: code, campaign, offer, valid (Europe/London), uses
 * against the cap, discount given per currency, status. Status is computed from data
 * (`listDiscountCodes`, AC-5); `?status=` filters by it. SSR, `no-store`, `noindex` (spec 012).
 */
import Link from "next/link";
import type { ReactElement } from "react";

import { DISCOUNT_DEFAULT_TIME_ZONE } from "@/config/discounts";
import {
  adminRequestId,
  adminT,
  can,
  DISCOUNT_COMPUTED_STATUSES,
  DiscountListFilterSchema,
  listDiscountCodes,
  requireAdminPage,
} from "@/modules/admin";
import { formatNumber } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminRefusal,
  adminButtonClass,
} from "@/modules/ui/admin/AdminControls";
import {
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
} from "@/modules/ui/admin/AdminData";
import { AdminQuiet } from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../frame";
import {
  DiscountResultSchema,
  DiscountStatusChip,
  dayText,
  givenText,
  offerText,
} from "./view";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("discounts.read");
  const query = await searchParams;
  const filter = DiscountListFilterSchema.parse(query);
  const result = DiscountResultSchema.parse(query);
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const all = await listDiscountCodes(actor);
  const rows =
    filter.status === undefined
      ? all
      : all.filter((row) => row.status === filter.status);
  const writer = can(session.roles, "discounts.write");
  const zone = DISCOUNT_DEFAULT_TIME_ZONE;
  const newButton = writer ? (
    <Link href="/admin/discounts/new" className={adminButtonClass("primary")}>
      {adminT("admin.discounts.list.new")}
    </Link>
  ) : null;

  return (
    <AdminFrame session={session} current="discounts">
      <div className="grid gap-[16px] md:gap-[20px]">
        <header className="flex flex-wrap items-end justify-between gap-[12px]">
          <div>
            <AdminPageTitle>
              {adminT("admin.discounts.list.title")}
            </AdminPageTitle>
            {all.length === 0 ? null : (
              <p className="text-ink-3 mt-[6px] text-[14px]">
                {adminT("admin.discounts.list.lead", {
                  count: all.length,
                  active: formatNumber(
                    all.filter((row) => row.status === "active").length,
                    "en",
                  ),
                })}
              </p>
            )}
          </div>
          {newButton}
        </header>
        {result.result === "not_found" ? (
          <AdminRefusal>
            {adminT("admin.discounts.result.not_found")}
          </AdminRefusal>
        ) : null}
        {all.length === 0 ? (
          <AdminEmpty title={adminT("admin.discounts.empty.title")}>
            <p>{adminT("admin.discounts.empty.body")}</p>
            {newButton}
          </AdminEmpty>
        ) : (
          <>
            <AdminFilterBar>
              <AdminFilterSelect
                id="discounts-status"
                name="status"
                label={adminT("admin.discounts.list.statusFilter")}
                anyLabel={adminT("admin.discounts.list.anyStatus")}
                options={DISCOUNT_COMPUTED_STATUSES.map((status) => ({
                  value: status,
                  label: adminT(`admin.discounts.status.${status}`),
                }))}
                value={filter.status}
              />
              <AdminFilterSubmit>
                {adminT("admin.discounts.list.apply")}
              </AdminFilterSubmit>
            </AdminFilterBar>
            {rows.length === 0 ? (
              <AdminQuiet>{adminT("admin.discounts.list.noMatch")}</AdminQuiet>
            ) : (
              <div className="overflow-x-auto">
                <AdminTable
                  columns={[
                    {
                      key: "code",
                      label: adminT("admin.discounts.column.code"),
                    },
                    {
                      key: "campaign",
                      label: adminT("admin.discounts.column.campaign"),
                    },
                    {
                      key: "offer",
                      label: adminT("admin.discounts.column.offer"),
                    },
                    {
                      key: "valid",
                      label: adminT("admin.discounts.column.valid", { zone }),
                    },
                    {
                      key: "uses",
                      label: adminT("admin.discounts.column.uses"),
                      align: "end",
                    },
                    {
                      key: "given",
                      label: adminT("admin.discounts.column.given"),
                      align: "end",
                    },
                    {
                      key: "status",
                      label: adminT("admin.discounts.column.status"),
                    },
                  ]}
                >
                  {rows.map((row) => (
                    <AdminRow key={row.id} muted={row.status === "disabled"}>
                      <AdminCell nowrap>
                        <AdminTableLink href={`/admin/discounts/${row.id}`}>
                          <AdminCode>{row.code}</AdminCode>
                        </AdminTableLink>
                      </AdminCell>
                      <AdminCell>{row.campaignLabel}</AdminCell>
                      <AdminCell nowrap>
                        {offerText(row.kind, row.percentBp, row.amounts)}
                      </AdminCell>
                      <AdminCell nowrap>
                        {row.endsAt === null
                          ? adminT("admin.discounts.valid.from", {
                              from: dayText(row.startsAt, zone),
                            })
                          : adminT("admin.discounts.valid.range", {
                              from: dayText(row.startsAt, zone),
                              to: dayText(row.endsAt, zone),
                            })}
                      </AdminCell>
                      <AdminCell align="end">
                        {row.maxRedemptions === null
                          ? formatNumber(row.stats.liveUses, "en")
                          : adminT("admin.discounts.uses.capped", {
                              uses: formatNumber(row.stats.liveUses, "en"),
                              cap: formatNumber(row.maxRedemptions, "en"),
                            })}
                      </AdminCell>
                      <AdminCell align="end">
                        {givenText(row.stats.discountByCurrency)}
                      </AdminCell>
                      <AdminCell nowrap>
                        <DiscountStatusChip status={row.status} />
                      </AdminCell>
                    </AdminRow>
                  ))}
                </AdminTable>
              </div>
            )}
            <AdminSecondLine>
              {adminT("admin.discounts.list.footnote")}
            </AdminSecondLine>
          </>
        )}
      </div>
    </AdminFrame>
  );
}
