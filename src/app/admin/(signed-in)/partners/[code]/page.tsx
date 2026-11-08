/**
 * @purpose GET /admin/partners/[code]: one florist, its record and its status
 * @spec 012
 *
 * `partner.edit` or `partner.payout`. The record on two thirds (profile, terms, delivery zones,
 * days off, products and payouts) and the status card on the last third, sticky on the desktop
 * and first at 390 (artboards `admin-partner-detail-{desktop,mobile}.dc.html`). A section the
 * role cannot change renders read only, with no buttons: profile, terms, zones and days off need
 * `partner.edit`, products `partner.payout`, the status `partner.status`.
 *
 * Under Profile, the "Florist sign-in" block (spec 026a AC-10): the contact email as the one
 * sign-in address, and "Not signed in yet" or the day of the first sign-in in the viewer's zone.
 *
 * The status card offers exactly the moves the §2.5 graph allows from this status (AC-16).
 * **Make active is absent, not disabled**, until all four conditions hold, and the card lists
 * each, met or missing (decision 6); the command reads the preflight again under the row lock.
 * A demo florist is offered Offboard only. Every form carries the row's `updated_at`; a stale
 * save changes nothing and says so. The URL carries the code, never a name.
 *
 * Spec 030b (TASK-441): the tab bar under the head (`./tabs.tsx`); this route is the Profile tab
 * and the "Payout terms" tab is a link to its block here (`#terms`).
 */
import { forbidden, notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import {
  adminRequestId,
  adminT,
  can,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatMoney, formatNumber } from "@/modules/i18n";
import { currencyConfig, isCurrencyCode } from "@/config/currencies";
import {
  ACTIVATION_CONDITIONS,
  type FloristSignInStatus,
  type PartnerDetail,
  floristSignInStatus,
  partnerDetail,
} from "@/modules/partners";
import {
  AdminButton,
  adminButtonClass,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  AdminEmpty,
  AdminCode,
  AdminField,
  AdminRow,
  AdminTable,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import {
  AdminBackLink,
  AdminCard,
  AdminChecklist,
  AdminKeyValues,
  AdminLabel,
  AdminQuiet,
  AdminRecordColumns,
  AdminRecordHead,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import {
  type PayoutTermsView,
  payoutTermsOf,
  readPayouts,
} from "@/modules/partners/payouts";

import { AdminFrame } from "../../frame";
import {
  recordTermsAction,
  saveBlackoutAction,
  saveCoverageAction,
  saveMappingAction,
  savePayoutTermsAction,
  setPartnerStatusAction,
  updatePartnerAction,
} from "../actions";
import { ProfileForm } from "../profile-form";
import { PartnerTabBar } from "./tabs";
import {
  type PartnerForm,
  type PartnerResult,
  PartnerMessage,
  PartnerResultSchema,
  PartnerStatusChip,
  fieldError,
} from "../view";

/** A calendar date (`YYYY-MM-DD`) as "2 Oct 2026"; the date is the same in every zone. */
function calendarDay(date: string): string {
  return formatDate(new Date(`${date}T12:00:00Z`), "en", "dayMonthYear", "UTC");
}

/** Whole minor units of `currency` through the one money formatter. */
function money(amountMinor: number, currency: string): string {
  if (!isCurrencyCode(currency)) return formatNumber(amountMinor, "en");
  return formatMoney({ amountMinor, currency }, "en");
}

/** The hidden fields every form of the page carries: the row, its version, its code. */
function versionFields(partner: PartnerDetail): ReactElement {
  return (
    <>
      <input type="hidden" name="partnerId" value={partner.id} />
      <input type="hidden" name="updatedAt" value={partner.updatedAt} />
      <input type="hidden" name="code" value={partner.code} />
    </>
  );
}

/** A form card (`.ad-card.ad-form`): two columns on the desktop, one at 390. */
function FormCard({
  action,
  partner,
  columns = 2,
  children,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly partner: PartnerDetail;
  readonly columns?: 2 | 4;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <form
      action={action}
      className={`bg-card grid grid-cols-1 gap-x-[16px] gap-y-[14px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[20px] md:py-[18px] ${
        columns === 4 ? "md:grid-cols-4" : "md:grid-cols-2"
      }`}
    >
      {versionFields(partner)}
      {children}
    </form>
  );
}

function Actions({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className="col-span-full flex flex-wrap items-center gap-[10px]">
      {children}
    </div>
  );
}

/** One input of a form card, with its refusal from the last save of `form`. */
function Input({
  form,
  field,
  label,
  result,
  type = "text",
  hint,
  inputMode,
  full = false,
}: {
  readonly form: PartnerForm;
  readonly field: string;
  readonly label: string;
  readonly result: PartnerResult;
  readonly type?: "text" | "date";
  readonly hint?: string;
  readonly inputMode?: "numeric";
  readonly full?: boolean;
}): ReactElement {
  const id = `${form}-${field}`;
  const error = fieldError(result, form, field);
  return (
    <AdminField id={id} label={label} hint={hint} error={error} full={full}>
      <input
        id={id}
        name={field}
        type={type}
        {...(inputMode === undefined ? {} : { inputMode })}
        {...adminFieldAria(id, hint, error)}
        className={adminControlClass(error !== undefined)}
      />
    </AdminField>
  );
}

/** A select of a form card. */
function Select({
  form,
  field,
  label,
  result,
  options,
}: {
  readonly form: PartnerForm;
  readonly field: string;
  readonly label: string;
  readonly result: PartnerResult;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}): ReactElement {
  const id = `${form}-${field}`;
  const error = fieldError(result, form, field);
  return (
    <AdminField id={id} label={label} error={error}>
      <select
        id={id}
        name={field}
        {...adminFieldAria(id, undefined, error)}
        className={adminControlClass(error !== undefined)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </AdminField>
  );
}

/** "Add a zone": a ghost button that opens its form in place (no script). */
function AddDisclosure({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <details className="group grid gap-[10px]">
      <summary
        className={`${adminButtonClass("ghost")} list-none justify-self-start [&::-webkit-details-marker]:hidden`}
      >
        {label}
      </summary>
      <div className="mt-[10px]">{children}</div>
    </details>
  );
}

function zoneName(zone: { cityName: string; prefix: string | null }): string {
  return zone.prefix === null
    ? zone.cityName
    : adminT("admin.partners.zones.zoneLabel", {
        city: zone.cityName,
        prefix: zone.prefix,
      });
}

function sizeName(tierKey: string | null, stems: number | null): string {
  if (tierKey === null) return adminT("admin.partners.products.allSizes");
  return stems === null
    ? tierKey
    : adminT("admin.partners.products.stems", { count: stems });
}

function RemoveForm({
  action,
  partner,
  fields,
  label,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly partner: PartnerDetail;
  readonly fields: Readonly<Record<string, string>>;
  readonly label: string;
}): ReactElement {
  return (
    <form action={action} className="inline">
      {versionFields(partner)}
      <input type="hidden" name="op" value="remove" />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <AdminButton tone="ghost" label={label}>
        {adminT("admin.partners.zones.remove")}
      </AdminButton>
    </form>
  );
}

/** A stand-in the address is swapped for, so it renders bold inside the verbatim sentence. */
const ADDRESS_SLOT = "\u0000";

/**
 * The "Florist sign-in" block (spec 026a §2, AC-10; artboards `admin-partner-detail-*`, under
 * Profile): the one address that may sign in, whether it has, and the help line. It reads only;
 * the Profile form is where access moves.
 */
function SignInBlock({
  status,
  timeZone,
}: {
  readonly status: FloristSignInStatus;
  readonly timeZone: string;
}): ReactElement {
  const [before = "", after = ""] = adminT("admin.partners.signIn.address", {
    email: ADDRESS_SLOT,
  }).split(ADDRESS_SLOT);
  const first =
    status.firstSignedInAt === null
      ? undefined
      : adminT("admin.audit.when", {
          time: formatDate(
            new Date(status.firstSignedInAt),
            "en",
            "dayMonthYear",
            timeZone,
          ),
          zone: zoneCity(timeZone),
        });
  return (
    <AdminCard>
      <p className="text-[14px]">
        {before}
        <b>{status.email}</b>
        {after}
      </p>
      <p>
        {first === undefined ? (
          <AdminChip>{adminT("admin.partners.signIn.notYet")}</AdminChip>
        ) : (
          <AdminChip tone="ok">
            {adminT("admin.partners.signIn.firstSignedIn", { date: first })}
          </AdminChip>
        )}
      </p>
      <AdminQuiet>{adminT("admin.partners.signIn.help")}</AdminQuiet>
    </AdminCard>
  );
}

/** The statuses the graph ever moves to; nothing moves into `demo` or `onboarding`. */
type Move = "active" | "paused" | "offboarded";

function isMove(to: string): to is Move {
  return to === "active" || to === "paused" || to === "offboarded";
}

function StatusCard({
  partner,
  canMove,
  result,
}: {
  readonly partner: PartnerDetail;
  readonly canMove: boolean;
  readonly result: PartnerResult;
}): ReactElement {
  const unmet = ACTIVATION_CONDITIONS.filter(
    (condition) => !partner.preflight[condition],
  );
  const channel = partner.notificationChannel;
  const conditionText = (condition: (typeof ACTIVATION_CONDITIONS)[number]) => {
    const state = partner.preflight[condition] ? "met" : "missing";
    if (condition === "contact") {
      return adminT(`admin.partners.state.condition.contact.${state}`, {
        channel,
      });
    }
    return adminT(`admin.partners.state.condition.${condition}.${state}`);
  };
  // The moves the graph allows; `→ active` only while every condition holds (decision 6).
  const moves = partner.moves
    .filter(isMove)
    .filter((to) => to !== "active" || unmet.length === 0);
  const showChecklist = partner.moves.includes("active");
  return (
    <AdminCard>
      <AdminLabel>{adminT("admin.partners.state.title")}</AdminLabel>
      <div>
        <PartnerStatusChip status={partner.status} />
      </div>
      <PartnerMessage result={result} form="status" />
      {partner.status === "demo" ? (
        <AdminQuiet>{adminT("admin.partners.state.demo")}</AdminQuiet>
      ) : null}
      {partner.status === "offboarded" ? (
        <AdminQuiet>{adminT("admin.partners.state.offboarded")}</AdminQuiet>
      ) : null}
      {showChecklist ? (
        <>
          <span className="mt-[4px]">
            <AdminLabel>{adminT("admin.partners.state.before")}</AdminLabel>
          </span>
          <AdminChecklist
            checks={ACTIVATION_CONDITIONS.map((condition) => ({
              key: condition,
              met: partner.preflight[condition],
              text: conditionText(condition),
            }))}
            metLabel={adminT("admin.partners.state.met")}
            missingLabel={adminT("admin.partners.state.missing")}
          />
          {unmet.length > 0 ? (
            <AdminQuiet>{adminT("admin.partners.state.appears")}</AdminQuiet>
          ) : null}
        </>
      ) : null}
      {!canMove ? (
        partner.moves.length > 0 ? (
          <AdminQuiet>{adminT("admin.partners.state.readOnly")}</AdminQuiet>
        ) : null
      ) : moves.length > 0 ? (
        <div className="flex flex-wrap gap-[8px]">
          {moves.map((to) => (
            <form key={to} action={setPartnerStatusAction}>
              {versionFields(partner)}
              <input type="hidden" name="to" value={to} />
              <AdminButton
                tone={
                  to === "active"
                    ? "primary"
                    : to === "offboarded"
                      ? "danger"
                      : "ghost"
                }
              >
                {adminT(`admin.partners.state.move.${to}`)}
              </AdminButton>
            </form>
          ))}
        </div>
      ) : null}
    </AdminCard>
  );
}

/**
 * Spec 030a §2.1, §2.8 (TASK-367; artboard `admin-partner-detail-*` "Payout terms"): cadence,
 * prepaid limit with "used n of m", Wise recipient id. `partner.payout` edits; a role without it
 * reads the values and the reason, with no control. "Not set" says what a missing Wise id blocks.
 */
function PayoutTermsBlock({
  partner,
  terms,
  canPay,
  result,
}: {
  readonly partner: PartnerDetail;
  readonly terms: PayoutTermsView;
  readonly canPay: boolean;
  readonly result: PartnerResult;
}): ReactElement {
  const prepaidHint = adminT("admin.partners.payoutTerms.prepaidHint", {
    used: formatNumber(terms.prepaidUsed, "en"),
    limit: formatNumber(terms.prepaidOrderLimit, "en"),
  });
  const notSet =
    terms.wiseRecipientId === null ? (
      <AdminQuiet>{adminT("admin.partners.payoutTerms.notSet")}</AdminQuiet>
    ) : null;
  if (!canPay) {
    return (
      <AdminCard>
        <AdminKeyValues
          items={[
            {
              key: "cadence",
              label: adminT("admin.partners.payoutTerms.cadence"),
              value: adminT(
                `admin.partners.payoutTerms.cadenceOption.${terms.cadence}`,
              ),
            },
            {
              key: "prepaid",
              label: adminT("admin.partners.payoutTerms.prepaid"),
              value: prepaidHint,
            },
            {
              key: "wise",
              label: adminT("admin.partners.payoutTerms.wise"),
              value:
                terms.wiseRecipientId ??
                adminT("admin.partners.payoutTerms.wiseNone"),
              numeric: true,
            },
          ]}
        />
        {notSet}
        <AdminQuiet>{adminT("admin.partners.payoutTerms.readOnly")}</AdminQuiet>
      </AdminCard>
    );
  }
  const cadenceId = "payoutTerms-cadence";
  const cadenceError = fieldError(result, "payoutTerms", "cadence");
  const cadenceHint = adminT("admin.partners.payoutTerms.cadenceHint");
  const limitId = "payoutTerms-prepaidOrderLimit";
  const limitError = fieldError(result, "payoutTerms", "prepaidOrderLimit");
  const wiseId = "payoutTerms-wiseRecipientId";
  const wiseError = fieldError(result, "payoutTerms", "wiseRecipientId");
  const wiseHint = adminT("admin.partners.payoutTerms.wiseHint");
  return (
    <FormCard action={savePayoutTermsAction} partner={partner}>
      <AdminField
        id={cadenceId}
        label={adminT("admin.partners.payoutTerms.cadence")}
        hint={cadenceHint}
        error={cadenceError}
      >
        <select
          id={cadenceId}
          name="cadence"
          defaultValue={terms.cadence}
          {...adminFieldAria(cadenceId, cadenceHint, cadenceError)}
          className={adminControlClass(cadenceError !== undefined)}
        >
          {(["weekly", "per_order"] as const).map((cadence) => (
            <option key={cadence} value={cadence}>
              {adminT(`admin.partners.payoutTerms.cadenceOption.${cadence}`)}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField
        id={limitId}
        label={adminT("admin.partners.payoutTerms.prepaid")}
        hint={prepaidHint}
        error={limitError}
      >
        <input
          id={limitId}
          name="prepaidOrderLimit"
          type="text"
          inputMode="numeric"
          defaultValue={String(terms.prepaidOrderLimit)}
          {...adminFieldAria(limitId, prepaidHint, limitError)}
          className={adminControlClass(limitError !== undefined)}
        />
      </AdminField>
      <AdminField
        id={wiseId}
        label={adminT("admin.partners.payoutTerms.wise")}
        hint={wiseHint}
        error={wiseError}
        full
      >
        <input
          id={wiseId}
          name="wiseRecipientId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={terms.wiseRecipientId ?? ""}
          {...adminFieldAria(wiseId, wiseHint, wiseError)}
          className={adminControlClass(wiseError !== undefined)}
        />
      </AdminField>
      <Actions>
        <AdminButton>{adminT("admin.partners.payoutTerms.save")}</AdminButton>
        {notSet}
      </Actions>
    </FormCard>
  );
}

export default async function AdminPartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage();
  const canEdit = can(session.roles, "partner.edit");
  const canPay = can(session.roles, "partner.payout");
  if (!canEdit && !canPay) forbidden();
  const { code } = await params;
  const result = PartnerResultSchema.parse(await searchParams);
  const partner = await partnerDetail(
    { userId: session.userId, requestId: await adminRequestId() },
    code,
  );
  if (partner === undefined) notFound();
  const signIn = await floristSignInStatus(
    { userId: session.userId, requestId: await adminRequestId() },
    partner.id,
  );
  const payoutTerms = await readPayouts(
    { userId: session.userId, requestId: await adminRequestId() },
    (executor) => payoutTermsOf(executor, partner.id),
  );
  const zone = zoneCity(session.timeZone);
  const updated = formatDate(
    partner.updatedAtInstant,
    "en",
    "dayMonthTime",
    session.timeZone,
  );
  // One whole unit of the payout currency in minor units (100 for PLN, 1 for HUF), for the hint.
  const exponentUnit = isCurrencyCode(partner.payoutCurrency)
    ? 10 ** currencyConfig(partner.payoutCurrency).minorUnitExponent
    : undefined;
  const terms =
    partner.termsSignedAt === null || partner.termsVersion === null
      ? undefined
      : {
          date: calendarDay(partner.termsSignedAt),
          version: partner.termsVersion,
        };

  const profile = canEdit ? (
    <ProfileForm
      action={updatePartnerAction}
      values={{
        legalName: partner.legalName,
        cityLabel: partner.cityLabel,
        countryIso2: partner.countryIso2,
        notificationChannel: partner.notificationChannel,
        contactEmail: partner.contactEmail,
        contactPhone: partner.contactPhone ?? "",
        payoutCurrency: partner.payoutCurrency,
        capacityPerDay: String(partner.capacityPerDay),
      }}
      hidden={{
        partnerId: partner.id,
        updatedAt: partner.updatedAt,
        code: partner.code,
      }}
      countries={partner.options.countries}
      currencies={partner.options.currencies}
      result={result}
      submitLabel={adminT("admin.partners.profile.save")}
      note={adminT("admin.partners.profile.saveNote")}
    />
  ) : (
    <AdminCard>
      <AdminKeyValues
        items={[
          {
            key: "legalName",
            label: adminT("admin.partners.profile.legalName"),
            value: partner.legalName,
          },
          {
            key: "cityLabel",
            label: adminT("admin.partners.profile.cityLabel"),
            value: partner.cityLabel,
          },
          {
            key: "country",
            label: adminT("admin.partners.profile.country"),
            value: partner.countryName,
          },
          {
            key: "channel",
            label: adminT("admin.partners.profile.channel"),
            value: adminT(
              partner.notificationChannel === "whatsapp"
                ? "admin.partners.channel.whatsapp"
                : "admin.partners.channel.email",
            ),
          },
          {
            key: "currency",
            label: adminT("admin.partners.profile.currency"),
            value: partner.payoutCurrency,
          },
          {
            key: "capacity",
            label: adminT("admin.partners.profile.capacity"),
            value: formatNumber(partner.capacityPerDay, "en"),
            numeric: true,
          },
        ]}
      />
      <AdminQuiet>{adminT("admin.partners.profile.readOnly")}</AdminQuiet>
    </AdminCard>
  );

  const termsBlock = canEdit ? (
    <FormCard action={recordTermsAction} partner={partner}>
      <Input
        form="terms"
        field="signedOn"
        type="date"
        label={adminT("admin.partners.terms.signedOn")}
        result={result}
      />
      <Input
        form="terms"
        field="version"
        label={adminT("admin.partners.terms.version")}
        result={result}
      />
      <Actions>
        <AdminButton>{adminT("admin.partners.terms.record")}</AdminButton>
        <AdminQuiet>
          {terms === undefined
            ? adminT("admin.partners.terms.note")
            : adminT("admin.partners.terms.recorded", terms)}
        </AdminQuiet>
      </Actions>
    </FormCard>
  ) : (
    <AdminCard>
      <AdminQuiet>
        {terms === undefined
          ? adminT("admin.partners.termsNone")
          : adminT("admin.partners.terms.recorded", terms)}
      </AdminQuiet>
    </AdminCard>
  );

  const zones = (
    <>
      {partner.zones.length === 0 ? (
        <AdminEmpty title={adminT("admin.partners.zones.empty")} />
      ) : (
        <AdminTable
          columns={[
            { key: "zone", label: adminT("admin.partners.zones.zone") },
            { key: "kind", label: adminT("admin.partners.zones.kind") },
            {
              key: "capacity",
              label: adminT("admin.partners.zones.capacity"),
              align: "end",
            },
            ...(canEdit
              ? [
                  {
                    key: "remove",
                    label: adminT("admin.partners.zones.remove"),
                    hidden: true,
                    align: "end" as const,
                  },
                ]
              : []),
          ]}
        >
          {partner.zones.map((entry) => (
            <AdminRow key={entry.id}>
              <AdminCell>{zoneName(entry)}</AdminCell>
              <AdminCell>
                {entry.prefix === null
                  ? adminT("admin.partners.zones.city")
                  : adminT("admin.partners.zones.postcodes")}
              </AdminCell>
              <AdminCell align="end">
                {entry.capacityPerDay === null
                  ? adminT("admin.partners.zones.own")
                  : formatNumber(entry.capacityPerDay, "en")}
              </AdminCell>
              {canEdit ? (
                <AdminCell align="end">
                  <RemoveForm
                    action={saveCoverageAction}
                    partner={partner}
                    fields={{ coverageId: entry.id }}
                    label={adminT("admin.partners.zones.removeLabel", {
                      zone: zoneName(entry),
                    })}
                  />
                </AdminCell>
              ) : null}
            </AdminRow>
          ))}
        </AdminTable>
      )}
      {canEdit ? (
        partner.options.coverage.length === 0 ? (
          <AdminQuiet>{adminT("admin.partners.zones.none")}</AdminQuiet>
        ) : (
          <AddDisclosure label={adminT("admin.partners.zones.add")}>
            <FormCard action={saveCoverageAction} partner={partner}>
              <input type="hidden" name="op" value="add" />
              <Select
                form="zones"
                field="target"
                label={adminT("admin.partners.zones.zone")}
                result={result}
                options={partner.options.coverage.map((option) => ({
                  value: option.value,
                  label: zoneName(option),
                }))}
              />
              <Input
                form="zones"
                field="capacityPerDay"
                inputMode="numeric"
                label={adminT("admin.partners.zones.capacityOptional")}
                result={result}
              />
              <Actions>
                <AdminButton>{adminT("admin.partners.zones.add")}</AdminButton>
              </Actions>
            </FormCard>
          </AddDisclosure>
        )
      ) : null}
    </>
  );

  const daysOff = (
    <>
      {partner.daysOff.length === 0 ? (
        <AdminEmpty title={adminT("admin.partners.daysOff.empty")} />
      ) : (
        <AdminTable
          columns={[
            { key: "date", label: adminT("admin.partners.daysOff.date") },
            { key: "reason", label: adminT("admin.partners.daysOff.reason") },
            ...(canEdit
              ? [
                  {
                    key: "remove",
                    label: adminT("admin.partners.daysOff.remove"),
                    hidden: true,
                    align: "end" as const,
                  },
                ]
              : []),
          ]}
        >
          {partner.daysOff.map((day) => (
            <AdminRow key={day.date}>
              <AdminCell nowrap>{calendarDay(day.date)}</AdminCell>
              <AdminCell>{day.reason ?? ""}</AdminCell>
              {canEdit ? (
                <AdminCell align="end">
                  <RemoveForm
                    action={saveBlackoutAction}
                    partner={partner}
                    fields={{ date: day.date }}
                    label={adminT("admin.partners.daysOff.removeLabel", {
                      date: calendarDay(day.date),
                    })}
                  />
                </AdminCell>
              ) : null}
            </AdminRow>
          ))}
        </AdminTable>
      )}
      {canEdit ? (
        <AddDisclosure label={adminT("admin.partners.daysOff.add")}>
          <FormCard action={saveBlackoutAction} partner={partner}>
            <input type="hidden" name="op" value="add" />
            <Input
              form="daysOff"
              field="date"
              type="date"
              label={adminT("admin.partners.daysOff.date")}
              result={result}
            />
            <Input
              form="daysOff"
              field="reason"
              label={adminT("admin.partners.daysOff.reason")}
              result={result}
            />
            <Actions>
              <AdminButton>{adminT("admin.partners.daysOff.add")}</AdminButton>
            </Actions>
          </FormCard>
        </AddDisclosure>
      ) : null}
    </>
  );

  const products = (
    <>
      {canPay ? (
        <FormCard action={saveMappingAction} partner={partner} columns={4}>
          <input type="hidden" name="op" value="save" />
          <input type="hidden" name="currency" value={partner.payoutCurrency} />
          <Select
            form="products"
            field="product"
            label={adminT("admin.partners.products.product")}
            result={result}
            options={partner.options.products}
          />
          <Select
            form="products"
            field="size"
            label={adminT("admin.partners.products.size")}
            result={result}
            options={[
              { value: "", label: adminT("admin.partners.products.allSizes") },
              ...partner.options.sizes.map((size) => ({
                value: size.tierKey,
                label: sizeName(size.tierKey, size.stems),
              })),
            ]}
          />
          <Select
            form="products"
            field="canFulfil"
            label={adminT("admin.partners.products.canMake")}
            result={result}
            options={[
              { value: "yes", label: adminT("admin.partners.products.yes") },
              { value: "no", label: adminT("admin.partners.products.no") },
            ]}
          />
          <Input
            form="products"
            field="payoutMinor"
            inputMode="numeric"
            label={adminT("admin.partners.products.payoutField", {
              currency: partner.payoutCurrency,
            })}
            result={result}
          />
          <Actions>
            <AdminButton>{adminT("admin.partners.products.add")}</AdminButton>
            {exponentUnit === undefined ? null : (
              <AdminQuiet>
                {adminT("admin.partners.products.hint", {
                  example: money(exponentUnit, partner.payoutCurrency),
                  minor: formatNumber(exponentUnit, "en"),
                })}
              </AdminQuiet>
            )}
          </Actions>
        </FormCard>
      ) : null}
      {partner.mappings.length === 0 ? (
        <AdminEmpty title={adminT("admin.partners.products.empty")} />
      ) : (
        <AdminTable
          columns={[
            {
              key: "product",
              label: adminT("admin.partners.products.product"),
            },
            { key: "size", label: adminT("admin.partners.products.size") },
            {
              key: "canMake",
              label: adminT("admin.partners.products.canMake"),
            },
            {
              key: "payout",
              label: adminT("admin.partners.products.payout"),
              align: "end",
            },
            ...(canPay
              ? [
                  {
                    key: "remove",
                    label: adminT("admin.partners.products.remove"),
                    hidden: true,
                    align: "end" as const,
                  },
                ]
              : []),
          ]}
        >
          {partner.mappings.map((mapping) => (
            <AdminRow key={mapping.id} muted={!mapping.canFulfil}>
              <AdminCell>{mapping.productName}</AdminCell>
              <AdminCell>{sizeName(mapping.tierKey, mapping.stems)}</AdminCell>
              <AdminCell>
                {mapping.canFulfil
                  ? adminT("admin.partners.products.yes")
                  : adminT("admin.partners.products.no")}
              </AdminCell>
              <AdminCell align="end">
                {money(mapping.payoutMinor, mapping.currency)}
              </AdminCell>
              {canPay ? (
                <AdminCell align="end">
                  <form action={saveMappingAction} className="inline">
                    {versionFields(partner)}
                    <input type="hidden" name="op" value="remove" />
                    <input type="hidden" name="mappingId" value={mapping.id} />
                    <AdminButton
                      tone="ghost"
                      label={adminT("admin.partners.products.removeLabel", {
                        product: `${mapping.productName} ${sizeName(mapping.tierKey, mapping.stems)}`,
                      })}
                    >
                      {adminT("admin.partners.products.remove")}
                    </AdminButton>
                  </form>
                </AdminCell>
              ) : null}
            </AdminRow>
          ))}
        </AdminTable>
      )}
      {canPay ? null : (
        <AdminQuiet>{adminT("admin.partners.products.readOnly")}</AdminQuiet>
      )}
    </>
  );

  return (
    <AdminFrame session={session} current="partners">
      <div className="grid gap-[16px] md:gap-[20px]">
        <AdminBackLink href="/admin/partners">
          {adminT("admin.partners.back")}
        </AdminBackLink>
        <AdminRecordHead
          title={partner.legalName}
          sub={
            <>
              <code>{partner.code}</code>
              <span>
                {adminT("admin.partners.where", {
                  city: partner.cityLabel,
                  country: partner.countryName,
                })}
              </span>
              <span>
                {adminT("admin.partners.updated", { when: updated, zone })}
              </span>
            </>
          }
        />
        <PartnerTabBar
          roles={session.roles}
          code={partner.code}
          current="profile"
        />
        <PartnerMessage result={result} form="page" />
        <AdminRecordColumns
          main={
            <>
              <AdminSection title={adminT("admin.partners.profile.title")}>
                <PartnerMessage result={result} form="profile" />
                {profile}
              </AdminSection>
              {signIn === undefined ? null : (
                <AdminSection title={adminT("admin.partners.signIn.heading")}>
                  <SignInBlock status={signIn} timeZone={session.timeZone} />
                </AdminSection>
              )}
              <AdminSection title={adminT("admin.partners.terms.title")}>
                <PartnerMessage result={result} form="terms" />
                {termsBlock}
              </AdminSection>
              <AdminSection title={adminT("admin.partners.zones.title")}>
                <PartnerMessage result={result} form="zones" />
                {zones}
              </AdminSection>
              <AdminSection title={adminT("admin.partners.daysOff.title")}>
                <PartnerMessage result={result} form="daysOff" />
                {daysOff}
              </AdminSection>
              <AdminSection title={adminT("admin.partners.products.title")}>
                <PartnerMessage result={result} form="products" />
                {products}
              </AdminSection>
              {payoutTerms === undefined ? null : (
                <div id="terms" className="grid scroll-mt-[20px]">
                  <AdminSection
                    title={adminT("admin.partners.payoutTerms.title")}
                    note={
                      <AdminCode>
                        {adminT("admin.partners.payoutTerms.permission")}
                      </AdminCode>
                    }
                  >
                    <PartnerMessage result={result} form="payoutTerms" />
                    <PayoutTermsBlock
                      partner={partner}
                      terms={payoutTerms}
                      canPay={canPay}
                      result={result}
                    />
                  </AdminSection>
                </div>
              )}
            </>
          }
          aside={
            <StatusCard
              partner={partner}
              canMove={can(session.roles, "partner.status")}
              result={result}
            />
          }
        />
      </div>
    </AdminFrame>
  );
}
