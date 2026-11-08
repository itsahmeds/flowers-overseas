/**
 * @purpose GET /admin/discounts/[id]: one code, edit, frozen offer, disable, its figures so far
 * @spec 047
 *
 * `discounts.read` (admin, finance); Save, Disable and Turn back on for `discounts.write` only
 * (absent for finance, which reads the form and its cost preview). After the first counted live
 * use the offer is fixed (AC-4): the form says so and the server refuses a change. The disable
 * dialog says the code stops at once, also for buyers who applied it and have not paid.
 */
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import {
  adminRequestId,
  adminT,
  can,
  discountCostPreview,
  discountFormOptions,
  getDiscountCode,
  requireAdminPage,
} from "@/modules/admin";
import { formatDate, formatNumber, formatRegionName } from "@/modules/i18n";
import { AdminActionDialog } from "@/modules/ui/admin/AdminActionDialog";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { AdminButton, AdminToast } from "@/modules/ui/admin/AdminControls";
import {
  AdminBackLink,
  AdminBanner,
  AdminKeyValues,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import {
  disableDiscountCodeAction,
  enableDiscountCodeAction,
  updateDiscountCodeAction,
} from "../actions";
import { DiscountForm } from "../discount-form";
import {
  DiscountResultSchema,
  DiscountStatusChip,
  detailFormValues,
  discountFormCopy,
  givenText,
  previewView,
  valuesAsFields,
} from "../view";

export const dynamic = "force-dynamic";

export default async function AdminDiscountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("discounts.read");
  const { id } = await params;
  const result = DiscountResultSchema.parse(await searchParams);
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const detail = await getDiscountCode(actor, id);
  if (detail === null) notFound();
  const options = await discountFormOptions(actor);
  const values = detailFormValues(detail);
  const preview = await discountCostPreview(
    actor,
    valuesAsFields(values),
    options.currencies,
  );
  const writer = can(session.roles, "discounts.write");
  const zone = session.timeZone;
  const code = detail.loaded.code.codeNormalised;
  const disabled = detail.loaded.code.status === "disabled";
  const toast =
    result.result === undefined || result.result === "not_found"
      ? null
      : adminT(`admin.discounts.result.${result.result}`);

  return (
    <AdminFrame session={session} current="discounts">
      <div className="grid gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/discounts">
          {adminT("admin.discounts.back")}
        </AdminBackLink>
        <header className="grid gap-[6px]">
          <div className="flex flex-wrap items-center gap-[10px]">
            <AdminPageTitle>
              <bdi dir="ltr">{code}</bdi>
            </AdminPageTitle>
            <DiscountStatusChip status={detail.status} />
          </div>
          <p className="text-ink-3 text-[14px]">
            {detail.loaded.campaignLabel}
          </p>
        </header>
        {toast === null ? null : <AdminToast>{toast}</AdminToast>}
        {disabled ? (
          <AdminBanner>
            <span>{adminT("admin.discounts.disabled.banner")}</span>
            {writer ? (
              <form action={enableDiscountCodeAction}>
                <input type="hidden" name="id" value={detail.loaded.code.id} />
                <AdminButton tone="ghost">
                  {adminT("admin.discounts.disabled.enable")}
                </AdminButton>
              </form>
            ) : null}
          </AdminBanner>
        ) : null}
        <DiscountForm
          action={updateDiscountCodeAction}
          copy={discountFormCopy(
            options.currencies,
            adminT("admin.discounts.form.save"),
            detail.frozen ? detail.stats.liveUses : null,
          )}
          values={values}
          currencies={options.currencies}
          countries={options.countries.map((country) => ({
            value: country.id,
            label: formatRegionName(country.iso2, "en"),
          }))}
          products={options.products.map((product) => ({
            value: product.id,
            label: product.name,
          }))}
          zones={options.zones}
          initialPreview={previewView(preview)}
          id={detail.loaded.code.id}
          frozen={detail.frozen}
          readOnly={!writer}
          cancelHref="/admin/discounts"
        >
          {writer && !disabled ? (
            <AdminActionDialog
              id="discount-disable"
              inline
              openLabel={adminT("admin.discounts.dialog.open")}
              openTone="danger"
              title={adminT("admin.discounts.dialog.title", { code })}
              closeLabel={adminT("admin.discounts.dialog.cancel")}
            >
              <p className="text-[14px]">
                {adminT("admin.discounts.dialog.body")}
              </p>
              <form
                action={disableDiscountCodeAction}
                className="mt-[12px] flex gap-[10px]"
              >
                <input type="hidden" name="id" value={detail.loaded.code.id} />
                <AdminButton tone="dangerFill">
                  {adminT("admin.discounts.dialog.confirm")}
                </AdminButton>
              </form>
            </AdminActionDialog>
          ) : null}
        </DiscountForm>
        <section className="bg-card grid gap-[10px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[20px] md:py-[18px]">
          <h2 className="text-[16px] font-bold">
            {adminT("admin.discounts.stats.title")}
          </h2>
          <AdminKeyValues
            items={[
              {
                key: "uses",
                label: adminT("admin.discounts.stats.liveUses"),
                numeric: true,
                value:
                  detail.loaded.code.maxRedemptions === null
                    ? formatNumber(detail.stats.liveUses, "en")
                    : adminT("admin.discounts.uses.capped", {
                        uses: formatNumber(detail.stats.liveUses, "en"),
                        cap: formatNumber(
                          detail.loaded.code.maxRedemptions,
                          "en",
                        ),
                      }),
              },
              {
                key: "given",
                label: adminT("admin.discounts.stats.given"),
                numeric: true,
                value:
                  detail.stats.discountByCurrency.length === 0
                    ? adminT("admin.discounts.stats.none")
                    : givenText(detail.stats.discountByCurrency),
              },
              {
                key: "created",
                label: adminT("admin.discounts.stats.created"),
                value: adminT("admin.discounts.stats.createdLine", {
                  date: formatDate(
                    detail.createdAt,
                    "en",
                    "dayMonthYear",
                    zone,
                  ),
                  name: detail.createdBy ?? "",
                }),
              },
              {
                key: "changed",
                label: adminT("admin.discounts.stats.lastChange"),
                value: adminT("admin.discounts.stats.createdLine", {
                  date: formatDate(
                    detail.updatedAt,
                    "en",
                    "dayMonthYearTime",
                    zone,
                  ),
                  name: detail.lastChangeBy ?? detail.createdBy ?? "",
                }),
              },
            ]}
          />
        </section>
      </div>
    </AdminFrame>
  );
}
