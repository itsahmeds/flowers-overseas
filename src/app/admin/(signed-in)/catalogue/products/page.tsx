/**
 * @purpose GET /admin/catalogue/products: every product, its status, countries, text languages and florist
 * @spec 012b
 *
 * Spec 012b §5.3 "`/admin/catalogue/products`" (TASK-297), after
 * `docs/design/wireframes/admin-products-desktop.dc.html` and `-mobile`. Admin layout, English,
 * SSR `no-store`. Every signed-in role reads the list; New product is absent, with the reason,
 * without `catalogue.edit` (spec 004 §14 A20). Names and SKUs, never a person, in the rows.
 */
import type { ReactElement } from "react";

import { productTypes } from "@/config/catalogue/schemas";
import {
  CatalogueListFilterSchema,
  adminRequestId,
  adminT,
  can,
  catalogueList,
  requireAdminPage,
} from "@/modules/admin";
import { formatNumber } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  AdminCode,
  AdminEmpty,
  AdminFilterBar,
  AdminFilterClear,
  AdminFilterSelect,
  AdminFilterSubmit,
  AdminRow,
  AdminSecondLine,
  AdminTable,
  AdminTableLink,
} from "@/modules/ui/admin/AdminData";
import { AdminFrame } from "../../frame";

export const dynamic = "force-dynamic";

const BASE = "/admin/catalogue/products";

export default async function CatalogueProductsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const filter = CatalogueListFilterSchema.parse(await searchParams);
  const actor = {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
  const [all, rows] = await Promise.all([
    catalogueList(actor, {}),
    catalogueList(actor, filter),
  ]);
  const mayEdit = can(session.roles, "catalogue.edit");
  const newButton = mayEdit ? (
    <a href={`${BASE}/new`} className={adminButtonClass("primary")}>
      {adminT("admin.catalogue.newProduct")}
    </a>
  ) : (
    <p className="text-ink-3 text-[13px]">
      {adminT("admin.catalogue.readOnly")}
    </p>
  );
  const n = (value: number): string => formatNumber(value, "en");

  return (
    <AdminFrame session={session} current="catalogue">
      <div className="grid gap-[20px]">
        <header className="flex flex-wrap items-end justify-between gap-[12px]">
          <div>
            <AdminPageTitle>{adminT("admin.catalogue.title")}</AdminPageTitle>
            {all.length === 0 ? null : (
              <p className="text-ink-3 mt-[6px] text-[14px]">
                {adminT("admin.catalogue.summary", {
                  total: all.length,
                  florist: n(
                    all.filter((row) => row.florists.length > 0).length,
                  ),
                  seed: n(all.filter((row) => row.source === "seed").length),
                })}
              </p>
            )}
          </div>
          {newButton}
        </header>
        {all.length === 0 ? (
          <AdminEmpty title={adminT("admin.catalogue.empty.title")}>
            <p>{adminT("admin.catalogue.empty.body")}</p>
          </AdminEmpty>
        ) : (
          <>
            <AdminFilterBar label={adminT("admin.catalogue.filters.label")}>
              <AdminFilterSelect
                id="catalogue-type"
                name="type"
                label={adminT("admin.catalogue.filters.type")}
                anyLabel={adminT("admin.catalogue.filters.anyType")}
                options={productTypes.map((type) => ({
                  value: type,
                  label: adminT(`admin.catalogue.type.${type}`),
                }))}
                value={filter.type}
              />
              <AdminFilterSelect
                id="catalogue-status"
                name="status"
                label={adminT("admin.catalogue.filters.status")}
                anyLabel={adminT("admin.catalogue.filters.anyStatus")}
                options={(["draft", "active", "retired"] as const).map(
                  (status) => ({
                    value: status,
                    label: adminT(`admin.catalogue.status.${status}`),
                  }),
                )}
                value={filter.status}
              />
              <AdminFilterSelect
                id="catalogue-source"
                name="source"
                label={adminT("admin.catalogue.filters.source")}
                anyLabel={adminT("admin.catalogue.filters.anySource")}
                options={(["seed", "real"] as const).map((source) => ({
                  value: source,
                  label: adminT(`admin.catalogue.source.${source}`),
                }))}
                value={filter.source}
              />
              <AdminFilterSubmit>
                {adminT("admin.catalogue.filters.apply")}
              </AdminFilterSubmit>
              <AdminFilterClear href={BASE}>
                {adminT("admin.catalogue.filters.clear")}
              </AdminFilterClear>
            </AdminFilterBar>
            {rows.length === 0 ? (
              <AdminEmpty title={adminT("admin.catalogue.filteredEmpty.title")}>
                <a href={BASE} className={adminButtonClass("ghost")}>
                  {adminT("admin.catalogue.filteredEmpty.clear")}
                </a>
              </AdminEmpty>
            ) : (
              <div className="overflow-x-auto">
                <AdminTable
                  columns={[
                    {
                      key: "product",
                      label: adminT("admin.catalogue.columns.product"),
                    },
                    {
                      key: "type",
                      label: adminT("admin.catalogue.columns.type"),
                    },
                    {
                      key: "priced",
                      label: adminT("admin.catalogue.columns.pricedIn"),
                    },
                    {
                      key: "status",
                      label: adminT("admin.catalogue.columns.status"),
                    },
                    {
                      key: "text",
                      label: adminT("admin.catalogue.columns.text"),
                    },
                    {
                      key: "notes",
                      label: adminT("admin.catalogue.columns.notes"),
                    },
                  ]}
                >
                  {rows.map((row) => (
                    <AdminRow key={row.id} muted={row.status === "retired"}>
                      <AdminCell>
                        <AdminTableLink href={`${BASE}/${row.sku}`}>
                          {row.name ?? row.sku}
                        </AdminTableLink>
                        <AdminSecondLine>
                          <AdminCode>{row.sku}</AdminCode>
                          {row.florists.length === 0
                            ? null
                            : ` · ${row.florists.join(", ")}`}
                        </AdminSecondLine>
                      </AdminCell>
                      <AdminCell nowrap>
                        {adminT(`admin.catalogue.type.${row.productType}`)}
                      </AdminCell>
                      <AdminCell nowrap>
                        {adminT("admin.catalogue.pricedIn", {
                          count: row.pricedIn,
                        })}
                      </AdminCell>
                      <AdminCell nowrap>
                        <AdminChip
                          tone={row.status === "active" ? "ok" : "plain"}
                        >
                          {adminT(`admin.catalogue.status.${row.status}`)}
                        </AdminChip>
                      </AdminCell>
                      <AdminCell nowrap>{row.copyLocales.join(" ")}</AdminCell>
                      <AdminCell nowrap>
                        {row.source === "seed" ? (
                          <AdminChip tone="demo">
                            {adminT("admin.catalogue.placeholderChip")}
                          </AdminChip>
                        ) : null}
                      </AdminCell>
                    </AdminRow>
                  ))}
                </AdminTable>
              </div>
            )}
          </>
        )}
      </div>
    </AdminFrame>
  );
}
