/**
 * @purpose GET /admin/countries: every destination, its status and how far it is from going live
 * @spec 012b
 *
 * Spec 012b §2.8, §5.3 "`/admin/countries`" (AC-25, AC-39 counts; TASK-300), after
 * `docs/design/wireframes/admin-countries-desktop.dc.html` and `-mobile`. Admin layout, English,
 * SSR `no-store`; any admin role reads it. The go-live check of each row is `goLivePreflight`'s,
 * read-only, whatever the status. Nothing on this page writes.
 */
import type { ReactElement } from "react";

import {
  type CountryListRow,
  adminRequestId,
  adminT,
  listCountries,
  requireAdminPage,
} from "@/modules/admin";
import { formatDate, formatNumber, formatRegionName } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import {
  AdminCell,
  AdminChip,
  AdminEmpty,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";

import { AdminFrame } from "../frame";
import { CountryStatusChip, countryPagePublished } from "./status";

export const dynamic = "force-dynamic";

function CheckCell({ row }: { readonly row: CountryListRow }): ReactElement {
  const count = row.preflight.reasons.length;
  if (row.status === "live") {
    return count === 0 ? (
      <AdminChip tone="ok">{adminT("admin.countries.allHold")}</AdminChip>
    ) : (
      <AdminChip tone="bad">
        {adminT("admin.countries.noLongerHold", { count })}
      </AdminChip>
    );
  }
  return count === 0 ? (
    <AdminChip tone="ok">{adminT("admin.countries.ready")}</AdminChip>
  ) : (
    <AdminChip tone="warn">
      {adminT("admin.countries.toFix", { count })}
    </AdminChip>
  );
}

export default async function CountriesPage(): Promise<ReactElement> {
  const session = await requireAdminPage();
  const rows = await listCountries({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  const n = (value: number): string => formatNumber(value, "en");
  const published = (value: boolean): string =>
    value
      ? adminT("admin.countries.published")
      : adminT("admin.countries.notPublished");

  return (
    <AdminFrame session={session} current="countries">
      <div className="grid gap-[24px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.countries.title")}</AdminPageTitle>
          <p className="text-ink-2 max-w-[72ch] text-[15px]">
            {adminT("admin.countries.intro")}
          </p>
        </header>

        {rows.length === 0 ? (
          <AdminEmpty title={adminT("admin.countries.empty")} />
        ) : (
          <AdminTable
            columns={[
              { key: "country", label: adminT("admin.countries.col.country") },
              { key: "status", label: adminT("admin.countries.col.status") },
              {
                key: "firstLive",
                label: adminT("admin.countries.col.firstLive"),
              },
              { key: "guide", label: adminT("admin.countries.col.guide") },
              {
                key: "countryPage",
                label: adminT("admin.countries.col.countryPage"),
              },
              {
                key: "realFlorists",
                label: adminT("admin.countries.col.realFlorists"),
                align: "end",
              },
              {
                key: "priced",
                label: adminT("admin.countries.col.priced"),
                align: "end",
              },
              {
                key: "saleable",
                label: adminT("admin.countries.col.saleable"),
                align: "end",
              },
              { key: "check", label: adminT("admin.countries.col.check") },
            ]}
            foot={<AdminNote>{adminT("admin.countries.legend")}</AdminNote>}
          >
            {rows.map((row) => (
              <AdminRow key={row.iso2}>
                <AdminCell>
                  <AdminTableLink href={`/admin/countries/${row.iso2}`}>
                    {formatRegionName(row.iso2, "en")}
                  </AdminTableLink>
                  <AdminSecondLine>{row.iso2}</AdminSecondLine>
                </AdminCell>
                <AdminCell>
                  <CountryStatusChip status={row.status} />
                </AdminCell>
                <AdminCell nowrap>
                  {row.firstLiveAt === null
                    ? adminT("admin.countries.notYet")
                    : formatDate(
                        row.firstLiveAt,
                        "en",
                        "dayMonthYear",
                        session.timeZone,
                      )}
                </AdminCell>
                <AdminCell>{published(row.guidePublished)}</AdminCell>
                <AdminCell>
                  {published(countryPagePublished(row.iso2))}
                </AdminCell>
                <AdminCell align="end">{n(row.realFlorists)}</AdminCell>
                <AdminCell align="end">{n(row.pricedProducts)}</AdminCell>
                <AdminCell align="end">{n(row.saleableProducts)}</AdminCell>
                <AdminCell>
                  <CheckCell row={row} />
                </AdminCell>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </div>
    </AdminFrame>
  );
}
