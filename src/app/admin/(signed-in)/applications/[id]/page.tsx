/**
 * @purpose GET /admin/applications/[id]: one application, its view logged, its next step
 * @spec 012
 *
 * `application.manage` (admin, ops). Read through spec 011's `listFloristApplications` (AC-17);
 * opening it writes one `application.viewed` audit row (`logAdminRead`, AC-13) after the row is
 * found and before anything renders. The next-step card offers only the edges of
 * `new → contacted → converted | rejected`: a new application "Mark as contacted"; a contacted one
 * "Convert to a florist" and "Reject", whose reason is required and kept in `status_reason`; a
 * converted one links to its florist; a rejected one shows its reason. Every form carries the
 * row's `updated_at`. Artboards `admin-applications-{desktop,mobile}.dc.html`.
 */
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";

import { isLocaleCode, localeConfig } from "@/config/locales";
import {
  adminRequestId,
  adminT,
  logAdminRead,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatNumber, formatRegionName } from "@/modules/i18n";
import {
  type FloristApplicationRow,
  applicationById,
  partnerCodeById,
} from "@/modules/partners";
import {
  AdminButton,
  adminButtonClass,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminField,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminCard,
  type AdminKeyValue,
  AdminKeyValues,
  AdminLabel,
  AdminQuiet,
  AdminRecordColumns,
  AdminRecordHead,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../frame";
import {
  convertApplicationAction,
  markContactedAction,
  rejectApplicationAction,
} from "../actions";
import {
  ApplicationMessage,
  ApplicationResultSchema,
  ApplicationStatusChip,
} from "../view";

function Version({
  row,
}: {
  readonly row: FloristApplicationRow;
}): ReactElement {
  return (
    <>
      <input type="hidden" name="applicationId" value={row.id} />
      <input
        type="hidden"
        name="updatedAt"
        value={row.updatedAt.toISOString()}
      />
    </>
  );
}

function language(code: string): string {
  return isLocaleCode(code) ? localeConfig(code).nativeName : code;
}

function details(row: FloristApplicationRow): AdminKeyValue[] {
  const notGiven = adminT("admin.applications.notGiven");
  const optional = (value: string | null): ReactNode => value ?? notGiven;
  return [
    {
      key: "shop",
      label: adminT("admin.applications.field.shop"),
      value: row.businessName,
    },
    {
      key: "contact",
      label: adminT("admin.applications.field.contact"),
      value: row.contactName,
    },
    {
      key: "email",
      label: adminT("admin.applications.field.email"),
      value: row.contactEmail,
    },
    {
      key: "phone",
      label: adminT("admin.applications.field.phone"),
      value: row.contactPhone,
    },
    {
      key: "country",
      label: adminT("admin.applications.field.country"),
      value: formatRegionName(row.countryIso2, "en"),
    },
    {
      key: "town",
      label: adminT("admin.applications.field.town"),
      value: row.city,
    },
    {
      key: "area",
      label: adminT("admin.applications.field.area"),
      value: optional(row.coverageNote),
    },
    {
      key: "perDay",
      label: adminT("admin.applications.field.perDay"),
      value:
        row.capacityPerDay === null
          ? notGiven
          : formatNumber(row.capacityPerDay, "en"),
      numeric: true,
    },
    {
      key: "weekends",
      label: adminT("admin.applications.field.weekends"),
      value:
        row.weekendDelivery === null
          ? notGiven
          : adminT(`admin.applications.weekend.${row.weekendDelivery}`),
    },
    {
      key: "registration",
      label: adminT("admin.applications.field.registration"),
      value: optional(row.registrationNumber),
    },
    {
      key: "web",
      label: adminT("admin.applications.field.web"),
      value: optional(row.instagramUrl ?? row.websiteUrl),
    },
    {
      key: "contactBy",
      label: adminT("admin.applications.field.contactBy"),
      value:
        row.preferredChannel === null
          ? notGiven
          : adminT(`admin.applications.contactBy.${row.preferredChannel}`),
    },
    {
      key: "language",
      label: adminT("admin.applications.field.language"),
      value: language(row.languageCode),
    },
  ];
}

function NextStep({
  row,
  floristCode,
}: {
  readonly row: FloristApplicationRow;
  readonly floristCode: string | undefined;
}): ReactElement {
  if (row.status === "converted") {
    return (
      <AdminCard>
        <AdminLabel>{adminT("admin.applications.state.title")}</AdminLabel>
        <p className="text-[14px]">
          {adminT("admin.applications.state.converted", {
            shop: row.businessName,
          })}
        </p>
        {floristCode === undefined ? null : (
          <a
            href={`/admin/partners/${encodeURIComponent(floristCode)}`}
            className={`${adminButtonClass("ghost")} justify-self-start`}
          >
            {adminT("admin.applications.state.openFlorist")}
          </a>
        )}
      </AdminCard>
    );
  }
  if (row.status === "rejected") {
    return (
      <AdminCard>
        <AdminLabel>{adminT("admin.applications.state.title")}</AdminLabel>
        <p className="text-[14px]">
          {adminT("admin.applications.state.rejected")}
        </p>
        {row.statusReason === null ? null : (
          <AdminQuiet>
            {adminT("admin.applications.state.reason", {
              reason: row.statusReason,
            })}
          </AdminQuiet>
        )}
      </AdminCard>
    );
  }
  if (row.status === "new") {
    return (
      <AdminCard>
        <AdminLabel>{adminT("admin.applications.next.title")}</AdminLabel>
        <AdminQuiet>{adminT("admin.applications.next.contactHint")}</AdminQuiet>
        <form action={markContactedAction}>
          <Version row={row} />
          <AdminButton>
            {adminT("admin.applications.next.markContacted")}
          </AdminButton>
        </form>
      </AdminCard>
    );
  }
  const reasonId = "application-reason";
  const hint = adminT("admin.applications.next.rejectNote");
  return (
    <AdminCard>
      <AdminLabel>{adminT("admin.applications.next.title")}</AdminLabel>
      <form action={convertApplicationAction} className="grid gap-[8px]">
        <Version row={row} />
        <span className="justify-self-start">
          <AdminButton tone="primary">
            {adminT("admin.applications.next.convert")}
          </AdminButton>
        </span>
        <AdminQuiet>{adminT("admin.applications.next.convertHint")}</AdminQuiet>
      </form>
      <details className="group grid gap-[10px]">
        <summary
          className={`${adminButtonClass("danger")} list-none justify-self-start [&::-webkit-details-marker]:hidden`}
        >
          {adminT("admin.applications.next.reject")}
        </summary>
        <form
          action={rejectApplicationAction}
          className="mt-[10px] grid gap-[10px]"
        >
          <Version row={row} />
          <AdminLabel>
            {adminT("admin.applications.next.rejectTitle")}
          </AdminLabel>
          <AdminField
            id={reasonId}
            label={adminT("admin.applications.next.reason")}
            hint={hint}
          >
            <textarea
              id={reasonId}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={3}
              {...adminFieldAria(reasonId, hint, undefined)}
              className={`${adminControlClass(false)} py-[8px]`}
            />
          </AdminField>
          <span className="justify-self-start">
            <AdminButton tone="danger">
              {adminT("admin.applications.next.rejectSubmit")}
            </AdminButton>
          </span>
        </form>
      </details>
    </AdminCard>
  );
}

export default async function AdminApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("application.manage");
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();
  const { result } = ApplicationResultSchema.parse(await searchParams);
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const row = await applicationById(actor, parsedId.data);
  if (row === undefined) notFound();
  await logAdminRead(actor, "application", row.id);
  const floristCode =
    row.convertedPartnerId === null
      ? undefined
      : await partnerCodeById(actor, row.convertedPartnerId);
  const zone = zoneCity(session.timeZone);
  return (
    <AdminFrame session={session} current="applications">
      <div className="grid gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/applications">
          {adminT("admin.applications.back")}
        </AdminBackLink>
        <AdminRecordHead
          title={row.businessName}
          sub={
            <>
              <ApplicationStatusChip status={row.status} />
              <span>
                {adminT("admin.applications.received", {
                  when: formatDate(
                    row.createdAt,
                    "en",
                    "dayMonthTime",
                    session.timeZone,
                  ),
                  zone,
                })}
              </span>
              <span>
                {adminT("admin.applications.notice", {
                  version: row.privacyNoticeVersion,
                })}
              </span>
            </>
          }
        />
        <ApplicationMessage result={result} />
        <AdminRecordColumns
          main={
            <AdminCard>
              <AdminKeyValues items={details(row)} />
              <AdminQuiet>{adminT("admin.applications.viewLogged")}</AdminQuiet>
            </AdminCard>
          }
          aside={<NextStep row={row} floristCode={floristCode} />}
        />
      </div>
    </AdminFrame>
  );
}
