/**
 * @purpose GET /admin/partners/new: add a florist in onboarding
 * @spec 012
 *
 * `partner.edit` (admin, ops). The profile form with the florist's code; the florist starts in
 * `onboarding` (never `demo`, which is seed-only, and never `active`, which only the status card
 * reaches after the preflight). Terms, zones and products follow on the florist's page.
 */
import type { ReactElement } from "react";

import { adminRequestId, adminT, requireAdminPage } from "@/modules/admin";
import { partnerFormOptions } from "@/modules/partners";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { AdminBackLink } from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import { createPartnerAction } from "../actions";
import { ProfileForm } from "../profile-form";
import { PartnerMessage, PartnerResultSchema } from "../view";

export default async function AdminNewPartnerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("partner.edit");
  const result = PartnerResultSchema.parse(await searchParams);
  const options = await partnerFormOptions({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  return (
    <AdminFrame session={session} current="partners">
      <div className="grid max-w-[880px] gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/partners">
          {adminT("admin.partners.back")}
        </AdminBackLink>
        <header>
          <AdminPageTitle>{adminT("admin.partners.new.title")}</AdminPageTitle>
          <p className="text-ink-3 mt-[6px] text-[14px]">
            {adminT("admin.partners.new.lead")}
          </p>
        </header>
        <PartnerMessage result={result} form="profile" />
        <ProfileForm
          action={createPartnerAction}
          withCode
          values={{
            legalName: "",
            cityLabel: "",
            countryIso2: "",
            notificationChannel: "email",
            contactEmail: "",
            contactPhone: "",
            payoutCurrency: "",
            capacityPerDay: "",
          }}
          hidden={{}}
          countries={options.countries}
          currencies={options.currencies}
          result={result}
          submitLabel={adminT("admin.partners.new.submit")}
        />
      </div>
    </AdminFrame>
  );
}
