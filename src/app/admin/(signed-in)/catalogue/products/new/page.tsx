/**
 * @purpose GET /admin/catalogue/products/new: a new product's details, saved as a draft
 * @spec 012b
 *
 * Spec 012b §2.5, §5.3 (TASK-297), after `admin-product-edit-desktop.dc.html`'s new-product
 * state. `catalogue.edit`; the florist who makes it and their price also need
 * `catalogue.supplier` and `partner.payout`, and are absent with the reason otherwise.
 */
import type { ReactElement } from "react";

import {
  adminRequestId,
  adminT,
  can,
  catalogueBackupWarning,
  catalogueSuppliers,
  requireAdminPage,
} from "@/modules/admin";
import { AdminBackLink, AdminRecordHead } from "@/modules/ui/admin/AdminRecord";
import { AdminFrame } from "../../../frame";
import { saveProductAction } from "../actions";
import { DetailsForm, OutcomeBanner, OutcomeSchema } from "../view";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("catalogue.edit");
  const outcome = OutcomeSchema.parse(await searchParams);
  const maySupply =
    can(session.roles, "catalogue.supplier") &&
    can(session.roles, "partner.payout");
  const florists = maySupply
    ? await catalogueSuppliers({
        userId: session.userId,
        requestId: await adminRequestId(),
        roles: session.roles,
      })
    : [];
  return (
    <AdminFrame
      session={session}
      current="catalogue"
      backupWarning={await catalogueBackupWarning()}
    >
      <div className="grid gap-[20px]">
        <AdminBackLink href="/admin/catalogue/products">
          {adminT("admin.catalogue.back")}
        </AdminBackLink>
        <AdminRecordHead title={adminT("admin.catalogue.newProduct")} />
        <OutcomeBanner outcome={outcome} />
        <DetailsForm
          values={{
            sku: "",
            productType: "bouquet",
            primaryFlower: "roses",
            colourPrimary: "red",
            style: "classic",
            priceTier: "classic",
            substitutionClass: "main_flower",
            vaseIncluded: false,
            stemCount: null,
            freshnessDays: 7,
            partnerOnly: true,
            supplierId: "",
          }}
          florists={florists}
          maySupply={maySupply}
          mayEdit
          action={saveProductAction}
        />
      </div>
    </AdminFrame>
  );
}
