/**
 * @purpose GET /admin/discounts/new: create a code, with the cost preview and both warnings
 * @spec 047
 *
 * `discounts.write` (admin). The form island with Generate and the live cost preview; the
 * preview starts from the empty offer (every bouquet and destination, no discount yet). Saving
 * goes through `createDiscountCode` and `issueCode` (AC-30).
 */
import type { ReactElement } from "react";

import {
  adminRequestId,
  adminT,
  discountCostPreview,
  discountFormOptions,
  requireAdminPage,
} from "@/modules/admin";
import { formatRegionName } from "@/modules/i18n";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { AdminBackLink } from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import { createDiscountCodeAction } from "../actions";
import { DiscountForm } from "../discount-form";
import {
  discountFormCopy,
  emptyFormValues,
  previewView,
  valuesAsFields,
} from "../view";

export const dynamic = "force-dynamic";

export default async function AdminNewDiscountPage(): Promise<ReactElement> {
  const session = await requireAdminPage("discounts.write");
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const options = await discountFormOptions(actor);
  const values = emptyFormValues();
  const preview = await discountCostPreview(
    actor,
    valuesAsFields(values),
    options.currencies,
  );
  return (
    <AdminFrame session={session} current="discounts">
      <div className="grid gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/discounts">
          {adminT("admin.discounts.back")}
        </AdminBackLink>
        <header>
          <AdminPageTitle>{adminT("admin.discounts.new.title")}</AdminPageTitle>
          <p className="text-ink-3 mt-[6px] text-[14px]">
            {adminT("admin.discounts.new.lead")}
          </p>
        </header>
        <DiscountForm
          action={createDiscountCodeAction}
          copy={discountFormCopy(
            options.currencies,
            adminT("admin.discounts.form.create"),
            null,
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
          frozen={false}
          readOnly={false}
          cancelHref="/admin/discounts"
        />
      </div>
    </AdminFrame>
  );
}
